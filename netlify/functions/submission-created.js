// addToGoogleSheet.js

const { google } = require('googleapis');

exports.handler = async function (event, context) {
  try {
    // Load the credentials from your service account JSON key file
    const serviceKeyJson = JSON.parse(process.env.GOOGLE_SERVICE_KEY_JSON);

    // Set up the Google Sheets API using the JSON key
    const sheets = google.sheets({ version: 'v4', auth: serviceKeyJson });

    // Parse the incoming form data (assuming it's in JSON format)
    const formData = JSON.parse(event.body.payload?.data);
    console.log(formData);

    // Define the spreadsheetId and range
    const spreadsheetId = process.env.REGISTRATION_SPREADSHEET_ID;
    const range = process.env.REGISTRATION_SHEET_NAME; // Change to your sheet's name

    console.log({spreadsheetId, range});
    // Prepare the data and headers
    const headers = Object.keys(formData); // Use form field names as headers
    console.log(headers);
    const values = [headers.map((header) => formData[header])];
    console.log(values);

    // Call the Sheets API to append the data
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${sheetName}!A:A`, // Specify the range for the headers (e.g., column A)
      valueInputOption: 'RAW',
      resource: {
        values: [headers],
      },
    });

    // Append the actual data below the headers
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${sheetName}!A2`, // Start from the second row (assuming headers are in the first row)
      valueInputOption: 'RAW',
      resource: {
        values,
      },
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Data added to Google Sheet' }),
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Error adding data to Google Sheet' }),
    };
  }
};