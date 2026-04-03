/* eslint-env browser */
(() => {
  const path = window.location.pathname.toLowerCase();
  const navLinks = Array.from(document.querySelectorAll(".navbar .nav-link"));

  if (!navLinks.length) {return;}

  const servicePaths = [
    "/services.html",
    "/webdesign.html",
    "/ai-services.html",
    "/agentic.html",
    "/sap-erp.html",
    "/rpa.html",
    "/business-int.html"
  ];
  const footerServicePaths = new Set(
    servicePaths.filter((item) => item !== "/services.html")
  );

  const careerPaths = [
    "/careers.html",
    "/resume.html",
    "/visa.html",
    "/apply.html",
    "/job-details.html"
  ];

  let activeHref = path;

  if (path === "/" || path === "/index.html" || path === "/nortek.html") {
    activeHref = "/nortek.html";
  } else if (servicePaths.includes(path)) {
    activeHref = "/services.html";
  } else if (careerPaths.includes(path)) {
    activeHref = "/careers.html";
  }

  navLinks.forEach((link) => {
    const href = (link.getAttribute("href") || "").toLowerCase();
    const isActive = href === activeHref;
    link.classList.toggle("active", isActive);
    if (isActive) {
      link.setAttribute("aria-current", "page");
    } else {
      link.removeAttribute("aria-current");
    }
  });

  const footerLinks = Array.from(document.querySelectorAll("footer a[href]"));
  footerLinks.forEach((link) => {
    const href = (link.getAttribute("href") || "").toLowerCase();
    if (!footerServicePaths.has(href)) {return;}

    const isActiveFooterService = href === path;
    if (isActiveFooterService) {
      link.setAttribute("aria-current", "page");
    } else {
      link.removeAttribute("aria-current");
    }
  });

  const dropdownTopLinks = Array.from(
    document.querySelectorAll(".navbar .nav-item.dropdown > .nav-link.dropdown-toggle[href]")
  );

  function syncTopDropdownLinkBehavior() {
    const isDesktop = window.matchMedia("(min-width: 992px)").matches;

    dropdownTopLinks.forEach((link) => {
      if (isDesktop) {
        link.dataset.desktopDropdownToggle = link.getAttribute("data-bs-toggle") || "";
        link.removeAttribute("data-bs-toggle");
        link.removeAttribute("aria-expanded");
      } else {
        const stored = link.dataset.desktopDropdownToggle;
        if (stored !== undefined) {
          if (stored) {link.setAttribute("data-bs-toggle", stored);}
          else {link.setAttribute("data-bs-toggle", "dropdown");}
        }
      }
    });
  }

  syncTopDropdownLinkBehavior();
  window.addEventListener("resize", syncTopDropdownLinkBehavior);
})();
