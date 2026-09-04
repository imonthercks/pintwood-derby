import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';

const sqsClient = new SQSClient({});

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json',
};

export const handler = async (event: { body: string | null; headers?: Record<string, string> }) => {
  // Reject direct APIGW calls that bypass CloudFront
  const verifySecret = process.env.ORIGIN_VERIFY_SECRET;
  const originVerifyHeader = event.headers?.['x-origin-verify'] ?? event.headers?.['X-Origin-Verify'];
  if (verifySecret && originVerifyHeader !== verifySecret) {
    return { statusCode: 403, headers: corsHeaders, body: JSON.stringify({ error: 'Forbidden' }) };
  }

  let body: any;
  try {
    body = JSON.parse(event.body ?? '{}');
  } catch {
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }
  // Honeypot: silently succeed so bots don't retry
  if (body['url']) {
    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ success: true }) };
  }

  await sqsClient.send(new SendMessageCommand({
    QueueUrl: process.env.REGISTRATION_QUEUE_URL!,
    MessageBody: JSON.stringify(body),
  }));

  return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ success: true }) };
};
