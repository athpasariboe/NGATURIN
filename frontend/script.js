// =============================================================
// NGATURIN — script.js  (shared across all pages)
// =============================================================
// CHANGES IN THIS FILE:
//
//  [2] 401 AUTO-LOGOUT  — apiRequest() now checks if the server
//                         returns HTTP 401 (token expired / invalid).
//                         When detected, it clears the token and
//                         redirects to login with a clear message.
//                         This means the user is never stuck on a
//                         broken page after their session expires.
//
//  [SESSION FIX]        — saveUserSession(), getUserSession(), and
//                         clearUserSession() all now use localStorage
//                         consistently (was mixed session/local before).
// =============================================================

document.addEventListener('DOMContentLoaded', function () {
    initFAQ();
    initSmoothScroll();
    initNavbarHighlight();
});

// ── FAQ Accordion ─────────────────────────────────────────────
function initFAQ() {
    document.querySelectorAll('.faq-item').forEach(item => {
        item.querySelector('.faq-question')?.addEventListener('click', () => {
            document.querySelectorAll('.faq-item').forEach(other => {
                if (other !== item) other.classList.remove('active');
            });
            item.classList.toggle('active');
        });
    });
}

// ── Smooth Scroll ─────────────────────────────────────────────
function initSmoothScroll() {
    document.querySelectorAll('.navbar__link').forEach(link => {
        link.addEventListener('click', function (e) {
            const href = this.getAttribute('href');
            if (href?.startsWith('#')) {
                e.preventDefault();
                const target = document.getElementById(href.substring(1));
                if (target) {
                    window.scrollTo({
                        top: target.offsetTop - (document.querySelector('.navbar')?.offsetHeight || 80),
                        behavior: 'smooth'
                    });
                    updateActiveNavLink(this);
                }
            }
        });
    });
}

// ── Navbar Highlight ──────────────────────────────────────────
function initNavbarHighlight() {
    const sections = document.querySelectorAll('section[id]');
    const navLinks = document.querySelectorAll('.navbar__link');
    window.addEventListener('scroll', () => {
        const navH = document.querySelector('.navbar')?.offsetHeight || 80;
        let current = '';
        sections.forEach(s => {
            if (window.pageYOffset >= s.offsetTop - navH - 100) current = s.id;
        });
        navLinks.forEach(link => {
            link.classList.toggle('active', link.getAttribute('href') === `#${current}`);
        });
    });
}

function updateActiveNavLink(activeLink) {
    document.querySelectorAll('.navbar__link').forEach(l => l.classList.remove('active'));
    activeLink.classList.add('active');
}

// ── Form Validation ───────────────────────────────────────────
function validateEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
function validatePassword(password) {
    return password.length >= 6;
}
function showError(inputElement, message) {
    const fg = inputElement.closest('.form-group');
    let err = fg.querySelector('.error-message');
    if (!err) {
        err = document.createElement('div');
        err.className = 'error-message';
        err.style.cssText = 'color:#D32F2F;font-size:var(--font-size-sm);margin-top:var(--spacing-xs);';
        fg.appendChild(err);
    }
    err.textContent = message;
    inputElement.style.borderColor = '#D32F2F';
}
function clearError(inputElement) {
    inputElement.closest('.form-group')?.querySelector('.error-message')?.remove();
    inputElement.style.borderColor = 'var(--color-border)';
}

// ── Toast Notification ────────────────────────────────────────
function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.textContent = message;
    toast.style.cssText = `
        position:fixed;bottom:20px;right:20px;z-index:9999;
        padding:var(--spacing-md) var(--spacing-lg);
        border-radius:var(--radius-md);color:white;
        background:${type === 'success' ? 'var(--color-primary)' : '#D32F2F'};
        box-shadow:var(--shadow-lg);animation:slideIn 0.3s ease;
    `;
    document.body.appendChild(toast);
    setTimeout(() => {
        toast.style.animation = 'fadeOut 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// =============================================================
// [SESSION FIX] SESSION MANAGEMENT
// All three helpers now consistently use localStorage.
// clearUserSession() removes both the token AND the user object.
// =============================================================

function saveUserSession(userData) {
    localStorage.setItem('ngaturin_user', JSON.stringify(userData));
}

function getUserSession() {
    try {
        const d = localStorage.getItem('ngaturin_user');
        return d ? JSON.parse(d) : null;
    } catch { return null; }
}

function clearUserSession() {
    localStorage.removeItem('token');
    localStorage.removeItem('ngaturin_user');
}

function isLoggedIn() {
    const token = localStorage.getItem('token');
    return !!(token && token !== 'undefined' && token !== 'null');
}

function getToken() {
    return localStorage.getItem('token');
}

// =============================================================
// [2] API HELPER WITH 401 AUTO-LOGOUT
//
// Every API call goes through this function.
// If the server returns 401 (token expired or invalid), we:
//   1. Clear the stored token and user data
//   2. Store a message to show on the login page
//   3. Redirect to login.html automatically
//
// This means the user never sees a broken page — they are
// cleanly sent back to login with an explanation.
// =============================================================

async function apiRequest(endpoint, method = 'GET', data = null) {
    const options = {
        method,
        headers: { 'Content-Type': 'application/json' }
    };

    const token = getToken();
    if (token) options.headers['Authorization'] = `Bearer ${token}`;
    if (data)  options.body = JSON.stringify(data);

    try {
        const response = await fetch(`https://ngaturin-kappa.vercel.app${endpoint}`, options);
        const result   = await response.json();

        // [2] Detect expired/invalid token → auto logout
        if (response.status === 401) {
            clearUserSession();
            // Store a flag so login.html can show a message
            sessionStorage.setItem('session_expired', '1');
            window.location.href = 'login.html';
            return;   // stop execution
        }

        if (!response.ok) {
            throw new Error(result.detail || result.message || 'Request failed');
        }

        return result;

    } catch (error) {
        // Don't swallow redirect (happens when location changes mid-async)
        if (error.name === 'AbortError') return;
        console.error('API Error:', error);
        throw error;
    }
}

// FadeOut animation for toast
const _style = document.createElement('style');
_style.textContent = `
    @keyframes fadeOut { from{opacity:1;transform:translateX(0)} to{opacity:0;transform:translateX(100px)} }
    @keyframes slideIn { from{opacity:0;transform:translateX(100px)} to{opacity:1;transform:translateX(0)} }
`;
document.head.appendChild(_style);
