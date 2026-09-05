import * as cdk from 'aws-cdk-lib';
import * as route53 from 'aws-cdk-lib/aws-route53';
import { Construct } from 'constructs';

export interface PintwoodDnsStackProps extends cdk.StackProps {
  // Resend's DKIM public key for thepintwood.com; passed via context/secret rather
  // than committed, since it's a domain-specific verification credential.
  resendDkimPublicKey: string;
}

export class PintwoodDnsStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: PintwoodDnsStackProps) {
    super(scope, id, props);

    const domainName = 'thepintwood.com';

    // Alias records for the production and staging distributions live in their
    // respective PintwoodStack, since each one owns the distribution it points to.
    const hostedZone = new route53.PublicHostedZone(this, 'HostedZone', {
      zoneName: domainName,
    });
    hostedZone.applyRemovalPolicy(cdk.RemovalPolicy.RETAIN);

    // ── Resend email-sending domain records ──────────────────────────────────
    const resendDkimTxt = `p=${props.resendDkimPublicKey}`;
    const resendDkimTxtChunks = resendDkimTxt.match(/.{1,255}/g) ?? [resendDkimTxt];
    new route53.TxtRecord(this, 'ResendDkimRecord', {
      zone: hostedZone,
      recordName: 'resend._domainkey',
      values: resendDkimTxtChunks,
    });
    new route53.CnameRecord(this, 'ResendRsendCname', {
      zone: hostedZone,
      recordName: 'rsend',
      domainName: 'rsend.forge.rmta.net',
    });
    new route53.CnameRecord(this, 'ResendSendCname', {
      zone: hostedZone,
      recordName: 'send',
      domainName: 'send.forge.rmta.net',
    });
    new route53.TxtRecord(this, 'DmarcRecord', {
      zone: hostedZone,
      recordName: '_dmarc',
      values: ['v=DMARC1; p=none;'],
    });

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


