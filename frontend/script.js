// ========================================
// Ngaturin - Main JavaScript
// ========================================

// Wait for DOM to be fully loaded
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
            // Close other items
            faqItems.forEach(otherItem => {
                if (otherItem !== item && otherItem.classList.contains('active')) {
                    otherItem.classList.remove('active');
                }
            });
            
            // Toggle current item
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
            
            // Only handle hash links
            if (href && href.startsWith('#')) {
                e.preventDefault();
                const targetId = href.substring(1);
                const targetElement = document.getElementById(targetId);
                
                if (targetElement) {
                    const navbarHeight = document.querySelector('.navbar').offsetHeight;
                    const targetPosition = targetElement.offsetTop - navbarHeight;
                    
                    window.scrollTo({
                        top: targetPosition,
                        behavior: 'smooth'
                    });
                    
                    // Update active link
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
            const sectionTop = section.offsetTop;
            const sectionHeight = section.clientHeight;
            
            if (window.pageYOffset >= (sectionTop - navbarHeight - 100)) {
                current = section.getAttribute('id');
            }
        });
        
        navLinks.forEach(link => {
            link.classList.remove('active');
            const href = link.getAttribute('href');
            if (href === `#${current}`) {
                link.classList.add('active');
            }
        });
    });
}

function updateActiveNavLink(activeLink) {
    const navLinks = document.querySelectorAll('.navbar__link');
    navLinks.forEach(link => link.classList.remove('active'));
    activeLink.classList.add('active');
}

// ========== Form Validation Helper ========== 
function validateEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
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
        errorDiv.style.color = '#D32F2F';
        errorDiv.style.fontSize = 'var(--font-size-sm)';
        errorDiv.style.marginTop = 'var(--spacing-xs)';
        formGroup.appendChild(errorDiv);
    }
    
    errorDiv.textContent = message;
    inputElement.style.borderColor = '#D32F2F';
}

function clearError(inputElement) {
    const formGroup = inputElement.closest('.form-group');
    const errorDiv = formGroup.querySelector('.error-message');
    
    if (errorDiv) {
        errorDiv.remove();
    }
    
    inputElement.style.borderColor = 'var(--color-border)';
}

// ========== Toast Notification ========== 
function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    
    toast.style.position = 'fixed';
    toast.style.bottom = '20px';
    toast.style.right = '20px';
    toast.style.padding = 'var(--spacing-md) var(--spacing-lg)';
    toast.style.borderRadius = 'var(--radius-md)';
    toast.style.backgroundColor = type === 'success' ? 'var(--color-primary)' : '#D32F2F';
    toast.style.color = 'white';
    toast.style.boxShadow = 'var(--shadow-lg)';
    toast.style.zIndex = '9999';
    toast.style.animation = 'slideIn 0.3s ease';
    
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'fadeOut 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// ========== Session Management ========== 
function saveUserSession(userData) {
    sessionStorage.setItem('ngaturin_user', JSON.stringify(userData));
}

function getUserSession() {
    const userData = sessionStorage.getItem('ngaturin_user');
    return userData ? JSON.parse(userData) : null;
}

function clearUserSession() {
    localStorage.removeItem("token");
}

function isLoggedIn() {
    const token = localStorage.getItem("token");
    return token && token !== "undefined" && token !== "null";
}

function getToken() {
    return localStorage.getItem("token");
}

// ========== API Helper Functions ========== 
async function apiRequest(endpoint, method = 'GET', data = null) {
    const options = {
        method: method,
        headers: {
            'Content-Type': 'application/json',
        }
    };
    
    // --- TAMBAHAN BARU: Selipkan Karcis (Token) jika user sudah login ---
    const token = getToken();
    if (token) {
        options.headers['Authorization'] = `Bearer ${token}`;
    }
    // -------------------------------------------------------------------

    if (data) {
        options.body = JSON.stringify(data);
    }
    
    try {
        const response = await fetch(`https://ngaturin-kappa.vercel.app${endpoint}`, options);
        const result = await response.json();
        
        if (!response.ok) {
            throw new Error(result.detail || result.message || 'Request failed');
        }
        
        return result;
    } catch (error) {
        console.error('API Error:', error);
        throw error;
    }
}

// Add fadeOut animation for toast
const style = document.createElement('style');
style.textContent = `
    @keyframes fadeOut {
        from {
            opacity: 1;
            transform: translateX(0);
        }
        to {
            opacity: 0;
            transform: translateX(100px);
        }
    }
`;
document.head.appendChild(style);
