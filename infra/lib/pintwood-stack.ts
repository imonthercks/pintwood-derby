import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as lambda from 'aws-cdk-lib/aws-lambda-nodejs';
import { HttpApi, HttpMethod, CorsHttpMethod } from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';
import * as path from 'path';

export interface PintwoodStackProps extends cdk.StackProps {
  stackEnv: string;
}

export class PintwoodStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: PintwoodStackProps) {
    super(scope, id, props);

    const ssmPrefix = `/pintwood/${props.stackEnv}`;

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

    // ── Registration Lambda ───────────────────────────────────────────────────
    const registrationFn = new lambda.NodejsFunction(this, 'RegistrationFn', {
      entry: path.join(__dirname, '../../lambda/submit-registration/index.ts'),
      handler: 'handler',
      runtime: cdk.aws_lambda.Runtime.NODEJS_24_X,
      timeout: cdk.Duration.seconds(30),
      projectRoot: path.join(__dirname, '../..'),
      depsLockFilePath: path.join(__dirname, '../../lambda/submit-registration/package.json'),
      environment: {
        SSM_SPREADSHEET_ID: `${ssmPrefix}/REGISTRATION_SPREADSHEET_ID`,
        SSM_SHEET_NAME:     `${ssmPrefix}/REGISTRATION_SHEET_NAME`,
        SSM_SA_EMAIL:       `${ssmPrefix}/GOOGLE_SERVICE_ACCOUNT_EMAIL`,
        SSM_SA_KEY:         `${ssmPrefix}/GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`,
        SSM_SENDGRID_KEY:   `${ssmPrefix}/SENDGRID_API_KEY`,
        SSM_RECAPTCHA_SECRET: `${ssmPrefix}/RECAPTCHA_SECRET_KEY`,
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

    // Grant Lambda read access to each SSM SecureString
    for (const param of [spreadsheetId, sheetName, saEmail, saKey, sendgridKey, recaptchaSecret]) {
      param.grantRead(registrationFn);
    }

    // ── API Gateway HTTP API ──────────────────────────────────────────────────
    const httpApi = new HttpApi(this, 'HttpApi', {
      corsPreflight: {
        allowOrigins: ['*'],
        allowMethods: [CorsHttpMethod.POST],
        allowHeaders: ['Content-Type'],
      },
    });

    httpApi.addRoutes({
      path: '/submit-registration',
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration('RegistrationIntegration', registrationFn),
    });

    // ── Outputs ───────────────────────────────────────────────────────────────
    new cdk.CfnOutput(this, 'CloudFrontDomain', {
      value: distribution.distributionDomainName,
      description: 'CloudFront domain for testing (use as HUGO_BASEURL)',
    });
    new cdk.CfnOutput(this, 'ApiEndpoint', {
      value: httpApi.apiEndpoint + '/submit-registration',
      description: 'API Gateway endpoint (use as HUGO_PARAM_APIENDPOINT)',
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
