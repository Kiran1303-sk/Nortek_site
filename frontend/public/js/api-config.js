(function () {
  function normalizeBase(url) {
    return String(url || '').replace(/\/+$/, '');
  }

  const metaBase = document.querySelector('meta[name="api-base-url"]')?.content;
  const configuredBase = window.__API_BASE_URL__ || window.API_BASE_URL || metaBase;
  const isLocalhost = ['localhost', '127.0.0.1'].includes(window.location.hostname);
  const fallbackBase = isLocalhost
    ? 'http://localhost:5000'
    : 'https://nortek-backend.onrender.com';

  window.__API_BASE__ = normalizeBase(configuredBase || fallbackBase);

  window.apiUrl = function apiUrl(pathname) {
    const path = String(pathname || '');
    if (!path) {
      return window.__API_BASE__;
    }
    if (/^https?:\/\//i.test(path)) {
      return path;
    }
    return `${window.__API_BASE__}${path.startsWith('/') ? '' : '/'}${path}`;
  };
})();
