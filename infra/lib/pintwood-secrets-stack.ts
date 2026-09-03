// CloudFormation does not support SecureString SSM parameters.
// Secrets are deployed via .github/workflows/deploy-secrets.yml using
// GitHub environment secrets and `aws ssm put-parameter --type SecureString`.
//
// Parameter names expected by PintwoodStack:
//   /pintwood/REGISTRATION_SPREADSHEET_ID
//   /pintwood/REGISTRATION_SHEET_NAME
//   /pintwood/GOOGLE_SERVICE_ACCOUNT_EMAIL
//   /pintwood/GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY
//   /pintwood/RESEND_API_KEY
//   /pintwood/RECAPTCHA_SECRET_KEY
export {};
