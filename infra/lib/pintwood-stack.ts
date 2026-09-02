import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as lambda from 'aws-cdk-lib/aws-lambda-nodejs';
import * as lambdaBase from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as snsSubscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import { HttpApi, HttpMethod, CorsHttpMethod } from 'aws-cdk-lib/aws-apigatewayv2';
import * as apigatewayv2 from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import { SqsEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as crypto from 'crypto';
import { Construct } from 'constructs';
import * as path from 'path';

export interface PintwoodStackProps extends cdk.StackProps {
  stackEnv: string;
}

export class PintwoodStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: PintwoodStackProps) {
    super(scope, id, props);

    const ssmPrefix = `/pintwood/${props.stackEnv}`;

    // ── DynamoDB registrations table ─────────────────────────────────────────
    const registrationsTable = new dynamodb.Table(this, 'RegistrationsTable', {
      partitionKey: { name: 'registrationId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecovery: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // ── SNS notification topic ────────────────────────────────────────────────
    const notificationTopic = new sns.Topic(this, 'RegistrationNotificationTopic', {
      displayName: 'Pintwood Derby Registration Notifications',
    });
    notificationTopic.addSubscription(new snsSubscriptions.EmailSubscription('kgittemeier@gmail.com'));
    notificationTopic.addSubscription(new snsSubscriptions.EmailSubscription('imonthercks@gmail.com'));

    // ── Static site bucket ───────────────────────────────────────────────────
    const siteBucket = new s3.Bucket(this, 'SiteBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      versioned: true,
    });

    // Secret shared between CloudFront and the accept Lambda — bots hitting APIGW directly won't have it
    const originVerifySecret = crypto.randomBytes(32).toString('hex');

    // CloudFront Function: block requests whose Origin header doesn't match the site
    const originCheckFn = new cloudfront.Function(this, 'OriginCheckFn', {
      code: cloudfront.FunctionCode.fromInline(`
function handler(event) {
  var origin = (event.request.headers.origin || {value:''}).value;
  if (origin !== 'https://thepintwood.com' &&
      !origin.match(/^https:\/\/[a-z0-9]+\.cloudfront\.net$/)) {
    return { statusCode: 403, statusDescription: 'Forbidden' };
  }
  return event.request;
}
`),
      runtime: cloudfront.FunctionRuntime.JS_2_0,
    });

    // ── CloudFront distribution ───────────────────────────────────────────────
    const distribution = new cloudfront.Distribution(this, 'Distribution', {
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(siteBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
      },
      defaultRootObject: 'index.html',
      errorResponses: [
        {
          httpStatus: 403,
          responseHttpStatus: 404,
          responsePagePath: '/404.html',
        },
        {
          httpStatus: 404,
          responseHttpStatus: 404,
          responsePagePath: '/404.html',
        },
      ],
    });

    // ── SSM parameters (values written by deploy-secrets workflow) ────────────
    const spreadsheetId = ssm.StringParameter.fromSecureStringParameterAttributes(
      this, 'SpreadsheetId',
      { parameterName: `${ssmPrefix}/REGISTRATION_SPREADSHEET_ID` },
    );
    const sheetName = ssm.StringParameter.fromSecureStringParameterAttributes(
      this, 'SheetName',
      { parameterName: `${ssmPrefix}/REGISTRATION_SHEET_NAME` },
    );
    const saEmail = ssm.StringParameter.fromSecureStringParameterAttributes(
      this, 'SAEmail',
      { parameterName: `${ssmPrefix}/GOOGLE_SERVICE_ACCOUNT_EMAIL` },
    );
    const saKey = ssm.StringParameter.fromSecureStringParameterAttributes(
      this, 'SAKey',
      { parameterName: `${ssmPrefix}/GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` },
    );
    const sendgridKey = ssm.StringParameter.fromSecureStringParameterAttributes(
      this, 'SendgridKey',
      { parameterName: `${ssmPrefix}/SENDGRID_API_KEY` },
    );
    const recaptchaSecret = ssm.StringParameter.fromSecureStringParameterAttributes(
      this, 'RecaptchaSecret',
      { parameterName: `${ssmPrefix}/RECAPTCHA_SECRET_KEY` },
    );

    // ── SQS registration queue ───────────────────────────────────────────────
    const registrationQueue = new sqs.Queue(this, 'RegistrationQueue', {
      // visibility timeout must cover max durable execution time
      visibilityTimeout: cdk.Duration.minutes(14),
      retentionPeriod: cdk.Duration.days(1),
    });

    // ── Accept Lambda — thin HTTP handler: validates honeypot, enqueues to SQS
    const acceptRegistrationFn = new lambda.NodejsFunction(this, 'AcceptRegistrationFn', {
      entry: path.join(__dirname, '../../lambda/accept-registration/index.ts'),
      handler: 'handler',
      runtime: cdk.aws_lambda.Runtime.NODEJS_24_X,
      timeout: cdk.Duration.seconds(10),
      projectRoot: path.join(__dirname, '../..'),
      depsLockFilePath: path.join(__dirname, '../../lambda/accept-registration/package-lock.json'),
      environment: {
        REGISTRATION_QUEUE_URL: registrationQueue.queueUrl,
      },
    });
    registrationQueue.grantSendMessages(acceptRegistrationFn);

    // ── Registration Lambda (durable) — SQS consumer ─────────────────────────
    const registrationFn = new lambda.NodejsFunction(this, 'RegistrationFn', {
      entry: path.join(__dirname, '../../lambda/submit-registration/index.ts'),
      handler: 'handler',
      runtime: cdk.aws_lambda.Runtime.NODEJS_24_X,
      timeout: cdk.Duration.seconds(30),
      projectRoot: path.join(__dirname, '../..'),
      depsLockFilePath: path.join(__dirname, '../../lambda/submit-registration/package-lock.json'),
      durableConfig: {
        // SQS event source mappings cap at 15 minutes
        executionTimeout: cdk.Duration.minutes(14),
        retentionPeriod: cdk.Duration.days(30),
      },
      environment: {
        SSM_SPREADSHEET_ID:         `${ssmPrefix}/REGISTRATION_SPREADSHEET_ID`,
        SSM_SHEET_NAME:             `${ssmPrefix}/REGISTRATION_SHEET_NAME`,
        SSM_SA_EMAIL:               `${ssmPrefix}/GOOGLE_SERVICE_ACCOUNT_EMAIL`,
        SSM_SA_KEY:                 `${ssmPrefix}/GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`,
        SSM_SENDGRID_KEY:           `${ssmPrefix}/SENDGRID_API_KEY`,
        SSM_RECAPTCHA_SECRET:       `${ssmPrefix}/RECAPTCHA_SECRET_KEY`,
        DYNAMODB_TABLE_NAME:        registrationsTable.tableName,
        SNS_NOTIFICATION_TOPIC_ARN: notificationTopic.topicArn,
      },
      bundling: {
        externalModules: [],
        // copy email template into the Lambda bundle
        commandHooks: {
          beforeBundling: () => [],
          beforeInstall: () => [],
          afterBundling: (inputDir: string, outputDir: string) => [
            `cp ${inputDir}/lambda/submit-registration/email-template.html ${outputDir}/`,
          ],
        },
      },
    });

    // Required for durable execution checkpoint operations
    registrationFn.role!.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicDurableExecutionRolePolicy'),
    );

    // Durable functions require a qualified ARN — publish a version + alias
    const registrationFnAlias = new lambdaBase.Alias(this, 'RegistrationFnProdAlias', {
      aliasName: 'prod',
      version: registrationFn.currentVersion,
    });

    // Trigger the durable Lambda from SQS
    registrationFnAlias.addEventSource(new SqsEventSource(registrationQueue, {
      batchSize: 1,
    }));

    // Grant Lambda read access to each SSM SecureString
    for (const param of [spreadsheetId, sheetName, saEmail, saKey, sendgridKey, recaptchaSecret]) {
      param.grantRead(registrationFn);
    }

    registrationsTable.grantWriteData(registrationFn);
    notificationTopic.grantPublish(registrationFn);

    // ── API Gateway HTTP API ──────────────────────────────────────────────────
    const httpApi = new HttpApi(this, 'HttpApi', {
      corsPreflight: {
        // only the site's own domains can POST — tightened from '*'
        allowOrigins: ['https://thepintwood.com', `https://${distribution.distributionDomainName}`],
        allowMethods: [CorsHttpMethod.POST],
        allowHeaders: ['Content-Type'],
      },
    });

    // Create a CloudWatch Log Group for API access logs
    const apiAccessLogGroup = new logs.LogGroup(this, 'HttpApiAccessLogs', {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      retention: logs.RetentionDays.ONE_WEEK,
    });

    httpApi.addRoutes({
      path: '/submit-registration',
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration('RegistrationIntegration', acceptRegistrationFn),
    });

    // ── Route /api/submit-registration through the existing CloudFront distribution ──
    // CloudFront injects x-origin-verify; Lambda rejects requests missing it
    const apiOrigin = new origins.HttpOrigin(
      `${httpApi.apiId}.execute-api.${this.region}.amazonaws.com`,
      {
        customHeaders: { 'x-origin-verify': originVerifySecret },
        protocolPolicy: cloudfront.OriginProtocolPolicy.HTTPS_ONLY,
      },
    );

    distribution.addBehavior('/api/submit-registration', apiOrigin, {
      allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
      cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
      originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
      viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      functionAssociations: [{
        function: originCheckFn,
        eventType: cloudfront.FunctionEventType.VIEWER_REQUEST,
      }],
    });

    // Pass the secret to the accept Lambda so it can reject direct APIGW calls
    acceptRegistrationFn.addEnvironment('ORIGIN_VERIFY_SECRET', originVerifySecret);

    // Apply stage-level throttling to protect Lambda from excessive invocations
    const cfnStage = httpApi.defaultStage!.node.defaultChild as apigatewayv2.CfnStage;
    cfnStage.defaultRouteSettings = {
      throttlingRateLimit: 5,
      throttlingBurstLimit: 10,
    };

    // Enable access logging for the HTTP API
    cfnStage.accessLogSettings = {
      destinationArn: apiAccessLogGroup.logGroupArn,
      format: JSON.stringify({
        requestId: '$context.requestId',
        ip: '$context.identity.sourceIp',
        requestTime: '$context.requestTime',
        httpMethod: '$context.httpMethod',
        path: '$context.path',
        status: '$context.status',
        latency: '$context.responseLatency',
        integrationError: '$context.integrationErrorMessage',
      }),
    };

    // Allow API Gateway to write to the LogGroup
    apiAccessLogGroup.grantWrite(new iam.ServicePrincipal('apigateway.amazonaws.com'));

    // ── Outputs ───────────────────────────────────────────────────────────────
    new cdk.CfnOutput(this, 'CloudFrontDomain', {
      value: distribution.distributionDomainName,
      description: 'CloudFront domain for testing (use as HUGO_BASEURL)',
    });
    new cdk.CfnOutput(this, 'ApiEndpoint', {
      value: `https://${distribution.distributionDomainName}/api/submit-registration`,
      description: 'CloudFront API endpoint (use as HUGO_PARAMS_APIENDPOINT)',
    });
    new cdk.CfnOutput(this, 'SiteBucketName', {
      value: siteBucket.bucketName,
      description: 'S3 bucket name for hugo build sync',
    });
    new cdk.CfnOutput(this, 'DistributionId', {
      value: distribution.distributionId,
      description: 'CloudFront distribution ID for cache invalidation',
    });
  }
}
