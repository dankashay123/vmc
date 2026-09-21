/* ═══════════════════════════════════════════════════════════════
   Void Matrix — single source of truth for the build number.

   Loaded as a classic script by every page and via importScripts()
   by the service worker, so the cache key, the on-screen version
   stamp and the dossier header can no longer drift apart. Bumping
   this one line is the whole deploy ritual.
   ═══════════════════════════════════════════════════════════════ */
(function (root) {
  root.VMC_BUILD = '3.4.0';
  // Display form: major.minor only, e.g. "v3.2".
  root.VMC_VERSION_LABEL = 'v' + root.VMC_BUILD.replace(/\.\d+$/, '');
})(typeof self !== 'undefined' ? self : this);
