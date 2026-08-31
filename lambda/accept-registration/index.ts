import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';

const sqsClient = new SQSClient({});

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json',
};

export const handler = async (event: { body: string | null }) => {
  const body = JSON.parse((event as any).body ?? '{}');

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
