/* eslint-env browser */
(function () {
  function ensureMeta(name, content) {
    if (!content) return;
    let tag = document.querySelector('meta[name="' + name + '"]');
    if (!tag) {
      tag = document.createElement('meta');
      tag.setAttribute('name', name);
      document.head.appendChild(tag);
    }
    if (!tag.getAttribute('content')) {
      tag.setAttribute('content', content);
    }
  }

  function ensurePropertyMeta(property, content) {
    if (!content) return;
    let tag = document.querySelector('meta[property="' + property + '"]');
    if (!tag) {
      tag = document.createElement('meta');
      tag.setAttribute('property', property);
      document.head.appendChild(tag);
    }
    if (!tag.getAttribute('content')) {
      tag.setAttribute('content', content);
    }
  }

  function normalizeTitle(title) {
    const clean = String(title || '').trim();
    return clean ? clean + ' | Nortek' : 'Nortek';
  }

  function ensureCanonical() {
    let canonical = document.querySelector('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.setAttribute('rel', 'canonical');
      document.head.appendChild(canonical);
    }
    if (!canonical.getAttribute('href')) {
      const url = new URL(window.location.href);
      url.hash = '';
      canonical.setAttribute('href', url.toString());
    }
  }

  function ensureMainLandmark() {
    if (document.querySelector('main, [role="main"]')) return;
    const candidate =
      document.querySelector('section') ||
      document.querySelector('.container') ||
      document.querySelector('.container-fluid');
    if (candidate) {
      candidate.setAttribute('role', 'main');
      if (!candidate.id) candidate.id = 'main-content';
    }
  }

  function ensureSkipLink() {
    if (document.querySelector('.skip-link')) return;
    const main =
      document.querySelector('main') ||
      document.querySelector('[role="main"]') ||
      document.querySelector('section');
    if (!main) return;
    if (!main.id) main.id = 'main-content';

    const skip = document.createElement('a');
    skip.className = 'skip-link';
    skip.href = '#' + main.id;
    skip.textContent = 'Skip to main content';
    document.body.insertAdjacentElement('afterbegin', skip);

    const style = document.createElement('style');
    style.textContent =
      '.skip-link{position:absolute;left:-9999px;top:8px;z-index:9999;background:#111;color:#fff;padding:8px 12px;border-radius:6px}' +
      '.skip-link:focus{left:8px;outline:2px solid #fff;outline-offset:2px}';
    document.head.appendChild(style);
  }

  function improveMedia() {
    document.querySelectorAll('img').forEach((img) => {
      const widthAttr = img.getAttribute('width');
      const heightAttr = img.getAttribute('height');

      // Normalize non-numeric HTML attributes (e.g. 50%, auto, 52px) to CSS so ratio is preserved.
      if (widthAttr && /%|px|auto/i.test(widthAttr)) {
        img.style.width = widthAttr;
        img.removeAttribute('width');
      }
      if (heightAttr && /%|px|auto/i.test(heightAttr)) {
        if (!img.style.height) img.style.height = heightAttr === 'auto' ? 'auto' : heightAttr;
        img.removeAttribute('height');
      }

      if (!img.style.height && img.style.width) img.style.height = 'auto';
      if (!img.getAttribute('loading')) img.setAttribute('loading', 'lazy');
      if (!img.getAttribute('decoding')) img.setAttribute('decoding', 'async');
      if (!img.getAttribute('alt')) img.setAttribute('alt', 'Nortek image');
    });

    document.querySelectorAll('iframe').forEach((frame) => {
      if (!frame.getAttribute('loading')) frame.setAttribute('loading', 'lazy');
      if (!frame.getAttribute('title')) frame.setAttribute('title', 'Embedded content');
    });
  }

  function improveLinks() {
    document.querySelectorAll('a[target="_blank"]').forEach((a) => {
      const rel = (a.getAttribute('rel') || '').toLowerCase();
      const parts = rel.split(/\s+/).filter(Boolean);
      if (!parts.includes('noopener')) parts.push('noopener');
      if (!parts.includes('noreferrer')) parts.push('noreferrer');
      a.setAttribute('rel', parts.join(' ').trim());
    });

    document.querySelectorAll('a').forEach((a) => {
      const icon = a.querySelector('.bi-facebook, .bi-instagram, .bi-linkedin');
      if (!icon) return;
      if (a.getAttribute('aria-label')) return;
      if (icon.classList.contains('bi-facebook')) a.setAttribute('aria-label', 'Facebook');
      if (icon.classList.contains('bi-instagram')) a.setAttribute('aria-label', 'Instagram');
      if (icon.classList.contains('bi-linkedin')) a.setAttribute('aria-label', 'LinkedIn');
    });

    // Give fallback names to icon-only anchors.
    document.querySelectorAll('a').forEach((a) => {
      if (a.getAttribute('aria-label')) return;
      const txt = (a.textContent || '').trim();
      if (txt) return;
      const icon = a.querySelector('i, svg, img');
      if (icon) a.setAttribute('aria-label', 'Open link');
    });
  }

  function improveFormAccessibility() {
    document.querySelectorAll('input, textarea, select').forEach((el) => {
      if (el.getAttribute('aria-label')) return;
      const id = el.getAttribute('id');
      if (id && document.querySelector('label[for="' + id + '"]')) return;
      const placeholder = (el.getAttribute('placeholder') || '').trim();
      const name = (el.getAttribute('name') || '').trim();
      if (placeholder) {
        el.setAttribute('aria-label', placeholder);
      } else if (name) {
        el.setAttribute('aria-label', name.replace(/[_-]+/g, ' '));
      }
    });

    document.querySelectorAll('button').forEach((btn) => {
      if (btn.getAttribute('aria-label')) return;
      const txt = (btn.textContent || '').trim();
      if (txt) return;
      const title = (btn.getAttribute('title') || '').trim();
      btn.setAttribute('aria-label', title || 'Button');
    });
  }

  function improveVideoPerformance() {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const isMobile = window.matchMedia('(max-width: 991px)').matches;

    document.querySelectorAll('video').forEach((video) => {
      if (!video.getAttribute('preload')) video.setAttribute('preload', 'metadata');
      video.setAttribute('playsinline', '');
      if (video.hasAttribute('autoplay') && (reduceMotion || isMobile)) {
        video.removeAttribute('autoplay');
        try {
          video.pause();
        } catch (_e) {
          // Ignore media pause errors on restricted browsers.
        }
      }
    });
  }

  function improveHead() {
    document.documentElement.setAttribute('lang', document.documentElement.lang || 'en');
    const title = normalizeTitle(document.title);
    document.title = title;

    ensureMeta(
      'description',
      'Nortek delivers AI, SAP, web, RPA, and business intelligence solutions with a focus on measurable business outcomes.'
    );
    ensureMeta('robots', 'index,follow');
    ensureMeta('theme-color', '#2f3291');
    ensureMeta('referrer', 'strict-origin-when-cross-origin');

    ensurePropertyMeta('og:type', 'website');
    ensurePropertyMeta('og:title', title);
    ensurePropertyMeta(
      'og:description',
      'Nortek provides technology services including AI, SAP ERP, web development, RPA, and consulting.'
    );
    ensurePropertyMeta('og:url', window.location.href);
    ensurePropertyMeta('og:site_name', 'Nortek');

    ensureCanonical();
  }

  function run() {
    improveHead();
    ensureMainLandmark();
    ensureSkipLink();
    improveMedia();
    improveLinks();
    improveFormAccessibility();
    improveVideoPerformance();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }
})();
