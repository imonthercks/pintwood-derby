#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { PintwoodStack } from '../lib/pintwood-stack';

const app = new cdk.App();
// Pass -c stackEnv=staging or -c stackEnv=production (defaults to production)
const stackEnv = app.node.tryGetContext('stackEnv') ?? 'production';
new PintwoodStack(app, `PintwoodStack-${stackEnv}`, {
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION },
  stackEnv,
});

