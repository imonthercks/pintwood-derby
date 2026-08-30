import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';
import sgMail from '@sendgrid/mail';
import Handlebars from 'handlebars';
import { readFileSync } from 'fs';
import { join } from 'path';

const ssm = new SSMClient({});

async function getParam(name: string): Promise<string> {
  const res = await ssm.send(new GetParameterCommand({ Name: name, WithDecryption: true }));
  return res.Parameter!.Value!;
}

// Compiled once on cold start
const emailTemplate = Handlebars.compile(
  readFileSync(join(__dirname, 'email-template.html'), 'utf8'),
);

export const handler = async (event: { body: string | null }) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  };

  try {
    const body = JSON.parse(event.body ?? '{}');

    // ── reCAPTCHA server-side verification ────────────────────────────────────
    const recaptchaSecret = await getParam(process.env.SSM_RECAPTCHA_SECRET!);
    const verifyRes = await fetch(
      `https://www.google.com/recaptcha/api/siteverify?secret=${encodeURIComponent(recaptchaSecret)}&response=${encodeURIComponent(body['g-recaptcha-response'] ?? '')}`,
      { method: 'POST' },
    );
    const { success } = (await verifyRes.json()) as { success: boolean };
    if (!success) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'reCAPTCHA verification failed' }) };
    }

    // ── Pull secrets from SSM ─────────────────────────────────────────────────
    const [spreadsheetId, sheetName, saEmail, saKeyRaw, sendgridApiKey] = await Promise.all([
      getParam(process.env.SSM_SPREADSHEET_ID!),
      getParam(process.env.SSM_SHEET_NAME!),
      getParam(process.env.SSM_SA_EMAIL!),
      getParam(process.env.SSM_SA_KEY!),
      getParam(process.env.SSM_SENDGRID_KEY!),
    ]);

    const { name, email, phone, sponsorName, sponsorLevel } = body;

    // ── Append row to Google Sheet ────────────────────────────────────────────
    const auth = new JWT({
      email: saEmail,
      key: saKeyRaw.replace(/\\n/g, '\n'),
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    const doc = new GoogleSpreadsheet(spreadsheetId, auth);
    await doc.loadInfo();
    const sheet =
      doc.sheetsByTitle[sheetName] ??
      (await doc.addSheet({ title: sheetName, headerValues: Object.keys(body) }));
    await sheet.addRow(body);

    // ── Send confirmation email via SendGrid ──────────────────────────────────
    sgMail.setApiKey(sendgridApiKey);
    await sgMail.send({
      to: email,
      from: 'no-reply@thepintwood.com',
      subject: 'Your Pintwood Derby Registration',
      html: emailTemplate({ name, email, phone, sponsorName, sponsorLevel }),
    });

    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ success: true }) };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: 'Registration failed. Please try again.' }) };
  }
};
