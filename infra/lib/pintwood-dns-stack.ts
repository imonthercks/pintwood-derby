import * as cdk from 'aws-cdk-lib';
import * as route53 from 'aws-cdk-lib/aws-route53';
import { Construct } from 'constructs';

export class PintwoodDnsStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const domainName = 'thepintwood.com';

    // Alias records for the production and staging distributions live in their
    // respective PintwoodStack, since each one owns the distribution it points to.
    const hostedZone = new route53.PublicHostedZone(this, 'HostedZone', {
      zoneName: domainName,
    });
    hostedZone.applyRemovalPolicy(cdk.RemovalPolicy.RETAIN);

    new cdk.CfnOutput(this, 'HostedZoneId', {
      value: hostedZone.hostedZoneId,
      description: 'Pass as --context hostedZoneId=... when deploying PintwoodStack so it can create its alias records',
    });
    new cdk.CfnOutput(this, 'NameServers', {
      value: cdk.Fn.join(', ', hostedZone.hostedZoneNameServers!),
      description: 'Delegate thepintwood.com to these name servers at your registrar (Netlify DNS)',
    });
  }
}

