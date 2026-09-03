import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';
import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';
import { Resend } from 'resend';
import Handlebars from 'handlebars';
import { readFileSync } from 'fs';
import { join } from 'path';
import { SQSEvent } from 'aws-lambda';
import { withDurableExecution, DurableContext } from '@aws/durable-execution-sdk-js';

const ssm = new SSMClient({});
const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const sns = new SNSClient({});

async function getParam(name: string): Promise<string> {
  const res = await ssm.send(new GetParameterCommand({ Name: name, WithDecryption: true }));
  return res.Parameter!.Value!;
}

// Compiled once on cold start
const emailTemplate = Handlebars.compile(
  readFileSync(join(__dirname, 'email-template.html'), 'utf8'),
);

function countCars(body: Record<string, string>): { stock_cars: number; outlaw_cars: number } {
  let stock_cars = 0;
  let outlaw_cars = 0;
  const increment = (category: string | undefined) => {
    if (category === 'stock') stock_cars++;
    if (category === 'outlaw') outlaw_cars++;
  };
  for (let i = 1; i <= 5; i++) increment(body[`car${i}Category`]);
  return { stock_cars, outlaw_cars };
}

export const handler = withDurableExecution(async (event: SQSEvent, context: DurableContext) => {
  const body = JSON.parse(event.Records[0].body);

  const { name, email, phone, sponsorName, sponsorLevel } = body;
  const { stock_cars, outlaw_cars } = countCars(body);
  const { url: _hp, ...sanitizedBody } = body;
  const { registrationId, submittedAt } = await context.step('init-registration', async () => ({
    registrationId: crypto.randomUUID(),
    submittedAt: new Date().toISOString(),
  }));
  const record = { ...sanitizedBody, stock_cars, outlaw_cars, registrationId, submittedAt };

  // ── Step 1: Persist to DynamoDB ───────────────────────────────────────────
  await context.step('save-to-dynamo', async () => {
    await dynamo.send(new PutCommand({
      TableName: process.env.DYNAMODB_TABLE_NAME!,
      Item: record,
    }));
  });

  // ── Step 2: Append row to Google Sheet ───────────────────────────────────
  await context.step('write-to-sheet', async () => {
    const [spreadsheetId, sheetName, saEmail, saKeyRaw] = await Promise.all([
      getParam(process.env.SSM_SPREADSHEET_ID!),
      getParam(process.env.SSM_SHEET_NAME!),
      getParam(process.env.SSM_SA_EMAIL!),
      getParam(process.env.SSM_SA_KEY!),
    ]);
    const auth = new JWT({
      email: saEmail,
      key: saKeyRaw.replace(/\\n/g, '\n'),
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    const doc = new GoogleSpreadsheet(spreadsheetId, auth);
    await doc.loadInfo();
    const sheet =
      doc.sheetsByTitle[sheetName] ??
      (await doc.addSheet({ title: sheetName, headerValues: Object.keys(record) }));
    await sheet.addRow(record);
  });

  // ── Step 3: Send confirmation email via SendGrid ──────────────────────────
  await context.step('send-confirmation-email', async () => {
    const resendApiKey = await getParam(process.env.SSM_RESEND_KEY!);

    const resend = new Resend('••••••••••••••••••••••••••••••••••••');

    resend.emails.send({
      from: 'no-reply@thepintwood.com',
      to: email,
      subject: 'Your Pintwood Derby Registration',
      html: emailTemplate({ name, email, phone, sponsorName, sponsorLevel, stock_cars, outlaw_cars }),
    });
 });

  // ── Step 4: Publish notification to SNS ──────────────────────────────────
  await context.step('publish-sns-notification', async () => {
    await sns.send(new PublishCommand({
      TopicArn: process.env.SNS_NOTIFICATION_TOPIC_ARN!,
      Subject: 'New Pintwood Derby Registration',
      Message: JSON.stringify({ registrationId, name, email, phone, stock_cars, outlaw_cars, sponsorName, sponsorLevel, submittedAt }),
    }));
  });

  return { batchItemFailures: [] };
});
