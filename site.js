/* ═══════════════════════════════════════════════════════════════
   Void Matrix — shared site behaviour
   Loaded by index / how-it-works / about. cipher.html is standalone.
   ═══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var VERSION = 'v3.1';

  // matchMedia is universal in browsers but absent in some embedded webviews
  // and test runners. Failing closed here would take the whole file down.
  function mq(q) {
    try { return !!(window.matchMedia && window.matchMedia(q).matches); }
    catch (e) { return false; }
  }

  var reduceMotion = mq('(prefers-reduced-motion: reduce)');

  /* ── Version stamp ──────────────────────────────────────────
     Any element with data-vmc-version gets the version text, so the
     number lives in exactly one place across the whole site. */
  document.querySelectorAll('[data-vmc-version]').forEach(function (el) {
    el.textContent = VERSION;
  });

  /* ── Custom cursor ──────────────────────────────────────────
     Only for genuinely fine pointers. Anything else keeps the OS
     cursor, which the stylesheet handles via @media (pointer:fine). */
  var cur = document.getElementById('cursor');
  if (cur && mq('(pointer:fine)') && !reduceMotion) {
    var x = 0, y = 0, queued = false;
    document.addEventListener('mousemove', function (e) {
      x = e.clientX; y = e.clientY;
      if (!queued) {
        queued = true;
        requestAnimationFrame(function () {
          cur.style.transform = 'translate(' + x + 'px,' + y + 'px) translate(-50%,-50%)';
          queued = false;
        });
      }
    }, { passive: true });
    document.addEventListener('mousedown', function () { cur.classList.add('click'); });
    document.addEventListener('mouseup', function () { cur.classList.remove('click'); });
    document.addEventListener('mouseleave', function () { cur.style.opacity = '0'; });
    document.addEventListener('mouseenter', function () { cur.style.opacity = '1'; });
    document.querySelectorAll('a,button,input,textarea,select').forEach(function (el) {
      el.addEventListener('mouseenter', function () { cur.classList.add('hover'); });
      el.addEventListener('mouseleave', function () { cur.classList.remove('hover'); });
    });
  } else if (cur) {
    cur.remove();
  }

  /* ── Scroll reveal ──────────────────────────────────────────
     If motion is reduced, everything is simply shown at once. */
  var reveals = document.querySelectorAll('.reveal');
  if (reveals.length) {
    if (reduceMotion || !('IntersectionObserver' in window)) {
      reveals.forEach(function (el) { el.classList.add('visible'); });
    } else {
      var obs = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible');
            obs.unobserve(entry.target);
          }
        });
      }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });
      reveals.forEach(function (el) { obs.observe(el); });
    }
  }

  /* ── Nav ────────────────────────────────────────────────────
     Keyboard accessible, closes on Escape, outside click, link click,
     and on resize back to desktop width. */
  var navBtn = document.querySelector('.nav-menu-btn');
  var navLinks = document.getElementById('navLinks');

  function setNav(open) {
    if (!navLinks || !navBtn) return;
    navLinks.classList.toggle('open', open);
    navBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    navBtn.textContent = open ? '✕ CLOSE' : '☰ MENU';
  }

  if (navBtn && navLinks) {
    navBtn.setAttribute('aria-expanded', 'false');
    navBtn.setAttribute('aria-controls', 'navLinks');
    navBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      setNav(!navLinks.classList.contains('open'));
    });
    navLinks.querySelectorAll('a').forEach(function (a) {
      a.addEventListener('click', function () { setNav(false); });
    });
    document.addEventListener('click', function (e) {
      if (navLinks.classList.contains('open') &&
          !navLinks.contains(e.target) && e.target !== navBtn) {
        setNav(false);
      }
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && navLinks.classList.contains('open')) {
        setNav(false);
        navBtn.focus();
      }
    });
    window.addEventListener('resize', function () {
      if (window.innerWidth > 600) setNav(false);
    });
  }

  /* ── Service worker ─────────────────────────────────────────
     Registered here too so a visitor landing on a marketing page
     already has the cipher precached before they tap LAUNCH. */
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () {});
    });
  }
})();
