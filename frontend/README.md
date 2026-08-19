# Frontend

Deploy this folder as a Vercel static site or any static host.

- Root Directory: `frontend`
- Publish Directory: `public`

Optional runtime API override on any page before `api-config.js`:

```html
<script>
  window.__API_BASE_URL__ = "https://your-backend-service.example.com";
</script>
```

By default, `public/js/api-config.js` uses:
- `http://localhost:5000` on localhost
- the configured API base from the page, meta tag, or environment
