// ========================================
// AI Coach - Chat Functionality (Multi-Session)
// ========================================

let chatSessions = [];
let currentSessionId = null;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    loadChatSessions();
    if (chatSessions.length === 0) {
        startNewChat();
    } else {
        // Load the most recent session
        loadSession(chatSessions[0].id);
    }
});

// Start a new chat session
function startNewChat() {
    const newSession = {
        id: Date.now().toString(),
        title: 'New Chat',
        messages: [],
        timestamp: new Date().toISOString()
    };

    chatSessions.unshift(newSession); // Add to top
    currentSessionId = newSession.id;

    // Clear UI and show welcome
    const chatMessages = document.getElementById('chatMessages');
    chatMessages.innerHTML = '';

    addMessageToUI("Hello! 👋 I'm your AI Financial Coach. How can I help you manage your money better today?", 'bot');

    saveChatSessions();
    renderSidebar();
}

// Load a specific session
function loadSession(sessionId) {
    const session = chatSessions.find(s => s.id === sessionId);
    if (!session) return;

    currentSessionId = sessionId;

    const chatMessages = document.getElementById('chatMessages');
    chatMessages.innerHTML = '';

    // Add greeting
    addMessageToUI("Hello! 👋 I'm your AI Financial Coach. How can I help you manage your money better today?", 'bot');

    // Add session messages
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
            padding: var(--spacing-sm);
            border-radius: var(--radius-sm);
            cursor: pointer;
            background: ${session.id === currentSessionId ? '#e9ecef' : 'transparent'};
            color: ${session.id === currentSessionId ? 'var(--color-dark)' : 'var(--color-text-light)'};
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            font-size: var(--font-size-sm);
            transition: background 0.2s;
        `;
        item.textContent = session.title;
        item.onclick = () => loadSession(session.id);

        // Hover effect helper
        item.onmouseover = () => { if (session.id !== currentSessionId) item.style.background = '#f8f9fa'; };
        item.onmouseout = () => { if (session.id !== currentSessionId) item.style.background = 'transparent'; };

        list.appendChild(item);
    });
}

// Handle sending a message
async function sendMessage() {
    const chatInput = document.getElementById('chatInput');
    const message = chatInput.value.trim();

    if (!message) return;

    // Find current session
    let session = chatSessions.find(s => s.id === currentSessionId);
    if (!session) {
        startNewChat();
        session = chatSessions.find(s => s.id === currentSessionId);
    }

    // Update title if it's the first user message
    if (session.messages.length === 0) {
        session.title = message.substring(0, 30) + (message.length > 30 ? '...' : '');
        renderSidebar();
    }

    // Add user message to UI
    addMessageToUI(message, 'user');
    chatInput.value = '';

    // Add to session data
    session.messages.push({
        message: message,
        is_bot: false,
        timestamp: new Date().toISOString()
    });
    saveChatSessions();

    // Show typing indicator
    showTypingIndicator();

    try {
        // Send to API
        const response = await sendToAI(message);

        // Remove typing indicator
        removeTypingIndicator();

        // Add bot response to UI
        addMessageToUI(response, 'bot');

        // Add to session data
        session.messages.push({
            message: response,
            is_bot: true,
            timestamp: new Date().toISOString()
        });
        saveChatSessions();

    } catch (error) {
        removeTypingIndicator();
        addMessageToUI('Sorry, I encountered an error. Please try again.', 'bot');
        console.error('Chat error:', error);
    }
}

// Send message to AI (Same Logic)
async function sendToAI(message) {
    const user = getUserSession();
    try {
        const response = await apiRequest('/api/chat', 'POST', {
            message: message,
            user_id: user?.id || 'guest'
        });
        return response.reply;
    } catch (error) {
        return getFallbackResponse(message);
    }
}

// Fallback responses (Same Logic)
function getFallbackResponse(message) {
    const lowerMessage = message.toLowerCase();
    if (lowerMessage.includes('budget')) return "Great question! Budgeting is all about planning how to spend your money wisely. A simple rule is the 50/30/20 method.";
    if (lowerMessage.includes('save')) return "Saving money is easier when you have a clear goal! Try using our Goal Saver feature.";
    if (lowerMessage.includes('invest')) return "Investing is a great way to grow your wealth! Start with low-risk options.";
    if (lowerMessage.includes('debt')) return "Dealing with debt can be stressful, but you can manage it! Prioritize high-interest debts first.";
    if (lowerMessage.includes('hello') || lowerMessage.includes('hi')) return "Hello! 👋 I'm your AI Financial Coach. What would you like to know?";
    return "That's an interesting question! I can help with budgeting, saving, investing, or debt management.";
}

// Add message to UI
function addMessageToUI(message, type) {
    const chatMessages = document.getElementById('chatMessages');
    const messageDiv = document.createElement('div');
    messageDiv.className = `chat-message ${type}`;
    const bubble = document.createElement('div');
    bubble.className = `chat-bubble ${type}`;
    bubble.textContent = message;
    messageDiv.appendChild(bubble);
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Typing Utilities
function showTypingIndicator() {
    const chatMessages = document.getElementById('chatMessages');
    const typingDiv = document.createElement('div');
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

// Storage handling
function saveChatSessions() {
    localStorage.setItem('ngaturin_chat_sessions', JSON.stringify(chatSessions));
}

function loadChatSessions() {
    const stored = localStorage.getItem('ngaturin_chat_sessions');
    if (stored) {
        try {
            chatSessions = JSON.parse(stored);
        } catch (e) {
            chatSessions = [];
        }
    }
}

// Handle Enter key
function handleKeyPress(event) {
    if (event.key === 'Enter') sendMessage();
}
