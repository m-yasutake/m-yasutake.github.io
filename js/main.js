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
      showToast('Google Sign-In coming soon – Firebase integration pending', 'info');
      closeAuth();
    });
  }
}

// Attach login buttons
document.querySelectorAll('[data-auth]').forEach(btn => {
  btn.addEventListener('click', openAuth);
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
window.TomikaBikes = { showToast, openAuth, closeAuth };
