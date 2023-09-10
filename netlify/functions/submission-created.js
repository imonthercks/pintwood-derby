// addToGoogleSheet.js

//const { google } = require('googleapis');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
const process = require('process')

exports.handler = async function (event, context) {
  try {
    // Load environment variables
    const { REGISTRATION_SPREADSHEET_ID, REGISTRATION_SHEET_NAME, GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY, NETLIFY_EMAILS_SECRET } = process.env;



    // Initialize auth - see https://theoephraim.github.io/node-google-spreadsheet/#/guides/authentication
    const serviceAccountAuth = new JWT({
      // env var values here are copied from service account credentials generated by google
      // see "Authentication" section in docs for more info
      email: GOOGLE_SERVICE_ACCOUNT_EMAIL,
      key: GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY.replace(/\\n/g, "\n"),
      scopes: [
        'https://www.googleapis.com/auth/spreadsheets',
      ],
    });

    // Set up the Google Sheets API using the JSON key
    const doc = new GoogleSpreadsheet(REGISTRATION_SPREADSHEET_ID, serviceAccountAuth);
    //const sheets = google.sheets({ version: 'v4', auth: GOOGLE_SERVICE_KEY_JSON });

    // Parse the incoming form data (assuming it's in JSON format)
    const formData = JSON.parse(event.body).payload.data;
    console.log(JSON.stringify(formData));


    console.log(`spreadsheetId: ${REGISTRATION_SPREADSHEET_ID}`);
    console.log(`range: ${REGISTRATION_SHEET_NAME}`);

    // Prepare the data and headers
    const headers = Object.keys(formData); // Use form field names as headers
    console.log(`headers: ${JSON.stringify(headers)}`);
    const email = formData['email'];
    const name = formData['name'];
    const values = headers.map((header) => formData[header]);
    console.log(`values: ${JSON.stringify(values)}`);

    // Call the Sheets API to append the data
    // console.log('writing header...');
    // await sheets.spreadsheets.values.append({
    //   spreadsheetId: REGISTRATION_SPREADSHEET_ID,
    //   range: `${REGISTRATION_SHEET_NAME}!A:A`, // Specify the range for the headers (e.g., column A)
    //   valueInputOption: 'RAW',
    //   resource: {
    //     values: headers,
    //   },
    // });
    // console.log('header write complete.');

    await doc.loadInfo();
    const sheet = doc.sheetsByTitle[REGISTRATION_SHEET_NAME] ?? await doc.addSheet({ title: REGISTRATION_SHEET_NAME, headerValues: headers });
    console.log('writing data...');
    // Append the actual data below the headers
    await sheet.addRow(formData);
    // await sheets.spreadsheets.values.append({
    //   spreadsheetId: REGISTRATION_SPREADSHEET_ID,
    //   range: `${REGISTRATION_SHEET_NAME}!A2`, // Start from the second row (assuming headers are in the first row)
    //   valueInputOption: 'RAW',
    //   resource: {
    //     values,
    //   },
    // });
    console.log('data write complete.');

    //automatically generated snippet from the email preview
    //sends a request to an email handler for a subscribed email
    await fetch(`${process.env.URL}/.netlify/functions/emails/subscribed`, {
      headers: {
        "netlify-emails-secret": NETLIFY_EMAILS_SECRET,
      },
      method: "POST",
      body: JSON.stringify({
        from: 'no-reply@thepintwood.com',
        to: email,
        subject: "You've been subscribed",
        parameters: {
          name: name,
          email: 'kgittemeier@gmail.com',
        },
      }),
    });
    console.log('Email sent')

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Data added to Google Sheet' }),
    };
  } catch (error) {
    console.log(error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Error adding data to Google Sheet' }),
    };
  }
};