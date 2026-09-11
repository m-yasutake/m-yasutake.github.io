// js/site-footer.js — Single source of truth for the site footer markup,
// shared across every page. Previously this HTML was copy-pasted into 12
// pages and had drifted in two ways: the "Explore" column was missing the
// Denmark link on most pages (only denmark.html/norway.html had it), and the
// three planning-<country>.html pages used a differently-classed footer
// (`.footer-inner`/`.footer-links`) that has no matching CSS anywhere in the
// site — it rendered as an unstyled vertical stack instead of the grid
// layout every other page gets from `.footer-grid`/`.footer-col`.
//
// Usage: put `<footer id="site-footer"></footer>` where the old inline
// markup used to live, then call SiteFooter.init() from an inline <script>
// right after loading this file (before js/main.js, since main.js wires up
// the `[data-auth]` login link and the admin-only-link visibility against
// this markup on load).
(function () {
  'use strict';

  function footerHtml() {
    return ''
      + '<div class="container">'
      + '<div class="footer-grid">'
      + '<div class="footer-brand">'
      + '<div class="footer-logo">🚴 tomika<span class="accent">.bike</span></div>'
      + '<p data-i18n="footer.brand">A cycling adventure blog documenting our journey through Japan and Norway.</p>'
      + '<div class="social-links">'
      + '<a class="social-link" title="Strava" aria-label="Strava">🏃</a>'
      + '</div>'
      + '</div>'
      + '<div class="footer-col">'
      + '<h4 data-i18n="footer.explore">Explore</h4>'
      + '<a href="index.html" data-i18n="nav.home">Home</a>'
      + '<a href="japan.html" data-i18n="nav.japan">Japan</a>'
      + '<a href="denmark.html" data-i18n="nav.denmark">Denmark</a>'
      + '<a href="norway.html" data-i18n="nav.norway">Norway</a>'
      + '<a href="gear.html" data-i18n="nav.gear">Gear</a>'
      + '</div>'
      + '<div class="footer-col">'
      + '<h4 data-i18n="footer.info">Info</h4>'
      + '<a href="about.html" data-i18n="footer.about">About Us</a>'
      + '</div>'
      + '<div class="footer-col">'
      + '<h4 data-i18n="footer.admin">Admin</h4>'
      + '<a href="#" data-auth data-i18n="footer.login">Login</a>'
      + '<a href="admin.html" class="admin-only-link" style="display:none" data-i18n="footer.dashboard">Dashboard</a>'
      + '</div>'
      + '</div>'
      + '<div class="footer-bottom">'
      + '<span data-i18n="footer.copy">© 2026 tomika.bike</span>'
      + '<span data-i18n="footer.made">Made with ❤️ and 🚴</span>'
      + '</div>'
      + '</div>';
  }

  function init() {
    var el = document.getElementById('site-footer');
    if (el) el.innerHTML = footerHtml();
  }

  window.SiteFooter = { init: init };
}());
