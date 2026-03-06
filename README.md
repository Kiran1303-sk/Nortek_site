# Nortek Project (Render-Ready Split)

This repo now includes a Render deployment split:

- `frontend/` -> static website files (`public/`)
- `backend/` -> Node.js API, auth, jobs, and applications

A Render blueprint file is included: `render.yaml`.

## Render deployment

1. Push this repo to GitHub.
2. In Render, create Blueprint from this repo (uses `render.yaml`).
3. Set backend env vars in Render dashboard (`MONGO_URI`, `JWT_SECRET`, mail creds, CORS origins).
4. Set `CORS_ALLOWED_ORIGINS` to your frontend Render URL.

## Local run

### Backend

```bash
cd backend
npm install
npm start
```

### Frontend

Serve `frontend/public` with any static server.

Example:

```bash
npx serve frontend/public
```

`frontend/public/js/api-config.js` auto-selects API base:
- localhost -> `http://localhost:5000`
- non-localhost -> `https://nortek-backend.onrender.com` (replace with your actual backend URL)

## Important note

Because this environment blocks file deletes/moves, the original root-level structure is still present.
Use the new `frontend/` and `backend/` folders for Render deployment.
