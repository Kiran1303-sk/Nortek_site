# Frontend (Render Static Site)

Deploy this folder as a Render **Static Site**.

- Root Directory: `frontend`
- Publish Directory: `public`

Optional runtime API override on any page before `api-config.js`:

```html
<script>
  window.__API_BASE_URL__ = "https://your-backend-service.onrender.com";
</script>
```

By default, `public/js/api-config.js` uses:
- `http://localhost:5000` on localhost
- `https://nortek-backend.onrender.com` elsewhere
