/* ============================================
   Tomika Bikes – Main JavaScript
   ============================================ */

// ── Page Loader ─────────────────────────────
window.addEventListener('load', () => {
  const loader = document.querySelector('.page-loader');
  if (loader) {
    setTimeout(() => {
      loader.classList.add('hidden');
      setTimeout(() => loader.remove(), 500);
    }, 600);
  }
});

// When the page is restored from the Back-Forward Cache (BFCache) on Mobile Safari,
// the 'load' event does not re-fire. Use 'pageshow' as a safety net to ensure the
// page loader is removed so the page doesn't appear stuck.
window.addEventListener('pageshow', (event) => {
  if (event.persisted) {
    const loader = document.querySelector('.page-loader');
    if (loader) loader.remove();
  }
});

// ── Navbar scroll effect ─────────────────────
const navbar = document.querySelector('.navbar');
if (navbar) {
  window.addEventListener('scroll', () => {
    navbar.classList.toggle('scrolled', window.scrollY > 30);
  });
}

// ── Hamburger / Mobile menu ──────────────────
const hamburger = document.querySelector('.hamburger');
const mobileMenu = document.querySelector('.mobile-menu');
if (hamburger && mobileMenu) {
  hamburger.addEventListener('click', () => {
    hamburger.classList.toggle('open');
    mobileMenu.classList.toggle('open');
    document.body.style.overflow = mobileMenu.classList.contains('open') ? 'hidden' : '';
  });

  // Close on link click
  mobileMenu.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => {
      hamburger.classList.remove('open');
      mobileMenu.classList.remove('open');
      document.body.style.overflow = '';
    });
  });
}

// ── Active nav link ──────────────────────────
(function setActiveNavLink() {
  const currentPath = window.location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav-links a, .mobile-menu a').forEach(link => {
    const href = link.getAttribute('href');
    if (href === currentPath || (currentPath === '' && href === 'index.html')) {
      link.classList.add('active');
    }
  });
})();

// ── Toast notifications ──────────────────────
function showToast(message, type = 'success') {
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const icons = { success: '✅', error: '❌', info: 'ℹ️' };
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span>${icons[type] || icons.info}</span><span>${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = 'slideIn 0.3s ease reverse';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// ── Auth Modal ───────────────────────────────
const authOverlay = document.querySelector('.auth-overlay');

function openAuth() {
  if (authOverlay) {
    authOverlay.classList.add('open');
    document.body.style.overflow = 'hidden';
  }
}

function closeAuth() {
  if (authOverlay) {
    authOverlay.classList.remove('open');
    document.body.style.overflow = '';
  }
}

if (authOverlay) {
  authOverlay.addEventListener('click', e => {
    if (e.target === authOverlay) closeAuth();
  });

  const closeBtn = authOverlay.querySelector('.auth-close');
  if (closeBtn) closeBtn.addEventListener('click', closeAuth);

  const googleBtn = authOverlay.querySelector('.google-btn');
  if (googleBtn) {
    googleBtn.addEventListener('click', () => {
      const originalHTML = googleBtn.innerHTML;
      googleBtn.disabled = true;
      googleBtn.textContent = 'Signing in…';
      ensureFirebaseAuth()
        .then(() => {
          const p = new firebase.auth.GoogleAuthProvider();
          // Mobile browsers block popups; use redirect flow instead
          if (/Mobi|Android|iPhone|iPad|iPod|IEMobile|Opera Mini/i.test(navigator.userAgent)) {
            return firebase.auth().signInWithRedirect(p);
          }
          return firebase.auth().signInWithPopup(p);
        })
        .catch(err => {
          console.error('Sign-in error:', err);
          showToast('Sign-in failed: ' + err.message, 'error');
          googleBtn.disabled = false;
          googleBtn.innerHTML = originalHTML;
        });
    });
  }
}

// ── Firebase Google Sign-In ──────────────────────────────────
const FIREBASE_SDK_VERSION = '10.12.2';

function loadScript(src) {
  return new Promise((resolve, reject) => {
    // Iterate to avoid CSS-selector injection via src string
    if ([...document.scripts].some(s => s.getAttribute('src') === src)) { resolve(); return; }
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

let _authListenerSet = false;

function ensureFirebaseAuth() {
  const needsApp = typeof firebase === 'undefined';
  const chain = needsApp
    ? loadScript('https://www.gstatic.com/firebasejs/' + FIREBASE_SDK_VERSION + '/firebase-app-compat.js')
        .then(() => loadScript('assets/js/firebase-config.js'))
    : Promise.resolve();
  return chain
    .then(() => loadScript('https://www.gstatic.com/firebasejs/' + FIREBASE_SDK_VERSION + '/firebase-auth-compat.js'))
    .then(() => {
      if (!firebase.apps.length) {
        firebase.initializeApp(FIREBASE_CONFIG);
      }
      if (!_authListenerSet) {
        _authListenerSet = true;
        firebase.auth().onAuthStateChanged(_onAuthStateChanged);
        // Handle errors that may have occurred during a signInWithRedirect flow
        firebase.auth().getRedirectResult().catch(err => {
          if (err.code && err.code !== 'auth/no-current-user') {
            console.error('Redirect sign-in error:', err);
            if (typeof showToast === 'function') showToast('Sign-in failed: ' + err.message, 'error');
          }
        });
      }
    });
}

function _onAuthStateChanged(user) {
  const googleLogoHTML = '<svg class="google-logo" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>';
  document.querySelectorAll('.nav-login-btn').forEach(btn => {
    if (user) {
      const label = (user.displayName || user.email || '').split(/[\s@]/)[0] || 'Account'; // first name or email username
      btn.textContent = label;
      btn.title = 'Sign out (' + user.email + ')';
      btn.dataset.signedIn = '1';
    } else {
      btn.innerHTML = googleLogoHTML + ' Sign In';
      btn.title = '';
      delete btn.dataset.signedIn;
    }
  });
  if (user) closeAuth();

  // Show Admin nav link only when signed in as the admin
  const adminEmail = (typeof ADMIN_EMAIL !== 'undefined') ? ADMIN_EMAIL : null;
  const isAdmin = user && adminEmail && user.email === adminEmail;
  document.querySelectorAll('.admin-only-link').forEach(el => {
    el.style.display = isAdmin ? '' : 'none';
  });

  // On admin page: auto-show/hide dashboard based on admin status
  const adminGate = document.getElementById('adminGate');
  const adminDashboard = document.getElementById('adminDashboard');
  if (adminGate && adminDashboard) {
    if (isAdmin) {
      adminGate.style.display = 'none';
      adminDashboard.style.display = 'grid';
    } else {
      adminGate.style.display = '';
      adminDashboard.style.display = 'none';
    }
  }
}

// Attach login buttons
document.querySelectorAll('[data-auth]').forEach(btn => {
  btn.addEventListener('click', () => {
    if (btn.dataset.signedIn) {
      ensureFirebaseAuth()
        .then(() => firebase.auth().signOut())
        .catch(err => console.error('Sign-out error:', err));
    } else if (authOverlay) {
      openAuth();
    } else {
      ensureFirebaseAuth()
        .then(() => firebase.auth().signInWithPopup(new firebase.auth.GoogleAuthProvider()))
        .catch(err => showToast('Sign-in failed: ' + err.message, 'error'));
    }
  });
});

// ── Scroll animations ────────────────────────
const observerOpts = { threshold: 0.1, rootMargin: '0px 0px -50px 0px' };
const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.style.opacity = '1';
      entry.target.style.transform = 'translateY(0)';
      observer.unobserve(entry.target);
    }
  });
}, observerOpts);

document.querySelectorAll('.card, .feature-box, .blog-post-card, .journal-entry, .trip-card').forEach(el => {
  el.style.opacity = '0';
  el.style.transform = 'translateY(24px)';
  el.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
  observer.observe(el);
});

// ── Smooth anchor scrolling ──────────────────
document.querySelectorAll('a[href^="#"]').forEach(link => {
  link.addEventListener('click', e => {
    const target = document.querySelector(link.getAttribute('href'));
    if (target) {
      e.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
});

// Expose helpers globally
window.TomikaBikes = { showToast, openAuth, closeAuth, ensureFirebaseAuth };

// ── Eager auth state restore ─────────────────
// If Firebase is already loaded on this page (e.g. admin/planning), or if we
// can lazy-load it, restore the previous sign-in state so the nav reflects it.
ensureFirebaseAuth().catch(() => {});
