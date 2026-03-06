# Backend (Render Web Service)

Deploy this folder as a Render **Web Service**.

- Root Directory: `backend`
- Build Command: `npm ci`
- Start Command: `npm start`
- Health Check Path: `/health`

## Required environment variables

- `MONGO_URI`
- `JWT_SECRET`
- `EMAIL_USER`
- `EMAIL_PASS`
- `CONTACT_RECEIVER_EMAIL` (optional)
- `CORS_ALLOWED_ORIGINS` (set to your frontend URL)
- `NODE_ENV=production`

Optional:
- `PORT` (Render injects this)
- `CLIENT_URL`
- `JWT_EXPIRES_IN`
- `ADMIN_JWT_EXPIRES_IN`
- `PASSWORD_MIN_LENGTH`
- `ENABLE_CSP_REPORT_ONLY`
- `LOG_CSP_REPORTS`
