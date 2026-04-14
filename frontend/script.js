// ========================================
// Ngaturin - Main JavaScript
// ========================================

document.addEventListener('DOMContentLoaded', function() {
    initFAQ();
    initSmoothScroll();
    initNavbarHighlight();
});

// ========== FAQ Accordion ==========
function initFAQ() {
    const faqItems = document.querySelectorAll('.faq-item');
    faqItems.forEach(item => {
        const question = item.querySelector('.faq-question');
        question.addEventListener('click', () => {
            faqItems.forEach(otherItem => {
                if (otherItem !== item && otherItem.classList.contains('active')) {
                    otherItem.classList.remove('active');
                }
            });
            item.classList.toggle('active');
        });
    });
}

// ========== Smooth Scroll Navigation ==========
function initSmoothScroll() {
    const navLinks = document.querySelectorAll('.navbar__link');
    navLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            const href = this.getAttribute('href');
            if (href && href.startsWith('#')) {
                e.preventDefault();
                const targetElement = document.getElementById(href.substring(1));
                if (targetElement) {
                    const navbarHeight = document.querySelector('.navbar').offsetHeight;
                    window.scrollTo({ top: targetElement.offsetTop - navbarHeight, behavior: 'smooth' });
                    updateActiveNavLink(this);
                }
            }
        });
    });
}

// ========== Navbar Active Link Highlight ==========
function initNavbarHighlight() {
    const sections = document.querySelectorAll('section[id]');
    const navLinks = document.querySelectorAll('.navbar__link');
    window.addEventListener('scroll', () => {
        let current = '';
        const navbarHeight = document.querySelector('.navbar')?.offsetHeight || 80;
        sections.forEach(section => {
            if (window.pageYOffset >= (section.offsetTop - navbarHeight - 100)) {
                current = section.getAttribute('id');
            }
        });
        navLinks.forEach(link => {
            link.classList.remove('active');
            if (link.getAttribute('href') === `#${current}`) link.classList.add('active');
        });
    });
}

function updateActiveNavLink(activeLink) {
    document.querySelectorAll('.navbar__link').forEach(link => link.classList.remove('active'));
    activeLink.classList.add('active');
}

// ========== Form Validation Helper ==========
function validateEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validatePassword(password) {
    return password.length >= 6;
}

function showError(inputElement, message) {
    const formGroup = inputElement.closest('.form-group');
    let errorDiv = formGroup.querySelector('.error-message');
    if (!errorDiv) {
        errorDiv = document.createElement('div');
        errorDiv.className = 'error-message';
        errorDiv.style.cssText = 'color:#D32F2F;font-size:var(--font-size-sm);margin-top:var(--spacing-xs);';
        formGroup.appendChild(errorDiv);
    }
    errorDiv.textContent = message;
    inputElement.style.borderColor = '#D32F2F';
}

function clearError(inputElement) {
    const formGroup = inputElement.closest('.form-group');
    const errorDiv = formGroup.querySelector('.error-message');
    if (errorDiv) errorDiv.remove();
    inputElement.style.borderColor = 'var(--color-border)';
}

// ========== Toast Notification ==========
function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    toast.style.cssText = `
        position:fixed;bottom:20px;right:20px;
        padding:var(--spacing-md) var(--spacing-lg);
        border-radius:var(--radius-md);
        background:${type === 'success' ? 'var(--color-primary)' : '#D32F2F'};
        color:white;box-shadow:var(--shadow-lg);z-index:9999;
        animation:slideIn 0.3s ease;
    `;
    document.body.appendChild(toast);
    setTimeout(() => {
        toast.style.animation = 'fadeOut 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// ============================================================
// SESSION MANAGEMENT
//
// FIX: Previously saveUserSession() wrote to sessionStorage but
//      clearUserSession() and isLoggedIn() read from localStorage,
//      so they were never in sync. Now all user-session helpers
//      consistently use localStorage.
// ============================================================

function saveUserSession(userData) {
    // FIX: was sessionStorage — now localStorage so it persists and
    //      matches what isLoggedIn() and clearUserSession() check.
    localStorage.setItem('ngaturin_user', JSON.stringify(userData));
}

function getUserSession() {
    const userData = localStorage.getItem('ngaturin_user');
    return userData ? JSON.parse(userData) : null;
}

function clearUserSession() {
    // FIX: now clears BOTH the token and the user data object.
    //      Previously only the token was cleared, leaving stale user
    //      data in sessionStorage forever.
    localStorage.removeItem('token');
    localStorage.removeItem('ngaturin_user');
}

function isLoggedIn() {
    const token = localStorage.getItem('token');
    return token && token !== 'undefined' && token !== 'null';
}

function getToken() {
    return localStorage.getItem('token');
}

// ========== API Helper ==========
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
        if (!response.ok) throw new Error(result.detail || result.message || 'Request failed');
        return result;
    } catch (error) {
        console.error('API Error:', error);
        throw error;
    }
}

// FadeOut animation for toast
const style = document.createElement('style');
style.textContent = `
    @keyframes fadeOut {
        from { opacity:1; transform:translateX(0); }
        to   { opacity:0; transform:translateX(100px); }
    }
`;
document.head.appendChild(style);
