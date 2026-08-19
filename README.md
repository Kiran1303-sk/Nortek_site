# Nortek Project

This repo is split into:

- `frontend/` -> static website files (`public/`)
- `backend/` -> Node.js API, auth, jobs, and applications

## Vercel deployment

1. Deploy `frontend/` as a Vercel static site.
2. Deploy the backend separately on a Node.js host or as serverless API routes.
3. Set the backend URL in the frontend at runtime with `window.__API_BASE_URL__` or a `<meta name="api-base-url">` tag.
4. Configure backend env vars for MongoDB, JWT, email, and CORS.

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
- non-localhost -> use the configured API base from the page or environment

## Important note

Because this environment blocks file deletes/moves, the original root-level structure is still present.
Use the `frontend/` and `backend/` folders for your Vercel-friendly split deployment.
