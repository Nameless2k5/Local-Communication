// Main application entry point
import Auth from './auth.js?v=3';
import Chat from './chat.js?v=3';
import ProfileManager from './profileManager.js?v=3';
import { CallManager } from './webrtc.js?v=3';
import { API_BASE_URL } from './config.js?v=3';

class App {
    constructor() {
        this.auth = new Auth();
        this.chat = null;
        this.profileManager = new ProfileManager();
        this.callManager = new CallManager(this);
        this.currentUser = null;

        this.initTheme();
        this.init();
    }

    async init() {
        // Setup Event Listeners early prevents skipping if logged in
        this.setupAuthHandlers();

        // Check if user is already logged in
        const token = sessionStorage.getItem('token');

        if (token) {
            try {
                const response = await fetch(`${API_BASE_URL}/api/auth/verify`, {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });

                if (response.ok) {
                    const data = await response.json();
                    this.onLoginSuccess(data.user, token);
                    return;
                }
            } catch (error) {
                console.error('Token verification failed:', error);
            }

            // Token is invalid, remove it
            sessionStorage.removeItem('token');
        }

        // Show auth screen
        this.showAuthScreen();
    }

    showAuthScreen() {
        document.getElementById('auth-screen').classList.remove('hidden');
        document.getElementById('chat-screen').classList.add('hidden');
    }

    showChatScreen() {
        document.getElementById('auth-screen').classList.add('hidden');
        document.getElementById('chat-screen').classList.remove('hidden');
    }

    setupAuthHandlers() {
        // Login form
        document.getElementById('login-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const username = document.getElementById('login-username').value;
            const password = document.getElementById('login-password').value;

            try {
                const result = await this.auth.login(username, password);
                this.onLoginSuccess(result.user, result.token);
            } catch (error) {
                this.showError(error.message);
            }
        });

        // Register form
        document.getElementById('register-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const username = document.getElementById('register-username').value;
            const email = document.getElementById('register-email').value;
            const password = document.getElementById('register-password').value;

            try {
                const result = await this.auth.register(username, email, password);
                this.onLoginSuccess(result.user, result.token);
            } catch (error) {
                this.showError(error.message);
            }
        });

        // Toggle between login and register
        document.getElementById('show-register').addEventListener('click', (e) => {
            e.preventDefault();
            document.getElementById('login-form').classList.add('hidden');
            document.getElementById('register-form').classList.remove('hidden');
            this.hideError();
        });

        document.getElementById('show-login').addEventListener('click', (e) => {
            e.preventDefault();
            document.getElementById('register-form').classList.add('hidden');
            document.getElementById('login-form').classList.remove('hidden');
            this.hideError();
        });
    }

    onLoginSuccess(user, token) {
        this.currentUser = user;
        sessionStorage.setItem('token', token);
        sessionStorage.setItem('user', JSON.stringify(user));

        // Update UI with user info
        document.getElementById('current-username').textContent = user.nickname || user.username;
        const avatar = document.getElementById('current-user-avatar');

        if (user.avatar_url) {
            avatar.style.backgroundImage = `url(${user.avatar_url})`;
            avatar.style.backgroundSize = 'cover';
            avatar.textContent = '';
        } else {
            avatar.textContent = user.username.charAt(0).toUpperCase();
        }

        // Initialize chat and profile manager
        this.profileManager.init(user);
        this.chat = new Chat(user, token, this.profileManager);
        window.chatApp = this.chat; // Assign global reference for UI components
        this.callManager.setSocket(this.chat.socket);

        this.showChatScreen();
        this.hideError();

        // Setup logout button (after showing chat screen)
        // Remove any existing listener to avoid duplicates
        const logoutBtn = document.getElementById('logout-btn');
        if (this.logoutHandler) {
            logoutBtn.removeEventListener('click', this.logoutHandler);
        }
        this.logoutHandler = () => this.logout();
        logoutBtn.addEventListener('click', this.logoutHandler);
    }

    logout() {
        sessionStorage.removeItem('token');
        sessionStorage.removeItem('user');

        if (this.chat) {
            this.chat.disconnect();
            this.chat = null;
        }

        this.currentUser = null;
        this.showAuthScreen();

        // Reset forms
        document.getElementById('login-form').reset();
        document.getElementById('register-form').reset();

        // Reset DOM elements of chat screen
        document.getElementById('user-list').innerHTML = '';
        document.getElementById('messages-container').innerHTML = '';
        document.getElementById('chat-active').classList.add('hidden');
        document.getElementById('chat-empty').classList.remove('hidden');
        document.getElementById('chat-sidebar-right').classList.add('hidden');
        document.getElementById('current-username').textContent = '';
        document.getElementById('current-user-avatar').style.backgroundImage = '';
        document.getElementById('current-user-avatar').textContent = '';

        // Remove active background if any
        const mainContainer = document.querySelector('.chat-main');
        if (mainContainer) {
            mainContainer.style.background = '';
            mainContainer.style.backgroundImage = '';
        }
    }

    showError(message) {
        const errorEl = document.getElementById('auth-error');
        errorEl.textContent = message;
        errorEl.classList.remove('hidden');
    }

    hideError() {
        const errorEl = document.getElementById('auth-error');
        errorEl.classList.add('hidden');
    }

    initTheme() {
        const savedTheme = localStorage.getItem('theme') || 'dark';
        document.documentElement.setAttribute('data-theme', savedTheme);
        this.updateThemeIcon(savedTheme);

        const toggleBtn = document.getElementById('theme-toggle-btn');
        if (toggleBtn) {
            // Remove existing listeners to be safe (though this is init)
            const newBtn = toggleBtn.cloneNode(true);
            toggleBtn.parentNode.replaceChild(newBtn, toggleBtn);
            newBtn.addEventListener('click', () => this.toggleTheme());
        }
    }

    toggleTheme() {
        const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';

        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
        this.updateThemeIcon(newTheme);
    }

    updateThemeIcon(theme) {
        const toggleBtn = document.getElementById('theme-toggle-btn');
        if (!toggleBtn) return;

        if (theme === 'light') {
            // Sun icon
            toggleBtn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>';
            toggleBtn.title = "Chuyển sang chế độ Tối";
        } else {
            // Moon icon
            toggleBtn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>';
            toggleBtn.title = "Chuyển sang chế độ Sáng";
        }
    }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.app = new App();
});
