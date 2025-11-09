// Firebase imports for theme functionality only
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { 
    getAuth, 
    onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { 
    getFirestore, 
    doc, 
    getDoc, 
    updateDoc,
    serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyC9uL_BX14Z6rRpgG4MT9Tca1opJl8EviQ",
    authDomain: "dating-connect.firebaseapp.com",
    projectId: "dating-connect",
    storageBucket: "dating-connect.appspot.com",
    messagingSenderId: "1062172180210",
    appId: "1:1062172180210:web:0c9b3c1578a5dbae58da6b"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Theme management class
class ChatThemeManager {
    constructor() {
        this.currentUser = null;
        this.currentTheme = 'default';
        this.init();
    }

    async init() {
        // Wait for auth state
        onAuthStateChanged(auth, (user) => {
            if (user) {
                this.currentUser = user;
                this.loadUserTheme();
            }
        });
    }

    // Load user's saved theme from Firebase
    async loadUserTheme() {
        if (!this.currentUser) return;

        try {
            const userRef = doc(db, 'users', this.currentUser.uid);
            const userSnap = await getDoc(userRef);
            
            if (userSnap.exists()) {
                const userData = userSnap.data();
                const savedTheme = userData.chatTheme || 'default';
                this.applyTheme(savedTheme);
            }
        } catch (error) {
            console.error('Error loading chat theme:', error);
        }
    }

    // Apply theme to the page
    applyTheme(theme) {
        this.currentTheme = theme;
        document.documentElement.setAttribute('data-theme', theme);
        
        // Dispatch custom event for other components to listen to
        window.dispatchEvent(new CustomEvent('themeChanged', { 
            detail: { theme: theme } 
        }));
    }

    // Save theme to Firebase
    async saveTheme(theme) {
        if (!this.currentUser) return false;

        try {
            const userRef = doc(db, 'users', this.currentUser.uid);
            await updateDoc(userRef, {
                chatTheme: theme,
                updatedAt: serverTimestamp()
            });
            
            this.applyTheme(theme);
            return true;
        } catch (error) {
            console.error('Error saving theme:', error);
            return false;
        }
    }

    // Get current theme
    getCurrentTheme() {
        return this.currentTheme;
    }

    // Get all available themes
    getAvailableThemes() {
        return [
            { id: 'default', name: 'Pink & White', preview: 'linear-gradient(135deg, #FF6B9D 0%, #FFB6C1 100%)' },
            { id: 'light-blue', name: 'Light Blue', preview: 'linear-gradient(135deg, #4A90E2 0%, #87CEEB 100%)' },
            { id: 'mint', name: 'Mint & White', preview: 'linear-gradient(135deg, #48C9B0 0%, #76D7C4 100%)' },
            { id: 'lavender', name: 'Lavender', preview: 'linear-gradient(135deg, #9B59B6 0%, #BB8FCE 100%)' },
            { id: 'sunset', name: 'Sunset', preview: 'linear-gradient(135deg, #FF7E5F 0%, #FFB88C 100%)' }
        ];
    }
}

// Initialize theme manager
const themeManager = new ChatThemeManager();

// Export for use in other files
window.ChatThemeManager = themeManager;

// Theme selector UI for account page
class ThemeSelectorUI {
    constructor() {
        this.themeManager = themeManager;
        this.init();
    }

    init() {
        // Only initialize if we're on the account page with display section
        if (this.isAccountPage()) {
            this.setupThemeSelector();
            this.loadCurrentThemeSelection();
        }
    }

    isAccountPage() {
        return window.location.pathname.includes('account.html');
    }

    setupThemeSelector() {
        const themesGrid = document.getElementById('themesGrid');
        if (!themesGrid) return;

        const themes = this.themeManager.getAvailableThemes();
        
        themesGrid.innerHTML = themes.map(theme => `
            <div class="theme-item" data-theme="${theme.id}">
                <div class="theme-preview" style="background: ${theme.preview}">
                    <div class="theme-preview-content">
                        ${theme.name}
                    </div>
                </div>
                <div class="theme-label">${theme.name}</div>
            </div>
        `).join('');

        // Add click listeners
        themesGrid.addEventListener('click', (e) => {
            const themeItem = e.target.closest('.theme-item');
            if (themeItem) {
                const themeId = themeItem.dataset.theme;
                this.selectTheme(themeId);
            }
        });
    }

    async selectTheme(themeId) {
        // Update UI
        this.updateThemeSelectionUI(themeId);
        
        // Update preview
        this.updateThemePreview(themeId);
        
        // Save to Firebase
        const success = await this.themeManager.saveTheme(themeId);
        
        if (success) {
            this.showNotification('Theme saved successfully!', 'success');
        } else {
            this.showNotification('Error saving theme', 'error');
            // Revert UI on error
            this.loadCurrentThemeSelection();
        }
    }

    updateThemeSelectionUI(selectedTheme) {
        const themeItems = document.querySelectorAll('.theme-item');
        themeItems.forEach(item => {
            const themePreview = item.querySelector('.theme-preview');
            themePreview.classList.remove('selected');
            
            if (item.dataset.theme === selectedTheme) {
                themePreview.classList.add('selected');
            }
        });
    }

    updateThemePreview(themeId) {
        const chatPreview = document.getElementById('chatPreview');
        if (chatPreview) {
            chatPreview.setAttribute('data-theme', themeId);
        }
    }

    async loadCurrentThemeSelection() {
        await this.themeManager.loadUserTheme();
        const currentTheme = this.themeManager.getCurrentTheme();
        this.updateThemeSelectionUI(currentTheme);
        this.updateThemePreview(currentTheme);
    }

    showNotification(message, type) {
        // Use existing notification system or create a simple one
        if (typeof showNotification === 'function') {
            showNotification(message, type);
        } else {
            // Fallback notification
            const notification = document.createElement('div');
            notification.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                background: ${type === 'success' ? '#28a745' : '#dc3545'};
                color: white;
                padding: 15px 20px;
                border-radius: 5px;
                z-index: 10000;
                box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            `;
            notification.textContent = message;
            document.body.appendChild(notification);
            
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 3000);
        }
    }
}

// Initialize theme selector UI
const themeSelectorUI = new ThemeSelectorUI();

// Auto-apply theme on chat pages
if (window.location.pathname.includes('chat.html')) {
    themeManager.loadUserTheme();
}

// Export for global access
window.themeManager = themeManager;
window.themeSelectorUI = themeSelectorUI;



