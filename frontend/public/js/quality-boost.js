/* eslint-env browser */
(function () {
  function ensureMeta(name, content) {
    if (!content) {return;}
    let tag = document.querySelector(`meta[name="${  name  }"]`);
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
    if (!content) {return;}
    let tag = document.querySelector(`meta[property="${  property  }"]`);
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
    return clean ? `${clean  } | Nortek` : 'Nortek';
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
    if (document.querySelector('main, [role="main"]')) {return;}
    const candidate =
      document.querySelector('section') ||
      document.querySelector('.container') ||
      document.querySelector('.container-fluid');
    if (candidate) {
      candidate.setAttribute('role', 'main');
      if (!candidate.id) {candidate.id = 'main-content';}
    }
  }

  function ensureSkipLink() {
    if (document.querySelector('.skip-link')) {return;}
    const main =
      document.querySelector('main') ||
      document.querySelector('[role="main"]') ||
      document.querySelector('section');
    if (!main) {return;}
    if (!main.id) {main.id = 'main-content';}

    const skip = document.createElement('a');
    skip.className = 'skip-link';
    skip.href = `#${  main.id}`;
    skip.textContent = 'Skip to main content';
    document.body.insertAdjacentElement('afterbegin', skip);

    const style = document.createElement('style');
    style.textContent =
      '.skip-link{position:absolute;left:-9999px;top:8px;z-index:9999;background:#111;color:#fff;padding:8px 12px;border-radius:6px}' +
      '.skip-link:focus{left:8px;outline:2px solid #fff;outline-offset:2px}';
    document.head.appendChild(style);
  }

  function isNearViewport(el, threshold) {
    if (!el || typeof el.getBoundingClientRect !== 'function') {return false;}
    const rect = el.getBoundingClientRect();
    const vh = window.innerHeight || document.documentElement.clientHeight || 800;
    const margin = (threshold || 1) * vh;
    return rect.top <= margin && rect.bottom >= -vh * 0.2;
  }

  function isLikelyCriticalImage(img) {
    if (!img) {return false;}
    if (img.getAttribute('loading') === 'eager') {return true;}
    if ((img.getAttribute('fetchpriority') || '').toLowerCase() === 'high') {return true;}
    if (img.hasAttribute('data-eager')) {return true;}

    const cls = typeof img.className === 'string' ? img.className : '';
    if (/\b(hero|banner|logo|brand)\b/i.test(cls)) {return true;}
    if (img.closest('header, nav, .hero, .hero-section')) {return true;}

    return isNearViewport(img, 1.1);
  }

  function tuneImage(img) {
    if (!img) {return;}
    const widthAttr = img.getAttribute('width');
    const heightAttr = img.getAttribute('height');

    // Normalize non-numeric HTML attributes (e.g. 50%, auto, 52px) to CSS so ratio is preserved.
    if (widthAttr && /%|px|auto/i.test(widthAttr)) {
      img.style.width = widthAttr;
      img.removeAttribute('width');
    }
    if (heightAttr && /%|px|auto/i.test(heightAttr)) {
      if (!img.style.height) {img.style.height = heightAttr === 'auto' ? 'auto' : heightAttr;}
      img.removeAttribute('height');
    }

    if (!img.style.height && img.style.width) {img.style.height = 'auto';}

    if (!img.getAttribute('loading')) {
      img.setAttribute('loading', isLikelyCriticalImage(img) ? 'eager' : 'lazy');
    }
    if (!img.getAttribute('decoding')) {img.setAttribute('decoding', 'async');}
    if (!img.getAttribute('fetchpriority') && img.getAttribute('loading') === 'lazy') {
      img.setAttribute('fetchpriority', 'low');
    }
    if (!img.getAttribute('alt')) {img.setAttribute('alt', 'Nortek image');}
  }

  function tuneIframe(frame) {
    if (!frame) {return;}
    if (!frame.getAttribute('loading')) {
      frame.setAttribute('loading', isNearViewport(frame, 1.0) ? 'eager' : 'lazy');
    }
    if (!frame.getAttribute('title')) {frame.setAttribute('title', 'Embedded content');}
  }

  function tuneVideo(video) {
    if (!video) {return;}
    if (!video.getAttribute('preload')) {
      video.setAttribute('preload', isNearViewport(video, 1.0) ? 'metadata' : 'none');
    }
    video.setAttribute('playsinline', '');
  }

  function improveMedia() {
    document.querySelectorAll('img').forEach(tuneImage);
    document.querySelectorAll('iframe').forEach(tuneIframe);
    document.querySelectorAll('video').forEach(tuneVideo);

    // Apply loading hints to media added after initial render (e.g. API-rendered cards/lists).
    if (!window.__nortekMediaObserver && document.body && typeof MutationObserver !== 'undefined') {
      window.__nortekMediaObserver = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          mutation.addedNodes.forEach((node) => {
            if (!node || node.nodeType !== 1) {return;}
            if (node.matches && node.matches('img')) {tuneImage(node);}
            if (node.matches && node.matches('iframe')) {tuneIframe(node);}
            if (node.matches && node.matches('video')) {tuneVideo(node);}
            if (node.querySelectorAll) {
              node.querySelectorAll('img').forEach(tuneImage);
              node.querySelectorAll('iframe').forEach(tuneIframe);
              node.querySelectorAll('video').forEach(tuneVideo);
            }
          });
        });
      });
      window.__nortekMediaObserver.observe(document.body, { childList: true, subtree: true });
    }
  }

  function improveLinks() {
    document.querySelectorAll('a[target="_blank"]').forEach((a) => {
      const rel = (a.getAttribute('rel') || '').toLowerCase();
      const parts = rel.split(/\s+/).filter(Boolean);
      if (!parts.includes('noopener')) {parts.push('noopener');}
      if (!parts.includes('noreferrer')) {parts.push('noreferrer');}
      a.setAttribute('rel', parts.join(' ').trim());
    });

    document.querySelectorAll('a').forEach((a) => {
      const icon = a.querySelector('.bi-facebook, .bi-instagram, .bi-linkedin');
      if (!icon) {return;}
      if (a.getAttribute('aria-label')) {return;}
      if (icon.classList.contains('bi-facebook')) {a.setAttribute('aria-label', 'Facebook');}
      if (icon.classList.contains('bi-instagram')) {a.setAttribute('aria-label', 'Instagram');}
      if (icon.classList.contains('bi-linkedin')) {a.setAttribute('aria-label', 'LinkedIn');}
    });

    // Give fallback names to icon-only anchors.
    document.querySelectorAll('a').forEach((a) => {
      if (a.getAttribute('aria-label')) {return;}
      const txt = (a.textContent || '').trim();
      if (txt) {return;}
      const icon = a.querySelector('i, svg, img');
      if (icon) {a.setAttribute('aria-label', 'Open link');}
    });
  }

  function improveFormAccessibility() {
    document.querySelectorAll('input, textarea, select').forEach((el) => {
      if (el.getAttribute('aria-label')) {return;}
      const id = el.getAttribute('id');
      if (id && document.querySelector(`label[for="${  id  }"]`)) {return;}
      const placeholder = (el.getAttribute('placeholder') || '').trim();
      const name = (el.getAttribute('name') || '').trim();
      if (placeholder) {
        el.setAttribute('aria-label', placeholder);
      } else if (name) {
        el.setAttribute('aria-label', name.replace(/[_-]+/g, ' '));
      }
    });

    document.querySelectorAll('button').forEach((btn) => {
      if (btn.getAttribute('aria-label')) {return;}
      const txt = (btn.textContent || '').trim();
      if (txt) {return;}
      const title = (btn.getAttribute('title') || '').trim();
      btn.setAttribute('aria-label', title || 'Button');
    });
  }

  function improveVideoPerformance() {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const isMobile = window.matchMedia('(max-width: 991px)').matches;

    document.querySelectorAll('video').forEach((video) => {
      tuneVideo(video);
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

  function keepFooterCurrent() {
    const year = new Date().getFullYear();
    const normalized = `&copy; ${  year  } Nortek. All rights reserved.`;

    const apply = () => {
      document.querySelectorAll('p.mb-0, .mb-0').forEach((el) => {
        const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
        if (/Nortek\.\s*All rights reserved\./i.test(text)) {
          if ((el.innerHTML || '').trim() !== normalized) {
            el.innerHTML = normalized;
          }
        }
      });
    };

    apply();
  }

  function syncSocialLinks() {
    const configured = window.__NORTEK_SOCIAL_LINKS__ || {};
    const links = {
      facebook: String(configured.facebook || '').trim(),
      instagram: String(configured.instagram || '').trim(),
      linkedin: String(configured.linkedin || '').trim(),
    };

    const socialForIcon = (iconEl) => {
      if (!iconEl || !iconEl.classList) {return '';}
      if (iconEl.classList.contains('bi-facebook')) {return 'facebook';}
      if (iconEl.classList.contains('bi-instagram')) {return 'instagram';}
      if (iconEl.classList.contains('bi-linkedin')) {return 'linkedin';}
      return '';
    };

    const apply = () => {
      document.querySelectorAll('.bi-facebook, .bi-instagram, .bi-linkedin').forEach((iconEl) => {
        const key = socialForIcon(iconEl);
        if (!key) {return;}

        const anchor = iconEl.closest('a');
        if (!anchor || anchor.hasAttribute('data-social-manual')) {return;}

        const existingHref = String(anchor.getAttribute('href') || '').trim();
        const configuredHref = links[key];
        const nextHref = configuredHref || existingHref || '#';

        anchor.setAttribute('href', nextHref);
        anchor.setAttribute('aria-label', key.charAt(0).toUpperCase() + key.slice(1));

        if (/^https?:\/\//i.test(nextHref)) {
          anchor.setAttribute('target', '_blank');
          anchor.setAttribute('rel', 'noopener noreferrer');
        } else {
          anchor.removeAttribute('target');
        }
      });
    };

    apply();

    // Re-apply when a modal opens in case modal markup is injected lazily.
    if (!window.__nortekSocialModalHooked) {
      window.__nortekSocialModalHooked = true;
      document.addEventListener('show.bs.modal', apply);
    }
  }

  function improveModalWorkflow() {
    let modalTimer = null;
    let openAt = 0;

    const clearTimer = () => {
      if (!modalTimer) {return;}
      window.clearInterval(modalTimer);
      modalTimer = null;
    };

    document.addEventListener('show.bs.modal', (event) => {
      const modal = event && event.target;
      if (!modal || !modal.classList || !modal.classList.contains('modal')) {return;}

      openAt = Date.now();
      document.body.classList.add('nortek-modal-open');
      document.body.setAttribute('data-active-modal', modal.id || 'modal');
      modal.setAttribute('data-opened-at', new Date(openAt).toISOString());

      // Keep session seconds updated while the modal is open.
      clearTimer();
      modalTimer = window.setInterval(() => {
        const elapsed = Math.max(0, Math.floor((Date.now() - openAt) / 1000));
        modal.setAttribute('data-open-seconds', String(elapsed));
      }, 1000);

      const focusTarget = modal.querySelector('input, textarea, select, button, [href], [tabindex]:not([tabindex="-1"])');
      if (focusTarget && typeof focusTarget.focus === 'function') {
        window.setTimeout(() => focusTarget.focus(), 50);
      }
    });

    document.addEventListener('hidden.bs.modal', (event) => {
      const modal = event && event.target;
      if (!modal || !modal.classList || !modal.classList.contains('modal')) {return;}

      clearTimer();
      document.body.classList.remove('nortek-modal-open');
      document.body.removeAttribute('data-active-modal');
      modal.removeAttribute('data-open-seconds');
    });
  }

  function ensureBackToTopButton() {
    if (document.querySelector('.nortek-back-to-top')) {return;}

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'nortek-back-to-top';
    button.setAttribute('aria-label', 'Back to top');
    button.innerHTML =
      '<span class="nortek-back-to-top-icon" aria-hidden="true">\u2191</span>';

    button.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    document.body.appendChild(button);

    const style = document.createElement('style');
    style.textContent =
      '.nortek-back-to-top{position:fixed;right:20px;bottom:20px;z-index:9999;border:1px solid rgba(0,0,0,.12);border-radius:12px;width:44px;height:44px;padding:0;background:rgba(255,255,255,.96);color:#1f2937;font-family:Arial,sans-serif;font-size:22px !important;line-height:1 !important;font-weight:700;cursor:pointer;box-shadow:0 8px 24px rgba(0,0,0,.16);backdrop-filter:blur(4px);display:none;align-items:center;justify-content:center}' +
      '.nortek-back-to-top-icon{display:block;font-size:24px;line-height:1;transform:translateY(-1px)}' +
      '.nortek-back-to-top:hover{background:#ffffff;box-shadow:0 10px 28px rgba(0,0,0,.22)}' +
      '.nortek-back-to-top:focus{outline:2px solid #1f2937;outline-offset:2px}';
    document.head.appendChild(style);

    const toggleVisibility = () => {
      button.style.display = window.scrollY > 220 ? 'inline-flex' : 'none';
    };

    window.addEventListener('scroll', toggleVisibility, { passive: true });
    toggleVisibility();
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
    keepFooterCurrent();
    syncSocialLinks();
    improveModalWorkflow();
    ensureBackToTopButton();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }
})();
