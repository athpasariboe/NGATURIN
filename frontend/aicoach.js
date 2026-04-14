// ========================================
// AI Coach - Chat Functionality (Multi-Session)
// ============================================================
// FIX: Previously the frontend called POST /api/chat but that
//      endpoint did not exist in the backend, so the AI always
//      fell back to canned keyword responses.
//
//      Now fixed:
//      1. sendToAI() sends the JWT token in the Authorization
//         header so the backend can authenticate the user.
//      2. The backend /api/chat endpoint (now added in main.py)
//         forwards the message to OpenAI gpt-4o-mini with a
//         finance-only system prompt, then returns the reply.
//      3. If the backend is unreachable, the fallback responses
//         are still used as a safety net.
// ============================================================

const AI_API_BASE = "https://ngaturin-kappa.vercel.app";

let chatSessions     = [];
let currentSessionId = null;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    loadChatSessions();
    if (chatSessions.length === 0) {
        startNewChat();
    } else {
        loadSession(chatSessions[0].id);
    }
});

// Start a new chat session
function startNewChat() {
    const newSession = {
        id:        Date.now().toString(),
        title:     'New Chat',
        messages:  [],
        timestamp: new Date().toISOString()
    };
    chatSessions.unshift(newSession);
    currentSessionId = newSession.id;

    document.getElementById('chatMessages').innerHTML = '';
    addMessageToUI("Hello! 👋 I'm your AI Financial Coach. How can I help you manage your money better today?", 'bot');

    saveChatSessions();
    renderSidebar();
}

// Load a specific session
function loadSession(sessionId) {
    const session = chatSessions.find(s => s.id === sessionId);
    if (!session) return;

    currentSessionId = sessionId;
    document.getElementById('chatMessages').innerHTML = '';
    addMessageToUI("Hello! 👋 I'm your AI Financial Coach. How can I help you manage your money better today?", 'bot');

    session.messages.forEach(msg => {
        addMessageToUI(msg.message, msg.is_bot ? 'bot' : 'user');
    });

    renderSidebar();
}

// Render the sidebar list
function renderSidebar() {
    const list = document.getElementById('chatHistoryList');
    if (!list) return;
    list.innerHTML = '';

    chatSessions.forEach(session => {
        const item = document.createElement('div');
        item.className = `history-item ${session.id === currentSessionId ? 'active' : ''}`;
        item.style.cssText = `
            padding: var(--spacing-sm); border-radius: var(--radius-sm); cursor: pointer;
            background: ${session.id === currentSessionId ? '#e9ecef' : 'transparent'};
            color: ${session.id === currentSessionId ? 'var(--color-dark)' : 'var(--color-text-light)'};
            white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
            font-size: var(--font-size-sm); transition: background 0.2s;
        `;
        item.textContent = session.title;
        item.onclick = () => loadSession(session.id);
        item.onmouseover = () => { if (session.id !== currentSessionId) item.style.background = '#f8f9fa'; };
        item.onmouseout  = () => { if (session.id !== currentSessionId) item.style.background = 'transparent'; };
        list.appendChild(item);
    });
}

// Handle sending a message
async function sendMessage() {
    const chatInput = document.getElementById('chatInput');
    const message   = chatInput.value.trim();
    if (!message) return;

    let session = chatSessions.find(s => s.id === currentSessionId);
    if (!session) {
        startNewChat();
        session = chatSessions.find(s => s.id === currentSessionId);
    }

    // Update sidebar title on first message
    if (session.messages.length === 0) {
        session.title = message.substring(0, 30) + (message.length > 30 ? '...' : '');
        renderSidebar();
    }

    addMessageToUI(message, 'user');
    chatInput.value = '';

    session.messages.push({ message, is_bot: false, timestamp: new Date().toISOString() });
    saveChatSessions();

    showTypingIndicator();

    try {
        const response = await sendToAI(message);
        removeTypingIndicator();
        addMessageToUI(response, 'bot');
        session.messages.push({ message: response, is_bot: true, timestamp: new Date().toISOString() });
        saveChatSessions();
    } catch (error) {
        removeTypingIndicator();
        addMessageToUI('Sorry, I encountered an error. Please try again.', 'bot');
        console.error('Chat error:', error);
    }
}

// ============================================================
// SEND MESSAGE TO AI
//
// FIX: Now calls the real backend endpoint with JWT auth.
//      The backend forwards to OpenAI (gpt-4o-mini) with a
//      finance-only system prompt.
//
//      If the backend fails for any reason, falls back to
//      keyword responses so the page never fully breaks.
// ============================================================
async function sendToAI(message) {
    const token = localStorage.getItem('token');

    try {
        const response = await fetch(`${AI_API_BASE}/api/chat`, {
            method:  'POST',
            headers: {
                'Content-Type':  'application/json',
                // FIX: include JWT token so backend can authenticate the user
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ message })
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            console.error('AI API error:', err.detail || response.status);
            return getFallbackResponse(message);
        }

        const data = await response.json();
        return data.reply;

    } catch (error) {
        console.error('Network error calling /api/chat:', error);
        return getFallbackResponse(message);
    }
}

// Fallback responses (used if backend is down)
function getFallbackResponse(message) {
    const m = message.toLowerCase();
    if (m.includes('budget'))  return "Budgeting is key! A simple approach is the 50/30/20 rule: 50% needs, 30% wants, 20% savings.";
    if (m.includes('save'))    return "Saving is easier with a clear goal! Try our Goal Saver feature to track your progress.";
    if (m.includes('invest'))  return "Investing helps grow your wealth! Start with low-risk instruments like deposits or reksa dana.";
    if (m.includes('debt'))    return "Tackle debt by prioritizing high-interest ones first — the avalanche method saves the most money.";
    if (m.includes('hello') || m.includes('hi')) return "Hello! 👋 I'm your AI Financial Coach. What would you like to know about managing money?";
    return "Great question! I can help you with budgeting, saving, investing, or managing debt. What would you like to explore?";
}

// Add message to UI
function addMessageToUI(message, type) {
    const chatMessages = document.getElementById('chatMessages');
    const messageDiv   = document.createElement('div');
    messageDiv.className = `chat-message ${type}`;
    const bubble = document.createElement('div');
    bubble.className = `chat-bubble ${type}`;
    bubble.textContent = message;
    messageDiv.appendChild(bubble);
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Typing indicator
function showTypingIndicator() {
    const chatMessages = document.getElementById('chatMessages');
    const typingDiv    = document.createElement('div');
    typingDiv.className = 'chat-message bot typing-indicator';
    typingDiv.id = 'typingIndicator';
    const bubble = document.createElement('div');
    bubble.className = 'chat-bubble bot';
    bubble.innerHTML = '<span>...</span>';
    typingDiv.appendChild(bubble);
    chatMessages.appendChild(typingDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function removeTypingIndicator() {
    const indicator = document.getElementById('typingIndicator');
    if (indicator) indicator.remove();
}

// Storage
function saveChatSessions() {
    localStorage.setItem('ngaturin_chat_sessions', JSON.stringify(chatSessions));
}

function loadChatSessions() {
    const stored = localStorage.getItem('ngaturin_chat_sessions');
    if (stored) {
        try { chatSessions = JSON.parse(stored); }
        catch { chatSessions = []; }
    }
}

// Enter key to send
function handleKeyPress(event) {
    if (event.key === 'Enter') sendMessage();
}
