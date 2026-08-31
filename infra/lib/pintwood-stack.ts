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
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as logs from 'aws-cdk-lib/aws-logs';
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

    // ── Registration Lambda (durable) ────────────────────────────────────────
    const registrationFn = new lambda.NodejsFunction(this, 'RegistrationFn', {
      entry: path.join(__dirname, '../../lambda/submit-registration/index.ts'),
      handler: 'handler',
      runtime: cdk.aws_lambda.Runtime.NODEJS_24_X,
      timeout: cdk.Duration.seconds(30),
      projectRoot: path.join(__dirname, '../..'),
      depsLockFilePath: path.join(__dirname, '../../lambda/submit-registration/package-lock.json'),
      durableConfig: {
        executionTimeout: cdk.Duration.hours(1),
        retentionPeriod: cdk.Duration.days(30),
      },
      environment: {
        SSM_SPREADSHEET_ID:        `${ssmPrefix}/REGISTRATION_SPREADSHEET_ID`,
        SSM_SHEET_NAME:            `${ssmPrefix}/REGISTRATION_SHEET_NAME`,
        SSM_SA_EMAIL:              `${ssmPrefix}/GOOGLE_SERVICE_ACCOUNT_EMAIL`,
        SSM_SA_KEY:                `${ssmPrefix}/GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`,
        SSM_SENDGRID_KEY:          `${ssmPrefix}/SENDGRID_API_KEY`,
        SSM_RECAPTCHA_SECRET:      `${ssmPrefix}/RECAPTCHA_SECRET_KEY`,
        DYNAMODB_TABLE_NAME:       registrationsTable.tableName,
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

    // Publish a version and create a prod alias (durable functions require qualified ARNs)
    const registrationFnVersion = registrationFn.currentVersion;
    const registrationFnAlias = new lambdaBase.Alias(this, 'RegistrationFnProdAlias', {
      aliasName: 'prod',
      version: registrationFnVersion,
    });

    // Note: permission to allow API Gateway to invoke the Lambda alias is added
    // after the `httpApi` is created below because it requires the API's ARN.

    // Grant Lambda read access to each SSM SecureString
    for (const param of [spreadsheetId, sheetName, saEmail, saKey, sendgridKey, recaptchaSecret]) {
      param.grantRead(registrationFn);
    }

    registrationsTable.grantWriteData(registrationFn);
    notificationTopic.grantPublish(registrationFn);

    // ── API Gateway HTTP API ──────────────────────────────────────────────────
    const httpApi = new HttpApi(this, 'HttpApi', {
      corsPreflight: {
        allowOrigins: ['*'],
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
      integration: new HttpLambdaIntegration('RegistrationIntegration', registrationFnAlias),
    });

    // Ensure API Gateway can invoke the Lambda alias (HttpApi integrations require explicit permission)
    registrationFnAlias.addPermission('AllowApiGatewayInvoke', {
      principal: new iam.ServicePrincipal('apigateway.amazonaws.com'),
      action: 'lambda:InvokeFunction',
      // Allow invocations from this HTTP API (all routes/stages)
      // arnForExecuteApi returns arn:aws:execute-api:${region}:${account}:${apiId}
      sourceArn: `${httpApi.arnForExecuteApi()}/*/*`,
    });

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
        latency: '$context.responseLatency'
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
      value: httpApi.apiEndpoint + '/submit-registration',
      description: 'API Gateway endpoint (use as HUGO_PARAMS_APIENDPOINT)',
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
