import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
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
import * as wafv2 from 'aws-cdk-lib/aws-wafv2';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as targets from 'aws-cdk-lib/aws-route53-targets';
import * as crypto from 'crypto';
import { Construct } from 'constructs';
import * as path from 'path';

export interface PintwoodStackProps extends cdk.StackProps {
  stackEnv: string;
  // ID of the hosted zone created by PintwoodDnsStack; omit to skip creating alias records
  // (e.g. on first deploy, before the DNS stack exists).
  hostedZoneId?: string;
}

export class PintwoodStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: PintwoodStackProps) {
    super(scope, id, props);

    const ssmPrefix = `/pintwood/${props.stackEnv}`;
    // Custom domain only applies to production; staging stays on its *.cloudfront.net domain.
    const isProduction = props.stackEnv === 'production';
    const domainName = 'thepintwood.com';

    // Must be requested in us-east-1 for CloudFront; validate by adding the printed
    // CNAME to Netlify DNS while `cdk deploy` waits for the cert to be issued.
    const certificate = isProduction
      ? new acm.Certificate(this, 'SiteCertificate', {
          domainName,
          validation: acm.CertificateValidation.fromDns(),
        })
      : undefined;

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
    // Distributions with a pricing plan subscription must reference a web ACL.
    // Production gets its own managed WebACL (must live in us-east-1 for CLOUDFRONT scope);
    // staging keeps reusing the ACL the console auto-created when the pricing plan was enabled.
    const webAcl = isProduction
      ? new wafv2.CfnWebACL(this, 'SiteWebAcl', {
          name: `pintwood-${props.stackEnv}-site-web-acl`,
          defaultAction: { allow: {} },
          scope: 'CLOUDFRONT',
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: 'PintwoodSiteWebAcl',
            sampledRequestsEnabled: true,
          },
        })
      : undefined;
    const webAclId = webAcl
      ? webAcl.attrArn
      : 'arn:aws:wafv2:us-east-1:880273153178:global/webacl/CreatedByCloudFront-96f872c0/b17ea745-4d25-44d9-a477-530cb2ef0b02';

    // S3 REST origin has no directory-index resolution beyond the distribution root,
    // so clean URLs like /registration-thankyou need to be rewritten to their index.html.
    const urlRewriteFunction = new cloudfront.Function(this, 'UrlRewriteFunction', {
      code: cloudfront.FunctionCode.fromInline(`
function handler(event) {
  var request = event.request;
  var uri = request.uri;
  if (uri.endsWith('/')) {
    request.uri += 'index.html';
  } else if (!uri.includes('.')) {
    request.uri += '/index.html';
  }
  return request;
}
`),
    });

    const distribution = new cloudfront.Distribution(this, 'Distribution', {
      webAclId,
      domainNames: isProduction ? [domainName] : undefined,
      certificate,
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(siteBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        functionAssociations: [
          { function: urlRewriteFunction, eventType: cloudfront.FunctionEventType.VIEWER_REQUEST },
        ],
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

    // ── Route53 alias record ─────────────────────────────────────────────────
    // Production points the apex domain here; staging gets a subdomain. Both need
    // A + AAAA aliases since CloudFront distributions are dual-stack.
    if (props.hostedZoneId) {
      const hostedZone = route53.PublicHostedZone.fromHostedZoneAttributes(this, 'HostedZone', {
        hostedZoneId: props.hostedZoneId,
        zoneName: domainName,
      });
      const recordName = isProduction ? undefined : 'staging';
      const aliasTarget = route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(distribution));
      new route53.ARecord(this, 'AliasRecordV4', { zone: hostedZone, recordName, target: aliasTarget });
      new route53.AaaaRecord(this, 'AliasRecordV6', { zone: hostedZone, recordName, target: aliasTarget });
    }

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
    const resendKey = ssm.StringParameter.fromSecureStringParameterAttributes(
      this, 'ResendKey',
      { parameterName: `${ssmPrefix}/RESEND_API_KEY` },
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
        SSM_RESEND_KEY:             `${ssmPrefix}/RESEND_API_KEY`,
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
    for (const param of [spreadsheetId, sheetName, saEmail, saKey, resendKey, recaptchaSecret]) {
      param.grantRead(registrationFnAlias);
    }

    registrationsTable.grantWriteData(registrationFnAlias);
    notificationTopic.grantPublish(registrationFnAlias);

    // ── API Gateway HTTP API ──────────────────────────────────────────────────
    const httpApi = new HttpApi(this, 'HttpApi', {
      corsPreflight: {
        // Actual origin enforcement is done by the CloudFront Function + x-origin-verify secret
        allowOrigins: ['*'],
        allowMethods: [CorsHttpMethod.POST],
        allowHeaders: ['Content-Type'],
      },
    });

    httpApi.addRoutes({
      // CloudFront forwards the full request path, so this must match the
      // /api/submit-registration path pattern of the CloudFront behavior below.
      path: '/api/submit-registration',
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration('RegistrationIntegration', acceptRegistrationFn),
    });

    // ── Route /api/submit-registration through the existing CloudFront distribution ──
    // Route API traffic through CloudFront; origin header injection removed
    const apiOrigin = new origins.HttpOrigin(
      `${httpApi.apiId}.execute-api.${this.region}.amazonaws.com`,
      {
        protocolPolicy: cloudfront.OriginProtocolPolicy.HTTPS_ONLY,
      },
    );

    distribution.addBehavior('/api/submit-registration', apiOrigin, {
      allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
      cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
      originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
      viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
    });

    // No custom origin verification header is used; accept Lambda will rely on
    // standard checks (honeypot + request validation).

    // Apply stage-level throttling to protect Lambda from excessive invocations
    const cfnStage = httpApi.defaultStage!.node.defaultChild as apigatewayv2.CfnStage;
    cfnStage.defaultRouteSettings = {
      throttlingRateLimit: 5,
      throttlingBurstLimit: 10,
    };

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
    if (certificate) {
      new cdk.CfnOutput(this, 'CertificateArn', {
        value: certificate.certificateArn,
        description: 'ACM certificate ARN — check ACM console (us-east-1) for the DNS validation CNAME',
      });
    }
  }
}
