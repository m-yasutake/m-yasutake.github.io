// js/site-nav.js — Single source of truth for the desktop navbar and mobile
// menu markup, shared across every page. Previously this HTML was copy-pasted
// into ~15 pages; they had already drifted (admin.html's copy was missing
// the Denmark links and all data-i18n tags, so the admin nav silently fell
// out of step with the rest of the site).
//
// Usage: put `<nav class="navbar" id="site-navbar"></nav>` and
// `<div class="mobile-menu" id="site-mobile-menu"></div>` where the old
// inline markup used to live, then call SiteNav.init() from an inline
// <script> right after loading this file (before js/main.js, since main.js
// wires up hamburger/lang-dropdown/active-link behavior against this markup
// on load). Pass { loginButton: true } on the one page (unsubscribe.html)
// that also shows a direct Google sign-in button in the navbar.
(function () {
  'use strict';

  var GOOGLE_LOGO_SVG =
    '<svg class="google-logo" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
    '<path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>' +
    '<path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>' +
    '<path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>' +
    '<path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>' +
    '</svg>';

  function navInnerHtml(opts) {
    return ''
      + '<div class="nav-inner">'
      + '<a href="index.html" class="nav-logo"><span class="logo-icon">🚴</span><span>tomika<span class="accent">.bike</span></span></a>'
      + '<ul class="nav-links">'
      + '<li><a href="index.html" data-i18n="nav.home">Home</a></li>'
      + '<li class="nav-dropdown-item">'
      + '<a href="#" class="nav-dropdown-toggle"><span data-i18n="nav.trips">Trips</span> <span class="nav-arrow">▼</span></a>'
      + '<ul class="nav-dropdown-menu">'
      + '<li><a href="japan.html" data-i18n="nav.japan">Japan</a></li>'
      + '<li><a href="denmark.html" data-i18n="nav.denmark">Denmark</a></li>'
      + '<li><a href="norway.html" data-i18n="nav.norway">Norway</a></li>'
      + '</ul></li>'
      + '<li class="nav-dropdown-item">'
      + '<a href="#" class="nav-dropdown-toggle"><span data-i18n="nav.planning">Planning</span> <span class="nav-arrow">▼</span></a>'
      + '<ul class="nav-dropdown-menu">'
      + '<li><a href="planning-japan.html" data-i18n="nav.japan">Japan</a></li>'
      + '<li><a href="planning-denmark.html" data-i18n="nav.denmark">Denmark</a></li>'
      + '<li><a href="planning-norway.html" data-i18n="nav.norway">Norway</a></li>'
      + '</ul></li>'
      + '<li><a href="blog.html" data-i18n="nav.blog">Blog</a></li>'
      + '<li><a href="gear.html" data-i18n="nav.gear">Gear</a></li>'
      + '<li class="admin-only-link" style="display:none"><a href="admin.html" data-i18n="nav.admin">Admin</a></li>'
      + '</ul>'
      + '<div class="nav-actions">'
      + '<div class="lang-dropdown">'
      + '<button class="lang-toggle-btn"><span data-i18n="nav.lang">🌐 Language</span> <span class="lang-arrow">▼</span></button>'
      + '<div class="lang-menu">'
      + '<button class="lang-option" data-lang="en">English</button>'
      + '<button class="lang-option" data-lang="ja">日本語</button>'
      + '<button class="lang-option" data-lang="no">Norsk</button>'
      + '</div></div>'
      + '<button class="nav-subscribe-btn" onclick="openSubscribeModal()" data-i18n="nav.subscribe">🔔 Subscribe</button>'
      + (opts.loginButton
          ? '<button class="nav-login-btn" data-auth>' + GOOGLE_LOGO_SVG + ' Sign In</button>'
          : '')
      + '</div>'
      + '<button class="hamburger" aria-label="Toggle menu"><span></span><span></span><span></span></button>'
      + '</div>';
  }

  function mobileMenuHtml() {
    return ''
      + '<a href="index.html" data-i18n="mobile.home">🏠 Home</a>'
      + '<div class="mobile-nav-group">'
      + '<span class="mobile-nav-group-label" data-i18n="nav.trips">Trips</span>'
      + '<a href="japan.html" data-i18n="mobile.japan">Japan</a>'
      + '<a href="denmark.html" data-i18n="mobile.denmark">Denmark</a>'
      + '<a href="norway.html" data-i18n="mobile.norway">Norway</a>'
      + '</div>'
      + '<div class="mobile-nav-group">'
      + '<span class="mobile-nav-group-label" data-i18n="nav.planning">Planning</span>'
      + '<a href="planning-japan.html" data-i18n="mobile.japan">Japan</a>'
      + '<a href="planning-denmark.html" data-i18n="mobile.denmark">Denmark</a>'
      + '<a href="planning-norway.html" data-i18n="mobile.norway">Norway</a>'
      + '</div>'
      + '<a href="blog.html" data-i18n="mobile.blog">✍️ Blog</a>'
      + '<a href="gear.html" data-i18n="mobile.gear">🎒 Gear</a>'
      + '<a href="admin.html" class="admin-only-link" style="display:none" data-i18n="mobile.admin">⚙️ Admin</a>'
      + '<div class="mobile-lang-row">'
      + '<button class="mobile-lang-btn" data-lang="en">English</button>'
      + '<button class="mobile-lang-btn" data-lang="ja">日本語</button>'
      + '<button class="mobile-lang-btn" data-lang="no">Norsk</button>'
      + '</div>'
      + '<button class="btn btn-primary" style="margin-top:.5rem" onclick="openSubscribeModal()" data-i18n="mobile.subscribe">🔔 Subscribe to Updates</button>';
  }

  function init(opts) {
    opts = opts || {};
    var navEl = document.getElementById('site-navbar');
    if (navEl) navEl.innerHTML = navInnerHtml(opts);
    var mobileEl = document.getElementById('site-mobile-menu');
    if (mobileEl) mobileEl.innerHTML = mobileMenuHtml();
  }

  window.SiteNav = { init: init };
}());
