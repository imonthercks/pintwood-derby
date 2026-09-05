#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { PintwoodStack } from '../lib/pintwood-stack';
import { PintwoodDnsStack } from '../lib/pintwood-dns-stack';

const app = new cdk.App();
const env = { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION };

// Pass -c stackEnv=staging or -c stackEnv=production to synthesize the site/API stack.
// Pass -c hostedZoneId=... (see deploy-infra.yml) once PintwoodDnsStack exists so it
// can create its own Route53 alias record pointing at its distribution.
const stackEnv = app.node.tryGetContext('stackEnv');
if (stackEnv) {
  new PintwoodStack(app, `PintwoodStack-${stackEnv}`, {
    env,
    stackEnv,
    hostedZoneId: app.node.tryGetContext('hostedZoneId'),
  });
}

// Pass -c dns=true to synthesize the DNS stack (just the hosted zone; each
// PintwoodStack creates its own alias record once the zone exists).
if (app.node.tryGetContext('dns')) {
  new PintwoodDnsStack(app, 'PintwoodDnsStack', { env });
}


