// Firebase configuration
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { 
    getAuth, 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword, 
    signOut, 
    onAuthStateChanged,
    sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { 
    getFirestore, 
    collection, 
    doc, 
    setDoc, 
    getDoc, 
    updateDoc, 
    query, 
    where, 
    getDocs,
    addDoc,
    serverTimestamp,
    onSnapshot,
    orderBy,
    limit,
    arrayUnion,
    arrayRemove
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

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

// Cloudinary configuration (for images, audio, and videos)
const cloudinaryConfig = {
    cloudName: "ddtdqrh1b",
    uploadPreset: "profile-pictures",
    apiUrl: "https://api.cloudinary.com/v1_1"
};

// Emoji reactions
const EMOJI_REACTIONS = ['👍', '❤️', '🔥', '😘', '👎', '🤘', '💯'];

// Event listener management system
class EventManager {
    constructor() {
        this.listeners = new Map();
    }

    addListener(element, event, handler, options = {}) {
        if (!element) {
            console.warn('Cannot add listener to null element for event:', event);
            return () => {};
        }
        
        const key = `${element.id || element.className}-${event}-${Date.now()}`;
        element.addEventListener(event, handler, options);
        this.listeners.set(key, { element, event, handler });
        
        return () => this.removeListener(key);
    }

    removeListener(key) {
        const listener = this.listeners.get(key);
        if (listener) {
            const { element, event, handler } = listener;
            element.removeEventListener(event, handler);
            this.listeners.delete(key);
        }
    }

    clearAll() {
        this.listeners.forEach((listener, key) => {
            this.removeListener(key);
        });
    }

    // Add multiple listeners at once
    addListeners(configs) {
        const removers = [];
        configs.forEach(config => {
            const remover = this.addListener(
                config.element, 
                config.event, 
                config.handler, 
                config.options
            );
            removers.push(remover);
        });
        return removers;
    }
}

const eventManager = new EventManager();

// Cache configuration
class LocalCache {
    constructor() {
        this.cachePrefix = 'datingApp_';
        this.cacheExpiry = {
            short: 1 * 60 * 1000, // 1 minute
            medium: 5 * 60 * 1000, // 5 minutes
            long: 30 * 60 * 1000 // 30 minutes
        };
    }

    set(key, data, expiryType = 'medium') {
        try {
            const item = {
                data: data,
                expiry: Date.now() + (this.cacheExpiry[expiryType] || this.cacheExpiry.medium)
            };
            localStorage.setItem(this.cachePrefix + key, JSON.stringify(item));
        } catch (error) {
            console.error('Cache set error:', error);
        }
    }

    get(key) {
        try {
            const itemStr = localStorage.getItem(this.cachePrefix + key);
            if (!itemStr) return null;
            
            const item = JSON.parse(itemStr);
            if (Date.now() > item.expiry) {
                localStorage.removeItem(this.cachePrefix + key);
                return null;
            }
            return item.data;
        } catch (error) {
            console.error('Cache get error:', error);
            return null;
        }
    }

    remove(key) {
        try {
            localStorage.removeItem(this.cachePrefix + key);
        } catch (error) {
            console.error('Cache remove error:', error);
        }
    }

    clear() {
        try {
            Object.keys(localStorage).forEach(key => {
                if (key.startsWith(this.cachePrefix)) {
                    localStorage.removeItem(key);
                }
            });
        } catch (error) {
            console.error('Cache clear error:', error);
        }
    }
}

const cache = new LocalCache();

// State variables for reactions and replies
let selectedMessageForReaction = null;
let selectedMessageForReply = null;
let longPressTimer = null;

// Network connectivity state
let isOnline = navigator.onLine;
let networkRetryAttempts = 0;
const MAX_RETRY_ATTEMPTS = 3;

// Global variables
let currentUser = null;
let profiles = [];
let currentProfileIndex = 0;
let chatPartnerId = null;
let unsubscribeMessages = null;
let unsubscribeChat = null;
let typingTimeout = null;
let userChatPoints = 0;
let globalMessageListener = null;

// Voice recording variables - UPDATED: Added preloaded stream
let mediaRecorder = null;
let audioChunks = [];
let recordingStartTime = null;
let recordingTimer = null;
let preloadedAudioStream = null; // NEW: Pre-loaded stream for faster recording

// Video recording variables
let videoRecorder = null;
let videoChunks = [];
let videoRecordingStartTime = null;
let videoRecordingTimer = null;

// DOM Elements
let currentPage = window.location.pathname.split('/').pop().split('.')[0];
const navToggle = document.getElementById('mobile-menu');
const navMenu = document.querySelector('.nav-menu');
const messageCountElements = document.querySelectorAll('.message-count');

// NEW: Pre-load microphone permissions for faster voice recording
async function preloadMicrophonePermission() {
    try {
        // Check permission state without prompting user
        if (navigator.permissions && navigator.permissions.query) {
            const permissionStatus = await navigator.permissions.query({ name: 'microphone' });
            
            // If permission is already granted, pre-load the media stream
            if (permissionStatus.state === 'granted') {
                try {
                    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                    preloadedAudioStream = stream;
                    console.log('Microphone pre-loaded for faster recording');
                } catch (error) {
                    console.log('Could not pre-load microphone:', error);
                }
            }
        }
    } catch (error) {
        console.log('Microphone pre-load not supported:', error);
    }
}

// Call pre-load on page load for chat page
if (currentPage === 'chat') {
    setTimeout(preloadMicrophonePermission, 2000);
}

// File validation functions
function validateVideoFile(file) {
    const maxSize = 100 * 1024 * 1024; // 100MB
    if (file.size > maxSize) {
        throw new Error('Video file must be less than 100MB');
    }
    
    const allowedTypes = ['video/mp4', 'video/webm', 'video/quicktime', 'video/mov', 'video/avi'];
    if (!allowedTypes.includes(file.type)) {
        throw new Error('Please upload a valid video file (MP4, WebM, MOV, AVI)');
    }
    
    return true;
}

function validateImageFile(file) {
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
        throw new Error('Image file must be less than 10MB');
    }
    
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
        throw new Error('Please upload a valid image file (JPEG, PNG, GIF, WebP)');
    }
    
    return true;
}

// Notification system
function showNotification(message, type = 'info', duration = 3000) {
    // Remove any existing notifications first
    const existingNotifications = document.querySelectorAll('.custom-notification');
    existingNotifications.forEach(notification => notification.remove());
    
    const notification = document.createElement('div');
    notification.className = `custom-notification ${type}`;
    notification.innerHTML = `
        <div class="notification-content">
            <i class="notification-icon ${getNotificationIcon(type)}"></i>
            <span>${message}</span>
        </div>
    `;
    
    // Add styles if not already added
    if (!document.getElementById('notification-styles')) {
        const styles = document.createElement('style');
        styles.id = 'notification-styles';
        styles.textContent = `
            .custom-notification {
                position: fixed;
                top: 20px;
                right: 20px;
                background: white;
                padding: 15px 20px;
                border-radius: 8px;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
                z-index: 10000;
                display: flex;
                align-items: center;
                max-width: 350px;
                animation: slideIn 0.3s ease;
                border-left: 4px solid;
            }
            .custom-notification.success {
                border-left-color: var(--success-color, #28a745);
            }
            .custom-notification.error {
                border-left-color: var(--error-color, #dc3545);
            }
            .custom-notification.info {
                border-left-color: var(--accent-color, #007bff);
            }
            .custom-notification.warning {
                border-left-color: var(--warning-color, #ffc107);
            }
            .notification-content {
                display: flex;
                align-items: center;
                gap: 10px;
                color: black;
            }
            .notification-icon {
                font-size: 18px;
            }
            .success .notification-icon {
                color: var(--success-color, #28a745);
            }
            .error .notification-icon {
                color: var(--error-color, #dc3545);
            }
            .info .notification-icon {
                color: var(--accent-color, #007bff);
            }
            .warning .notification-icon {
                color: var(--warning-color, #ffc107);
            }
            @keyframes slideIn {
                from { transform: translateX(100%); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
            }
            @keyframes slideOut {
                from { transform: translateX(0); opacity: 1; }
                to { transform: translateX(100%); opacity: 0; }
            }
        `;
        document.head.appendChild(styles);
    }
    
    document.body.appendChild(notification);
    
    // Auto remove after duration
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    }, duration);
    
    return notification;
}

function getNotificationIcon(type) {
    switch(type) {
        case 'success': return 'fas fa-check-circle';
        case 'error': return 'fas fa-exclamation-circle';
        case 'warning': return 'fas fa-exclamation-triangle';
        default: return 'fas fa-info-circle';
    }
}

// Network connectivity monitoring
function setupNetworkMonitoring() {
    window.addEventListener('online', handleNetworkOnline);
    window.addEventListener('offline', handleNetworkOffline);
    
    // Initial check
    if (!isOnline) {
        handleNetworkOffline();
    }
}

function handleNetworkOnline() {
    isOnline = true;
    networkRetryAttempts = 0;
    showNotification('Connection restored', 'success', 2000);
    
    // Reload current page data
    reloadCurrentPageData();
}

function handleNetworkOffline() {
    isOnline = false;
    showNotification('No internet connection', 'warning', 5000);
}

function reloadCurrentPageData() {
    const currentPage = window.location.pathname.split('/').pop().split('.')[0];
    
    switch(currentPage) {
        case 'mingle':
            loadProfiles();
            break;
        case 'messages':
            loadMessageThreads();
            break;
        case 'chat':
            if (chatPartnerId) {
                loadChatMessages(currentUser.uid, chatPartnerId);
            }
            break;
        case 'dashboard':
            loadUserChatPoints();
            break;
    }
}

// Microphone Permission Popup Function
function showMicrophonePermissionPopup() {
    // Check if we've already shown the popup to this user
    if (localStorage.getItem('microphonePermissionShown')) {
        return;
    }
    
    // Create popup element
    const popup = document.createElement('div');
    popup.className = 'microphone-permission-popup';
    popup.innerHTML = `
        <div class="permission-popup-content">
            <h3>Enable Microphone Access</h3>
            <p>Would you like to enable microphone access for voice messages and notes?</p>
            <div class="permission-buttons">
                <button id="permissionDeny" class="permission-btn deny">Not Now</button>
                <button id="permissionAllow" class="permission-btn allow">Allow</button>
            </div>
        </div>
    `;
    
    // Add styles for the popup
    const styles = document.createElement('style');
    styles.textContent = `
        .microphone-permission-popup {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-color: var(--discord-darker, #2f3136);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 10000;
        }
        .permission-popup-content {
            background-color: var(--discord-darker, #2f3136);
            padding: 20px;
            border-radius: 10px;
            max-width: 400px;
            width: 90%;
            text-align: center;
        }
        .permission-popup-content h3 {
            margin-bottom: 10px;
            color: var(--text-dark);
        }
        .permission-popup-content p {
            margin-bottom: 20px;
            color: var(--discord-dark, #36393f);
        }
        .permission-buttons {
            display: flex;
            justify-content: center;
            gap: 10px;
        }
        .permission-btn {
            padding: 10px 20px;
            border: none;
            border-radius: 5px;
            cursor: pointer;
            font-weight: bold;
        }
        .permission-btn.deny {
            background-color: var(--discord-dark, #36393f);
            color: #333;
        }
        .permission-btn.allow {
            background-color:var(--primary-blue, #4a8cff);
            color: white;
        }
    `;
    document.head.appendChild(styles);
    document.body.appendChild(popup);
    
    // Add event listeners to buttons
    document.getElementById('permissionAllow').addEventListener('click', async () => {
        try {
            const hasPermission = await requestMicrophonePermission();
            if (hasPermission) {
                showNotification('Microphone access enabled successfully!', 'success');
                // Pre-load the stream after permission is granted
                preloadMicrophonePermission();
            } else {
                showNotification('Could not enable microphone access. You can enable it later in your browser settings.', 'warning');
            }
        } catch (error) {
            console.error('Error enabling microphone:', error);
            showNotification('Error enabling microphone access. Please try again later.', 'error');
        }
        // Mark as shown and remove popup
        localStorage.setItem('microphonePermissionShown', 'true');
        document.body.removeChild(popup);
        document.head.removeChild(styles);
    });
    
    document.getElementById('permissionDeny').addEventListener('click', () => {
        // Mark as shown and remove popup
        localStorage.setItem('microphonePermissionShown', 'true');
        document.body.removeChild(popup);
        document.head.removeChild(styles);
    });
}

// Microphone Permission Handling
async function requestMicrophonePermission() {
    try {
        // Check if we already have permission
        if (navigator.permissions && navigator.permissions.query) {
            const currentPermission = await navigator.permissions.query({ name: 'microphone' });
            if (currentPermission.state === 'granted') {
                return true;
            }
        }
        
        // Request permission by trying to access the microphone
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        
        // Immediately stop using the stream
        stream.getTracks().forEach(track => track.stop());
        
        return true;
    } catch (error) {
        console.error('Microphone permission denied:', error);
        return false;
    }
}

// Camera Permission Handling
async function requestCameraPermission() {
    try {
        // Check if we already have permission
        if (navigator.permissions && navigator.permissions.query) {
            const currentPermission = await navigator.permissions.query({ name: 'camera' });
            if (currentPermission.state === 'granted') {
                return true;
            }
        }
        
        // Request permission by trying to access the camera
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        
        // Immediately stop using the stream
        stream.getTracks().forEach(track => track.stop());
        
        return true;
    } catch (error) {
        console.error('Camera permission denied:', error);
        return false;
    }
}

async function checkMicrophonePermission() {
    try {
        if (!navigator.permissions || !navigator.permissions.query) {
            return 'unknown';
        }
        
        const permissionStatus = await navigator.permissions.query({ name: 'microphone' });
        return permissionStatus.state;
    } catch (error) {
        console.error('Error checking microphone permission:', error);
        return 'unknown';
    }
}

// Error logging utility
function logError(error, context = '') {
    console.error(`[${new Date().toISOString()}] Error${context ? ` in ${context}` : ''}:`, error);
}

// SIMPLIFIED: Removed all verification handling - users can use the app immediately
async function handleUserVerification(user) {
    // No verification required - users can use the app immediately
    console.log('User authenticated:', user.email);
}

// SIMPLIFIED: Login without verification checks
async function enhancedLogin(email, password) {
    try {
        console.log('Attempting login for:', email);
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        
        console.log('Login successful');
        return true;
    } catch (error) {
        console.error('Login error:', error);
        throw error;
    }
}

// Function to clean up all listeners
function cleanupAllListeners() {
    // Clean up messages page listener
    if (unsubscribeMessages) {
        unsubscribeMessages();
        unsubscribeMessages = null;
    }
    
    // Clean up chat page
    cleanupChatPage();
    
    // Clean up global message listener
    if (globalMessageListener) {
        globalMessageListener();
        globalMessageListener = null;
    }
    
    // Clear any remaining timers
    if (typingTimeout) clearTimeout(typingTimeout);
    if (recordingTimer) clearInterval(recordingTimer);
    if (videoRecordingTimer) clearInterval(videoRecordingTimer);
    if (longPressTimer) clearTimeout(longPressTimer);
    
    // Clear preloaded audio stream
    if (preloadedAudioStream) {
        preloadedAudioStream.getTracks().forEach(track => track.stop());
        preloadedAudioStream = null;
    }
    
    // Clear all event listeners
    eventManager.clearAll();
}

// Enhanced logout function
async function handleLogout() {
    try {
        // Set offline status before signing out
        if (currentUser && currentUser.uid) {
            const userStatusRef = doc(db, 'status', currentUser.uid);
            await setDoc(userStatusRef, {
                state: 'offline',
                lastChanged: serverTimestamp(),
                lastSeen: serverTimestamp(),
                userId: currentUser.uid
            }, { merge: true });
        }
        
        // Clear all listeners and timeouts
        cleanupAllListeners();
        
        // Sign out from Firebase Auth
        await signOut(auth);
        
        // Clear local state
        currentUser = null;
        cache.clear();
        
        showNotification('Logged out successfully', 'success');
        setTimeout(() => {
            window.location.href = 'login.html';
        }, 1000);
        
    } catch (error) {
        logError(error, 'logout');
        showNotification(error.message, 'error');
    }
}

// Initialize page based on current page
document.addEventListener('DOMContentLoaded', () => {
    // Add loader styles immediately
    const style = document.createElement('style');
    style.textContent = `
        .page-loader {
            display: flex;
            justify-content: center;
            align-items: center;
            height: 200px;
            flex-direction: column;
            gap: 20px;
        }
        .message-loader {
            display: flex;
            justify-content: center;
            padding: 40px 0;
        }
        .dot-pulse {
            position: relative;
            width: 10px;
            height: 10px;
            border-radius: 5px;
            background-color: var(--accent-color);
            color: var(--accent-color);
            animation: dot-pulse 1.5s infinite linear;
            animation-delay: 0.25s;
        }
        .dot-pulse::before, .dot-pulse::after {
            content: '';
            display: inline-block;
            position: absolute;
            top: 0;
            width: 10px;
            height: 10px;
            border-radius: 5px;
            background-color: var(--accent-color);
            color: var(--accent-color);
        }
        .dot-pulse::before {
            left: -15px;
            animation: dot-pulse 1.5s infinite linear;
            animation-delay: 0s;
        }
        .dot-pulse::after {
            left: 15px;
            animation: dot-pulse 1.5s infinite linear;
            animation-delay: 0.5s;
        }
        @keyframes dot-pulse {
            0%, 100% { transform: scale(0.8); opacity: 0.5; }
            50% { transform: scale(1.2); opacity: 1; }
        }
        
        /* Loading message styles */
        .loading-message {
            display: flex;
            justify-content: center;
            padding: 20px;
            color: var(--text-light);
            font-style: italic;
        }
        
        /* Voice note styles - UPDATED for faster response */
        .voice-note-indicator {
            display: none;
            align-items: center;
            justify-content: space-between;
            padding: 10px;
            background-color: var(--bg-light);
            border-radius: 20px;
            margin: 10px 0;
            animation: slideUp 0.2s ease-out;
        }
        .voice-note-timer {
            font-size: 14px;
            color: var(--text-dark);
            font-weight: bold;
        }
        .voice-note-controls {
            display: flex;
            gap: 10px;
        }
        .voice-message {
            max-width: 400px;
            padding: 8px 15px;
            border-radius: 18px;
            margin: 5px 0;
            position: relative;
            display: flex;
            align-items: center;
            gap: 10px;
        }
        .voice-message.sent {
            background-color: var(--accent-color);
            color: white;
            align-self: flex-end;
        }
        .voice-message.received {
            background-color: var(--accent-color);
            color: var(--text-dark);
            align-self: flex-start;
        }
        .voice-message-controls {
            display: flex;
            align-items: center;
            margin-top: 5px;
        }
        .voice-message-play-btn {
            background: blue;
            border: none;
            border-radius: 50%;
            color: white;
            font-size: 14px;
            cursor: pointer;
            padding: 6px;
            width: 30px;
            height: 30px;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .voice-message-duration {
            font-size: 12px;
            margin-left: 10px;
        }
        .waveform {
            height: 20px;
            width: 60px;
            display: flex;
            align-items: center;
            justify-content: space-between;
        }
        .waveform-bar {
            background-color: currentColor;
            width: 3px;
            border-radius: 3px;
            transition: height 0.2s ease;
        }
        .waveform-bar.active {
            animation: waveform-animation 1.2s infinite ease-in-out;
        }
        @keyframes waveform-animation {
            0%, 100% { height: 5px; }
            50% { height: 15px; }
        }
        @keyframes slideUp {
            from { transform: translateY(10px); opacity: 0; }
            to { transform: translateY(0); opacity: 1; }
        }
        
        /* FIXED: Video message styles for better appearance */
        .video-message {
            max-width: 300px;
            border-radius: 12px;
            overflow: hidden;
            position: relative;
            background: #000;
            margin: 5px 0;
        }

        .video-message video {
            width: 100%;
            height: auto;
            max-height: 400px;
            border-radius: 12px;
            object-fit: cover;
        }

        .video-message-controls {
            position: absolute;
            bottom: 10px;
            right: 10px;
            background: rgba(0, 0, 0, 0.7);
            border-radius: 20px;
            padding: 5px 10px;
            display: flex;
            align-items: center;
            gap: 5px;
        }

        .video-play-btn {
            background: none;
            border: none;
            color: white;
            cursor: pointer;
            font-size: 14px;
            padding: 0;
            display: flex;
            align-items: center;
        }

        .video-duration {
            color: white;
            font-size: 12px;
            margin-left: 5px;
        }

        /* FIXED: Reply preview styles for better readability */
        .reply-preview {
            display: flex;
            align-items: center;
            padding: 10px 12px;
            background: white;
            border-left: 4px solid var(--accent-color);
            margin-bottom: 10px;
            border-radius: 8px;
            border: none;
        }

        .reply-preview-content {
            flex: 1;
            margin-left: 10px;
            overflow: hidden;
        }

        .reply-preview-text {
            font-size: 14px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            color: black;
            font-weight: 500;
        }

        .reply-preview-name {
            font-size: 12px;
            font-weight: bold;
            color: black;
            margin-bottom: 2px;
        }

        .reply-preview-cancel {
            background: none;
            border: none;
            color: #888;
            cursor: pointer;
            font-size: 16px;
            padding: 5px;
            border-radius: 50%;
            transition: background-color 0.2s;
        }

        .reply-preview-cancel:hover {
            background: rgba(255, 255, 255, 0.1);
        }

        /* Enhanced message reply indicator in chat */
        .reply-indicator {
            font-size: 12px;
            color:white;
            margin-bottom: 4px;
            display: flex;
            align-items: center;
            gap: 4px;
            font-weight: 500;
        }

        .reply-indicator i {
            font-size: 10px;
        }

        .reply-message-preview {
            background: rgba(255, 255, 255, 0.1);
            border-left: 2px solid var(--accent-color);
            padding: 6px 10px;
            margin-bottom: 6px;
            border-radius: 6px;
            font-size: 12px;
            max-width: 100%;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            color: #ccc;
        }

        /* Improved video recording preview */
        .video-preview {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: black;
            z-index: 10000;
            display: none;
            flex-direction: column;
            justify-content: center;
            align-items: center;
        }

        .video-preview video {
            width: 100%;
            height: 100%;
            object-fit: contain;
        }

        .video-preview-controls {
            position: absolute;
            bottom: 40px;
            left: 0;
            right: 0;
            display: flex;
            justify-content: center;
            gap: 20px;
            padding: 20px;
        }

        .video-preview-btn {
            background: rgba(255, 255, 255, 0.2);
            color: white;
            border: none;
            border-radius: 50%;
            width: 60px;
            height: 60px;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            font-size: 20px;
            transition: background-color 0.2s;
        }

        .video-preview-btn:hover {
            background: rgba(255, 255, 255, 0.3);
        }

        /* Better video recording indicator */
        .video-recording-indicator {
            display: none;
            align-items: center;
            justify-content: space-between;
            padding: 12px 15px;
            background: #2a2a2a;
            border-radius: 25px;
            margin: 10px 0;
            border: 1px solid #444;
        }

        .video-recording-timer {
            font-size: 14px;
            color: #ff4444;
            font-weight: bold;
        }

        .video-recording-controls {
            display: flex;
            gap: 10px;
            align-items: center;
        }

        .recording-dot {
            width: 12px;
            height: 12px;
            background-color: #ff4444;
            border-radius: 50%;
            animation: recording-pulse 1.5s infinite;
        }

        @keyframes recording-pulse {
            0%, 100% { 
                opacity: 1; 
                transform: scale(1);
            }
            50% { 
                opacity: 0.3; 
                transform: scale(0.8);
            }
        }

        /* Improved voice message styles */
        .voice-message {
            max-width: 280px;
            padding: 12px 15px;
            border-radius: 20px;
            margin: 5px 0;
            position: relative;
            display: flex;
            align-items: center;
            gap: 12px;
            background: var(--accent-color);
        }

        .voice-message.sent {
            background: var(--accent-color);
            color: white;
            align-self: flex-end;
        }

        .voice-message.received {
            background: #3a3a3a;
            color: white;
            align-self: flex-start;
        }

        .voice-message-controls {
            display: flex;
            align-items: center;
            gap: 10px;
            width: 100%;
        }

        .voice-message-play-btn {
            background: rgba(255, 255, 255, 0.2);
            border: none;
            border-radius: 50%;
            color: white;
            font-size: 14px;
            cursor: pointer;
            padding: 8px;
            width: 35px;
            height: 35px;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: background-color 0.2s;
        }

        .voice-message-play-btn:hover {
            background: rgba(255, 255, 255, 0.3);
        }

        .voice-message-duration {
            font-size: 12px;
            color: rgba(255, 255, 255, 0.8);
            min-width: 40px;
        }

        .waveform {
            height: 25px;
            flex: 1;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 2px;
        }

        .waveform-bar {
            background-color: currentColor;
            width: 3px;
            border-radius: 3px;
            transition: height 0.2s ease;
            flex: 1;
        }

        .waveform-bar.active {
            animation: waveform-animation 1.2s infinite ease-in-out;
        }

        @keyframes waveform-animation {
            0%, 100% { height: 5px; }
            50% { height: 15px; }
        }

        /* Message image improvements - UPDATED for sending state */
        .message-image {
            max-width: 300px;
            max-height: 400px;
            border-radius: 12px;
            object-fit: cover;
            transition: opacity 0.3s ease;
        }

        .message-image.sending {
            opacity: 0.7;
            filter: grayscale(0.3);
        }

        .sending-indicator {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(0, 0, 0, 0.7);
            color: white;
            padding: 8px 12px;
            border-radius: 20px;
            font-size: 12px;
            display: flex;
            align-items: center;
            gap: 6px;
            z-index: 2;
        }

        .sending-indicator i {
            animation: spin 1s linear infinite;
        }

        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }

        /* Responsive video styles */
        @media (max-width: 768px) {
            .video-message {
                max-width: 300px;
            }
            
            .video-message video {
                max-height: 300px;
            }
            
            .message-image {
                max-width: 250px;
                max-height: 300px;
            }
        }

        @media (max-width: 480px) {
            .video-message {
                max-width: 300px;
            }
            
            .video-message video {
                max-height: 300px;
            }
            
            .message-image {
                max-width: 200px;
                max-height: 250px;
            }
        }
        /* Video message styles */
        .video-message {
            max-width: auto;
            border-radius: 12px;
            overflow: hidden;
            position: relative;
        }
        .video-message video {
            width: auto;
            height: 400px;
            border-radius: 12px;
            padding-top:2px;
        }
        .video-message-controls {
            position: absolute;
            bottom: 10px;
            right: 10px;
            background: rgba(0, 0, 0, 0.7);
            border-radius: 20px;
            padding: 5px 10px;
        }
        .video-play-btn {
            background: none;
            border: none;
            color: white;
            cursor: pointer;
            font-size: 14px;
        }
        .video-duration {
            color: white;
            font-size: 12px;
            margin-left: 5px;
        }
        
        /* Video recording indicator */
        .video-recording-indicator {
            display: none;
            align-items: center;
            justify-content: space-between;
            padding: 10px;
            background-color: var(--bg-light);
            border-radius: 20px;
            margin: 10px 0;
        }
        .video-recording-timer {
            font-size: 14px;
            color: var(--text-dark);
        }
        .video-recording-controls {
            display: flex;
            gap: 10px;
        }
        .recording-dot {
            width: 12px;
            height: 12px;
            background-color: #ff4444;
            border-radius: 50%;
            animation: pulse 1.5s infinite;
        }
        
        /* Online status indicator */
        .online-status {
            
            bottom: 10px;
            right: 10px;
            width: 9px;
            height: 9px;
            border-radius: 50%;
            border: 2px solid white;
        }
        .online-status.online {
            background-color: #00FF00;
        }
        .online-status.offline {
            background-color: #9E9E9E;
        }
        .profile-card {
            position: relative;
        }
        
        /* Message Reactions */
        .message-reactions {
            display: flex;
            gap: 5px;
            margin-top: 5px;
            flex-wrap: wrap;
        }
        .reaction {
            background: rgba(255, 255, 255, 0.9);
            border-radius: 10px;
            padding: 2px 6px;
            font-size: 12px;
            display: flex;
            align-items: center;
            gap: 2px;
            box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
        }
        .reaction-count {
            font-size: 10px;
            color: #666;
        }
        
        /* Reaction Picker */
        .reaction-picker {
            position: fixed;
            background: white;
            border-radius: 25px;
            padding: 10px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
            display: none;
            gap: 8px;
            z-index: 1000;
            flex-wrap: wrap;
            max-width: 250px;
        }
        .reaction-emoji {
            font-size: 20px;
            cursor: pointer;
            padding: 5px;
            border-radius: 50%;
            transition: background-color 0.2s;
        }
        .reaction-emoji:hover {
            background-color: #f0f0f0;
        }
        
        /* Reply Preview */
        .reply-preview {
            display: flex;
            align-items: center;
            padding: 8px 12px;
            background: var(--bg-light);
            border-left: 3px solid var(--accent-color);
            margin-bottom: 10px;
            border-radius: 4px;
        }
        .reply-preview-content {
            flex: 1;
            margin-left: 10px;
            overflow: hidden;
        }
        .reply-preview-text {
            font-size: 14px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            color: var(--text-light);
        }
        .reply-preview-name {
            font-size: 12px;
            font-weight: bold;
            color: black;
        }
        .reply-preview-cancel {
            background: none;
            border: none;
            color: var(--text-light);
            cursor: pointer;
            font-size: 16px;
            padding: 5px;
        }
        
        /* Message context menu */
        .message-context-menu {
            position: absolute;
            background:black;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
            z-index: 100;
            padding: 8px 0;
            display: none;
        }
        .context-menu-item {
            padding: 10px 16px;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 8px;
            font-size: 14px;
        }
        .context-menu-item:hover {
            background: #f5f5f5;
        }
        
        /* Swipe for reply - FIXED TO PREVENT ACCIDENTAL ACTIVATION */
        .message {
            transition: transform 0.3s ease;
            will-change: transform;
            touch-action: pan-y;
        }
        
        .message-swipe-action {
            position: absolute;
            top: 50%;
            left: 15px;
            transform: translateY(-50%);
            background: var(--accent-color);
            color: white;
            width: 40px;
            height: 40px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            opacity: 0;
            transition: opacity 0.2s ease;
            pointer-events: none;
        }
        
        .message.received {
            position: relative;
            overflow: visible;
        }
        .reply-indicator {
            font-size: 12px;
            color: var(--accent-color);
            margin-bottom: 4px;
            display: flex;
            align-items: center;
            gap: 4px;
        }
        .reply-indicator i {
            font-size: 10px;
        }
        .reply-message-preview {
            background: rgba(0, 0, 0, 0.05);
            border-left: 2px solid var(--accent-color);
            padding: 4px 8px;
            margin-bottom: 4px;
            border-radius: 4px;
            font-size: 12px;
            max-width: 400px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        
        /* Copy-paste prevention */
        .prevent-copy {
            -webkit-user-select: none;
            -moz-user-select: none;
            -ms-user-select: none;
            user-select: none;
            -webkit-touch-callout: none;
            -webkit-tap-highlight-color: transparent;
        }
        
        /* Fast loading message */
        .fast-loading-message {
            text-align: center;
            padding: 10px;
            font-size: 14px;
            color: var(--accent-color);
            background: var(--bg-light);
            border-radius: 8px;
            margin: 10px;
            animation: pulse 2s infinite;
        }
        
        /* Upload button styles */
        .upload-button {
            background: var(--accent-color);
            color: white;
            border: none;
            border-radius: 50%;
            width: 40px;
            height: 40px;
            display: flex;
            alignItems: center;
            justify-content: center;
            cursor: pointer;
            transition: background-color 0.2s;
        }
        .upload-button:hover {
            background: var(--accent-dark);
        }
        .upload-button:disabled {
            background: #ccc;
            cursor: not-allowed;
        }
        
        @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.7; }
        }
        @keyframes recording-pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.3; }
        }
    `;
    document.head.appendChild(style);

    // Create reaction picker element
    const reactionPicker = document.createElement('div');
    reactionPicker.id = 'reactionPicker';
    reactionPicker.className = 'reaction-picker';
    document.body.appendChild(reactionPicker);

    // Initialize network monitoring
    setupNetworkMonitoring();

    // Initialize navbar toggle for mobile
    if (navToggle) {
        eventManager.addListener(navToggle, 'click', () => {
            navToggle.classList.toggle('active');
            navMenu.classList.toggle('active');
        });
    }

    // Close mobile menu when clicking on a link
    document.querySelectorAll('.nav-links').forEach(link => {
        eventManager.addListener(link, 'click', () => {
            navToggle.classList.remove('active');
            navMenu.classList.remove('active');
        });
    });

// Prevent copy-paste on all pages EXCEPT share section inputs
document.addEventListener('copy', (e) => {
    // Allow copying from share section inputs and elements with allow-copy class
    if (!e.target.classList.contains('allow-copy') && 
        !e.target.closest('.share-container') &&
        e.target.id !== 'bondlyLink' &&
        e.target.id !== 'profileLink') {
        e.preventDefault();
        showNotification('Copying is disabled on this page', 'warning', 2000);
    }
});

document.addEventListener('paste', (e) => {
    if (!e.target.classList.contains('allow-paste') && 
        !e.target.closest('.share-container')) {
        e.preventDefault();
        showNotification('Pasting is disabled on this page', 'warning', 2000);
    }
});

document.addEventListener('cut', (e) => {
    if (!e.target.classList.contains('allow-copy') && 
        !e.target.closest('.share-container')) {
        e.preventDefault();
        showNotification('Cutting is disabled on this page', 'warning', 2000);
    }
});

// Add copy-paste prevention class to body but allow it in share section
document.body.classList.add('prevent-copy');
    // Check auth state first before initializing page
    onAuthStateChanged(auth, (user) => {
        if (user) {
            currentUser = user;
            
            // Update message count immediately with cached value
            const cachedUnread = cache.get(`unread_count_${currentUser.uid}`) || 0;
            updateMessageCount(cachedUnread);
            
            // Ensure user document exists
            ensureUserDocument(user).then(() => {
                // SIMPLIFIED: No verification handling needed
                
                // Load user's chat points
                loadUserChatPoints();
                
                // Set up global real-time listener for new messages
                setupGlobalMessageListener();
                // Set up online status for current user
                setupUserOnlineStatus();
                
                // Initialize reaction picker
                initReactionPicker();
                
                // Show microphone permission popup for new users
                if (!localStorage.getItem('microphonePermissionShown')) {
                    // Wait a bit for the page to load before showing the popup
                    setTimeout(() => {
                        showMicrophonePermissionPopup();
                    }, 2000);
                }
                
                // Initialize page-specific functions after auth is confirmed
                switch (currentPage) {
                    case 'index':
                        initLandingPage();
                        break;
                    case 'login':
                        initLoginPage();
                        break;
                    case 'signup':
                        initSignupPage();
                        break;
                    case 'mingle':
                        initMinglePage();
                        break;
                    case 'profile':
                        initProfilePage();
                        break;
                    case 'account':
                        initAccountPage();
                        break;
                    case 'chat':
                        initChatPage();
                        break;
                    case 'messages':
                        initMessagesPage();
                        break;
                    case 'dashboard':
                        initDashboardPage();
                        break;
                    case 'payment':
                        initPaymentPage();
                        break;
                    case 'admin':
                        initAdminPage();
                        break;
                }
                
                // Hide auth pages if user is logged in
                if (['login', 'signup', 'index'].includes(currentPage)) {
                    window.location.href = 'mingle.html';
                }
            }).catch(error => {
                logError(error, 'ensuring user document');
            });
        } else {
            // User logged out - clean up everything
            cleanupAllListeners();
            currentUser = null;
            cache.clear();
            
            // Redirect to login if on protected page
            if (['mingle', 'profile', 'account', 'chat', 'messages', 'dashboard', 'payment', 'admin'].includes(currentPage)) {
                window.location.href = 'login.html';
            } else {
                // Initialize public pages
                switch (currentPage) {
                    case 'index':
                        initLandingPage();
                        break;
                    case 'login':
                        initLoginPage();
                        break;
                    case 'signup':
                        initSignupPage();
                        break;
                }
            }
        }
    });
});

// Listen for page visibility changes to handle cache refresh
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && currentPage === 'chat' && chatPartnerId && currentUser) {
        // Page became visible again, refresh messages
        setTimeout(() => {
            if (unsubscribeChat) {
                unsubscribeChat();
            }
            loadChatMessages(currentUser.uid, chatPartnerId);
        }, 500);
    }
});

// Helper function to ensure user document exists
async function ensureUserDocument(user) {
    try {
        const userRef = doc(db, 'users', user.uid);
        const userSnap = await getDoc(userRef);
        
        if (!userSnap.exists()) {
            await setDoc(userRef, {
                email: user.email,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
                profileComplete: false,
                chatPoints: 12, // Give new users 12 chat points
                paymentHistory: [],
                // REMOVED: accountDisabled and verification fields
            });
        }
        return true;
    } catch (error) {
        logError(error, 'ensureUserDocument');
        throw error;
    }
}

// Load user's chat points
async function loadUserChatPoints() {
    if (!currentUser) return;
    
    try {
        const userRef = doc(db, 'users', currentUser.uid);
        const userSnap = await getDoc(userRef);
        
        if (userSnap.exists()) {
            userChatPoints = userSnap.data().chatPoints || 0;
            updateChatPointsDisplay();
        }
    } catch (error) {
        logError(error, 'loading chat points');
    }
}

// Update chat points display on pages
function updateChatPointsDisplay() {
    const pointsElements = document.querySelectorAll('.chat-points-display');
    pointsElements.forEach(el => {
        el.textContent = userChatPoints;
    });
}

// Deduct chat points when sending a message
async function deductChatPoint() {
    if (!currentUser) return false;
    
    try {
        const userRef = doc(db, 'users', currentUser.uid);
        const userSnap = await getDoc(userRef);
        
        if (userSnap.exists()) {
            const currentPoints = userSnap.data().chatPoints || 0;
            
            if (currentPoints <= 0) {
                showNotification('You have no chat points left. Please purchase more to continue chatting.', 'warning');
                return false;
            }
            
            await updateDoc(userRef, {
                chatPoints: currentPoints - 1
            });
            
            userChatPoints = currentPoints - 1;
            updateChatPointsDisplay();
            return true;
        }
        return false;
    } catch (error) {
        logError(error, 'deducting chat point');
        return false;
    }
}

// Add chat points (admin function)
async function addChatPoints(userId, points) {
    try {
        const userRef = doc(db, 'users', userId);
        const userSnap = await getDoc(userRef);
        
        if (userSnap.exists()) {
            const currentPoints = userSnap.data().chatPoints || 0;
            await updateDoc(userRef, {
                chatPoints: currentPoints + points
            });
            return true;
        }
        return false;
    } catch (error) {
        logError(error, 'adding chat points');
        return false;
    }
}

// FIXED: Set up online status for current user with proper disconnect handling
function setupUserOnlineStatus() {
    if (!currentUser) return;
    
    try {
        const userStatusRef = doc(db, 'status', currentUser.uid);
        
        // Set user as online
        setDoc(userStatusRef, {
            state: 'online',
            lastChanged: serverTimestamp(),
            userId: currentUser.uid,
            lastSeen: null
        });
        
        // Set up disconnect handling
        const handleDisconnect = async () => {
            try {
                // Check if user still exists before setting offline status
                if (currentUser && currentUser.uid) {
                    await setDoc(userStatusRef, {
                        state: 'offline',
                        lastChanged: serverTimestamp(),
                        lastSeen: serverTimestamp(),
                        userId: currentUser.uid
                    }, { merge: true });
                }
            } catch (error) {
                console.error('Error setting offline status:', error);
            }
        };
        
        // When window closes or refreshes
        window.addEventListener('beforeunload', handleDisconnect);
        
        // When internet connection is lost
        window.addEventListener('offline', handleDisconnect);
        
        // When page becomes hidden
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                handleDisconnect();
            } else {
                // Set back to online when page becomes visible - only if user exists
                if (currentUser && currentUser.uid) {
                    setDoc(userStatusRef, {
                        state: 'online',
                        lastChanged: serverTimestamp(),
                        userId: currentUser.uid,
                        lastSeen: null
                    });
                }
            }
        });
        
    } catch (error) {
        logError(error, 'setupUserOnlineStatus');
    }
}

// FIXED: Global message listener for unread counts with proper read status tracking
async function setupGlobalMessageListener() {
    // Safety check - don't set up listener if no user
    if (!currentUser || !currentUser.uid) {
        return;
    }
    
    try {
        // Clean up existing listener if any
        if (globalMessageListener) {
            globalMessageListener();
        }
        
        const threadsQuery = query(
            collection(db, 'conversations'),
            where('participants', 'array-contains', currentUser.uid)
        );
        
        // Set up a global listener for message count
        globalMessageListener = onSnapshot(threadsQuery, async (snapshot) => {
            let totalUnread = 0;
            
            // Process all threads to count unread messages
            const threadPromises = snapshot.docs.map(async (doc) => {
                const thread = doc.data();
                const partnerId = thread.participants.find(id => id !== currentUser.uid);
                
                if (partnerId) {
                    try {
                        // Get unread messages for this thread
                        const messagesQuery = query(
                            collection(db, 'conversations', doc.id, 'messages'),
                            where('senderId', '==', partnerId),
                            where('read', '==', false)
                        );
                        
                        const messagesSnap = await getDocs(messagesQuery);
                        return messagesSnap.size;
                    } catch (error) {
                        logError(error, 'counting unread messages in thread');
                        return 0;
                    }
                }
                return 0;
            });
            
            // Wait for all thread counts to be calculated
            const threadCounts = await Promise.all(threadPromises);
            totalUnread = threadCounts.reduce((sum, count) => sum + count, 0);
            
            // Update the message count globally
            updateMessageCount(totalUnread);
            
            // Cache the unread count for offline use
            cache.set(`unread_count_${currentUser.uid}`, totalUnread, 'short');
        });
        
    } catch (error) {
        logError(error, 'setting up global message listener');
        
        // Fallback: try to use cached unread count
        const cachedUnread = cache.get(`unread_count_${currentUser.uid}`) || 0;
        updateMessageCount(cachedUnread);
    }
}

// FIXED: Standalone function to refresh message count with accurate counting
async function refreshUnreadMessageCount() {
    if (!currentUser) return;
    
    try {
        const threadsQuery = query(
            collection(db, 'conversations'),
            where('participants', 'array-contains', currentUser.uid)
        );
        
        const threadsSnap = await getDocs(threadsQuery);
        let totalUnread = 0;
        
        for (const doc of threadsSnap.docs) {
            const thread = doc.data();
            const partnerId = thread.participants.find(id => id !== currentUser.uid);
            
            if (partnerId) {
                const messagesQuery = query(
                    collection(db, 'conversations', doc.id, 'messages'),
                    where('senderId', '==', partnerId),
                    where('read', '==', false)
                );
                
                const messagesSnap = await getDocs(messagesQuery);
                totalUnread += messagesSnap.size;
            }
        }
        
        updateMessageCount(totalUnread);
        cache.set(`unread_count_${currentUser.uid}`, totalUnread, 'short');
        
    } catch (error) {
        logError(error, 'refreshing unread message count');
        // Use cached value as fallback
        const cachedUnread = cache.get(`unread_count_${currentUser.uid}`) || 0;
        updateMessageCount(cachedUnread);
    }
}

// Update message count in navigation
function updateMessageCount(count) {
    messageCountElements.forEach(element => {
        if (count > 0) {
            element.textContent = count > 99 ? '99+' : count;
            element.style.display = 'flex';
        } else {
            element.style.display = 'none';
        }
    });
}

// Improved timestamp handling
function safeParseTimestamp(timestamp) {
    try {
        if (!timestamp) return null;
        if (typeof timestamp.toDate === 'function') return timestamp.toDate();
        if (typeof timestamp === 'number') return new Date(timestamp);
        if (typeof timestamp === 'string') return new Date(timestamp);
        return null;
    } catch (error) {
        logError(error, 'safeParseTimestamp');
        return null;
    }
}

// FIXED: Updated timestamp function to show appropriate time units
function formatTime(timestamp) {
    let date;
    
    try {
        if (typeof timestamp === 'string') {
            // Handle ISO string from cache
            date = new Date(timestamp);
        } else if (timestamp && typeof timestamp.toDate === 'function') {
            // Handle Firestore timestamp
            date = timestamp.toDate();
        } else if (timestamp instanceof Date) {
            date = timestamp;
        } else if (typeof timestamp === 'number') {
            date = new Date(timestamp);
        } else {
            return '';
        }
        
        if (isNaN(date.getTime())) {
            return '';
        }
    } catch (error) {
        console.error('Error parsing timestamp:', error);
        return '';
    }
    
    const now = new Date();
    const diffMs = now - date;
    const diffSecs = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffSecs / 60);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);
    const diffWeeks = Math.floor(diffDays / 7);
    
    // If message is within 24 hours, show actual time
    if (diffHours < 24) {
        return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    } 
    // Otherwise use the existing relative time format
    else if (diffWeeks > 0) {
        return `${diffWeeks}w ago`;
    } else if (diffDays > 0) {
        return `${diffDays}d ago`;
    } else if (diffHours > 0) {
        return `${diffHours}h ago`;
    } else if (diffMins > 0) {
        return `${diffMins}m ago`;
    } else if (diffSecs > 30) {
        return `${diffSecs}s ago`;
    } else {
        return 'just now';
    }
}

// Initialize reaction picker
function initReactionPicker() {
    const reactionPicker = document.getElementById('reactionPicker');
    if (!reactionPicker) return;
    
    // Clear existing content
    reactionPicker.innerHTML = '';
    
    // Add emoji buttons
    EMOJI_REACTIONS.forEach(emoji => {
        const emojiButton = document.createElement('div');
        emojiButton.className = 'reaction-emoji';
        emojiButton.textContent = emoji;
        emojiButton.addEventListener('click', () => addReactionToMessage(emoji));
        reactionPicker.appendChild(emojiButton);
    });
}

// Show reaction picker for a message
function showReactionPicker(messageId, x, y) {
    const reactionPicker = document.getElementById('reactionPicker');
    if (!reactionPicker) return;
    
    selectedMessageForReaction = messageId;
    
    // Position the picker near the message
    reactionPicker.style.left = `${x}px`;
    reactionPicker.style.bottom = `${window.innerHeight - y}px`;
    reactionPicker.style.display = 'flex';
    
    // Hide picker when clicking outside
    const hidePicker = (e) => {
        if (!reactionPicker.contains(e.target)) {
            reactionPicker.style.display = 'none';
            document.removeEventListener('click', hidePicker);
        }
    };
    
    setTimeout(() => {
        document.addEventListener('click', hidePicker);
    }, 10);
}

// Add reaction to a message
async function addReactionToMessage(emoji) {
    if (!selectedMessageForReaction || !currentUser || !chatPartnerId) return;
    
    try {
        // Create a combined ID for the chat thread
        const threadId = [currentUser.uid, chatPartnerId].sort().join('_');
        
        // Get the message reference
        const messageRef = doc(db, 'conversations', threadId, 'messages', selectedMessageForReaction);
        const messageSnap = await getDoc(messageRef);
        
        if (messageSnap.exists()) {
            const messageData = messageSnap.data();
            const reactions = messageData.reactions || {};
            
            // Check if user already reacted with this emoji
            const userReactionIndex = reactions[emoji] ? reactions[emoji].indexOf(currentUser.uid) : -1;
            
            if (userReactionIndex > -1) {
                // Remove reaction if already exists
                reactions[emoji].splice(userReactionIndex, 1);
                if (reactions[emoji].length === 0) {
                    delete reactions[emoji];
                }
            } else {
                // Add reaction
                if (!reactions[emoji]) {
                    reactions[emoji] = [];
                }
                reactions[emoji].push(currentUser.uid);
            }
            
            // Update message with new reactions
            await updateDoc(messageRef, {
                reactions: reactions
            });
            
            // Hide the reaction picker
            document.getElementById('reactionPicker').style.display = 'none';
        }
    } catch (error) {
        logError(error, 'adding reaction to message');
        showNotification('Error adding reaction. Please try again.', 'error');
    }
}

// Show reply preview
function showReplyPreview(message) {
    const replyPreview = document.getElementById('replyPreview');
    const replyPreviewName = document.querySelector('.reply-preview-name');
    const replyPreviewText = document.querySelector('.reply-preview-text');
    
    if (!replyPreview || !replyPreviewName || !replyPreviewText) return;
    
    selectedMessageForReply = message.id;
    
    // Set reply preview content
    const senderName = message.senderId === currentUser.uid ? 'You' : document.getElementById('chatPartnerName').textContent;
    replyPreviewName.textContent = senderName;
    
    if (message.text) {
        replyPreviewText.textContent = message.text;
    } else if (message.imageUrl) {
        replyPreviewText.textContent = '📷 Photo';
    } else if (message.audioUrl) {
        replyPreviewText.textContent = '🎤 Voice message';
    } else if (message.videoUrl) {
        replyPreviewText.textContent = '🎥 Video message';
    }
    
    // Show reply preview
    replyPreview.style.display = 'flex';
    
    // Focus on message input
    const messageInput = document.getElementById('messageInput');
    if (messageInput) {
        messageInput.focus();
    }
}

// Cancel reply
function cancelReply() {
    const replyPreview = document.getElementById('replyPreview');
    if (replyPreview) {
        replyPreview.style.display = 'none';
    }
    selectedMessageForReply = null;
}

// Handle message long press for reactions - FIXED TO PREVENT ACCIDENTAL ACTIVATION
function setupMessageLongPress() {
    const messagesContainer = document.getElementById('chatMessages');
    if (!messagesContainer) return;
    
    messagesContainer.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        const messageElement = e.target.closest('.message');
        if (messageElement && messageElement.classList.contains('received')) {
            const messageId = messageElement.dataset.messageId;
            if (messageId) {
                showReactionPicker(messageId, e.clientX, e.clientY);
            }
        }
    });
    
    // Add touch events for mobile - FIXED: Only activate on received messages
    messagesContainer.addEventListener('touchstart', (e) => {
        const messageElement = e.target.closest('.message');
        if (messageElement && messageElement.classList.contains('received')) {
            const messageId = messageElement.dataset.messageId;
            if (messageId) {
                longPressTimer = setTimeout(() => {
                    showReactionPicker(messageId, e.touches[0].clientX, e.touches[0].clientY);
                }, 800); // Increased delay to prevent accidental activation
            }
        }
    });
    
    messagesContainer.addEventListener('touchend', () => {
        clearTimeout(longPressTimer);
    });
    
    messagesContainer.addEventListener('touchmove', () => {
        clearTimeout(longPressTimer);
    });
}

// Enhanced swipe functionality for reply - FIXED TO PREVENT ACCIDENTAL ACTIVATION
function setupMessageSwipe() {
    const messagesContainer = document.getElementById('chatMessages');
    if (!messagesContainer) return;
    
    let startX = 0;
    let startY = 0;
    let currentX = 0;
    let currentElement = null;
    let isSwiping = false;
    let swipeThreshold = 50; // Minimum horizontal movement to consider it a swipe
    let tapThreshold = 10; // Maximum movement to consider it a tap
    let swipeStartTime = 0;
    
    messagesContainer.addEventListener('touchstart', (e) => {
        // Don't initiate swipe if clicking on interactive elements
        if (e.target.closest('.voice-message-play-btn') || 
            e.target.closest('.voice-message-controls') ||
            e.target.closest('.message-reactions') ||
            e.target.closest('.message-time') ||
            e.target.closest('.video-play-btn')) {
            return;
        }
        
        const messageElement = e.target.closest('.message');
        if (messageElement && messageElement.classList.contains('received')) {
            startX = e.touches[0].clientX;
            startY = e.touches[0].clientY;
            currentElement = messageElement;
            swipeStartTime = Date.now();
            isSwiping = true;
            
            // Add swipe action indicator if it doesn't exist
            if (!messageElement.querySelector('.message-swipe-action')) {
                const swipeAction = document.createElement('div');
                swipeAction.className = 'message-swipe-action';
                swipeAction.innerHTML = '<i class="fas fa-reply"></i>';
                messageElement.appendChild(swipeAction);
            }
            
            messageElement.style.transition = 'none';
        }
    });
    
    messagesContainer.addEventListener('touchmove', (e) => {
        if (!isSwiping || !currentElement) return;
        
        currentX = e.touches[0].clientX;
        const currentY = e.touches[0].clientY;
        const diffX = currentX - startX;
        const diffY = currentY - startY;
        
        // Check if this is primarily a horizontal swipe (not vertical scroll)
        if (Math.abs(diffX) < Math.abs(diffY)) {
            // This is more vertical than horizontal - probably scrolling
            resetSwipeState();
            return;
        }
        
        // Only allow right-to-left swipe (positive diff) for reply
        if (diffX < 0) {
            resetSwipeState();
            return;
        }
        
        // Prevent default to avoid page scrolling while swiping
        e.preventDefault();
        
        // Limit maximum swipe distance
        const maxSwipe = 100;
        const swipeDistance = Math.min(Math.max(diffX, 0), maxSwipe);
        
        // Apply transform for smooth swipe
        currentElement.style.transform = `translateX(${swipeDistance}px)`;
        
        // Show/hide swipe action based on swipe distance
        const swipeAction = currentElement.querySelector('.message-swipe-action');
        if (swipeAction) {
            const opacity = Math.min(Math.abs(swipeDistance) / maxSwipe, 1);
            swipeAction.style.opacity = opacity;
        }
    });
    
    messagesContainer.addEventListener('touchend', (e) => {
        if (!isSwiping || !currentElement) return;
        
        const diffX = currentX - startX;
        const swipeDuration = Date.now() - swipeStartTime;
        
        // Check if this was a tap (minimal movement) or a swipe
        const isTap = Math.abs(diffX) < tapThreshold && swipeDuration < 300;
        
        if (isTap) {
            // It's a tap - do nothing for reply, allow default behavior
            resetSwipeState();
            return;
        }
        
        // Only trigger reply if swipe was right-to-left and exceeded threshold
        if (diffX > swipeThreshold) {
            // Swipe was far enough - trigger reply
            const messageId = currentElement.dataset.messageId;
            // Get message data from cache or Firestore
            const cachedMessages = cache.get(`messages_${currentUser.uid}_${chatPartnerId}`) || [];
            const message = cachedMessages.find(m => m.id === messageId);
            if (message) {
                showReplyPreview(message);
            }
        }
        
        resetSwipeState();
    });
    
    function resetSwipeState() {
        if (!currentElement) return;
        
        // Animate back to original position
        currentElement.style.transition = 'transform 0.3s ease';
        currentElement.style.transform = 'translateX(0)';
        
        // Hide swipe action
        const swipeAction = currentElement.querySelector('.message-swipe-action');
        if (swipeAction) {
            swipeAction.style.opacity = '0';
        }
        
        // Reset variables
        setTimeout(() => {
            if (currentElement) {
                currentElement.style.transition = '';
            }
            isSwiping = false;
            currentElement = null;
            startX = 0;
            startY = 0;
            currentX = 0;
        }, 300);
    }
    
    // Also add click event to prevent reply on tap
    messagesContainer.addEventListener('click', (e) => {
        // If it's a received message and not an interactive element
        const messageElement = e.target.closest('.message');
        if (messageElement && messageElement.classList.contains('received')) {
            // ALLOW image viewing - if click is on an image, don't prevent default behavior
            if (e.target.tagName === 'IMG' && e.target.classList.contains('message-image')) {
                return; // Allow the image viewer to handle this click
            }
            
            // ALLOW video viewing - if click is on a video, don't prevent default behavior
            if (e.target.tagName === 'VIDEO' || e.target.closest('.video-message')) {
                return; // Allow the video player to handle this click
            }
            
            // For other non-interactive elements, prevent reply on tap
            if (!e.target.closest('.voice-message-play-btn') && 
                !e.target.closest('.voice-message-controls') &&
                !e.target.closest('.message-reactions') &&
                !e.target.closest('.message-time') &&
                !e.target.closest('.video-play-btn')) {
                // This is a tap on the message content - do nothing for reply
                e.stopPropagation();
            }
        }
    });
}

// UPDATED: Voice Note Functions - Optimized for faster response
async function startRecording() {
    try {
        // Show recording UI immediately for faster response
        document.getElementById('voiceNoteIndicator').style.display = 'flex';
        document.getElementById('messageInput').style.display = 'none';
        
        let stream;
        
        // Use preloaded stream if available for instant start
        if (preloadedAudioStream) {
            stream = preloadedAudioStream;
            console.log('Using pre-loaded microphone stream');
        } else {
            // Otherwise request new permission (this might cause delay)
            const hasPermission = await requestMicrophonePermission();
            if (!hasPermission) {
                showNotification('Microphone access is required to send voice notes. Please enable microphone permissions in your browser settings.', 'warning');
                // Hide the recording UI if permission denied
                document.getElementById('voiceNoteIndicator').style.display = 'none';
                document.getElementById('messageInput').style.display = 'block';
                return;
            }
            
            stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        }
        
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];
        
        // Start timer
        recordingStartTime = Date.now();
        updateRecordingTimer();
        recordingTimer = setInterval(updateRecordingTimer, 1000);
        
        // Handle data available
        mediaRecorder.ondataavailable = (event) => {
            audioChunks.push(event.data);
        };
        
        // Start recording
        mediaRecorder.start(100); // Collect data every 100ms
        
        // Handle stop recording (when mouse is released)
        const stopRecordingOnRelease = () => {
            stopRecording();
            document.removeEventListener('mouseup', stopRecordingOnRelease);
        };
        
        document.addEventListener('mouseup', stopRecordingOnRelease);
    } catch (error) {
        logError(error, 'starting voice recording');
        showNotification('Could not access microphone. Please ensure you have granted microphone permissions.', 'error');
        
        // Hide recording UI on error
        document.getElementById('voiceNoteIndicator').style.display = 'none';
        document.getElementById('messageInput').style.display = 'block';
    }
}

function updateRecordingTimer() {
    const elapsed = Math.floor((Date.now() - recordingStartTime) / 1000);
    document.getElementById('voiceNoteTimer').textContent = 
        `${Math.floor(elapsed / 60)}:${(elapsed % 60).toString().padStart(2, '0')}`;
}

async function stopRecording() {
    if (!mediaRecorder) return;
    
    clearInterval(recordingTimer);
    mediaRecorder.stop();
    
    // Don't stop the preloaded stream - we want to keep it for future recordings
    if (!preloadedAudioStream) {
        // Only stop the stream if it's not our preloaded one
        mediaRecorder.stream.getTracks().forEach(track => track.stop());
    }
    
    // Wait for the recording to finish
    await new Promise(resolve => {
        mediaRecorder.onstop = resolve;
    });
    
    // Hide recording UI
    document.getElementById('voiceNoteIndicator').style.display = 'none';
    document.getElementById('messageInput').style.display = 'block';
}

async function cancelRecording() {
    if (!mediaRecorder) return;
    
    clearInterval(recordingTimer);
    mediaRecorder.stop();
    
    // Don't stop the preloaded stream
    if (!preloadedAudioStream) {
        mediaRecorder.stream.getTracks().forEach(track => track.stop());
    }
    
    // Hide recording UI
    document.getElementById('voiceNoteIndicator').style.display = 'none';
    document.getElementById('messageInput').style.display = 'block';
    
    // Reset variables
    mediaRecorder = null;
    audioChunks = [];
}

async function sendVoiceNote() {
    if (audioChunks.length === 0) {
        showNotification('No recording to send', 'warning');
        return;
    }
    
    try {
        // Check if user has chat points
        const hasPoints = await deductChatPoint();
        if (!hasPoints) {
            return;
        }
        
        // Create a single blob from the audio chunks
        const audioBlob = new Blob(audioChunks, { type: 'audio/mp3' });
        
        // Show uploading state
        document.getElementById('sendVoiceNoteBtn').innerHTML = 
            '<i class="fas fa-spinner fa-spin"></i> Uploading';
        document.getElementById('sendVoiceNoteBtn').disabled = true;
        
        // Upload to Cloudinary
        const audioUrl = await uploadAudioToCloudinary(audioBlob);
        
        // Calculate duration
        const duration = Math.floor((Date.now() - recordingStartTime) / 1000);
        
        // Add voice message to chat
        await addMessage(null, null, audioUrl, duration);
        
        // Reset recording state
        document.getElementById('sendVoiceNoteBtn').innerHTML = 
            '<i class="fas fa-paper-plane"></i> Send';
        document.getElementById('sendVoiceNoteBtn').disabled = false;
        mediaRecorder = null;
        audioChunks = [];
    } catch (error) {
        logError(error, 'sending voice note');
        showNotification('Failed to send voice note. Please try again.', 'error');
        
        // Reset button state
        document.getElementById('sendVoiceNoteBtn').innerHTML = 
            '<i class="fas fa-paper-plane"></i> Send';
        document.getElementById('sendVoiceNoteBtn').disabled = false;
    }
}

// Video Recording Functions
async function startVideoRecording() {
    try {
        const hasPermission = await requestCameraPermission();
        if (!hasPermission) {
            showNotification('Camera access is required to send video messages. Please enable camera permissions in your browser settings.', 'warning');
            return;
        }

        // Request camera and microphone access
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        videoRecorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9,opus' });
        videoChunks = [];
        
        // Show recording UI
        document.getElementById('videoRecordingIndicator').style.display = 'flex';
        document.getElementById('messageInput').style.display = 'none';
        
        // Start timer
        videoRecordingStartTime = Date.now();
        updateVideoRecordingTimer();
        videoRecordingTimer = setInterval(updateVideoRecordingTimer, 1000);
        
        // Handle data available
        videoRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                videoChunks.push(event.data);
            }
        };
        
        // Start recording
        videoRecorder.start(100); // Collect data every 100ms
        
        // Auto-stop after 20 seconds
        setTimeout(() => {
            if (videoRecorder && videoRecorder.state === 'recording') {
                stopVideoRecording();
            }
        }, 20000);
        
    } catch (error) {
        logError(error, 'starting video recording');
        showNotification('Could not access camera. Please ensure you have granted camera permissions.', 'error');
    }
}

function updateVideoRecordingTimer() {
    const elapsed = Math.floor((Date.now() - videoRecordingStartTime) / 1000);
    const remaining = 20 - elapsed;
    document.getElementById('videoRecordingTimer').textContent = 
        `0:${remaining.toString().padStart(2, '0')}`;
    
    // Auto-stop when reaching 20 seconds
    if (remaining <= 0) {
        stopVideoRecording();
    }
}

async function stopVideoRecording() {
    if (!videoRecorder) return;
    
    clearInterval(videoRecordingTimer);
    videoRecorder.stop();
    
    // Stop all tracks in the stream
    videoRecorder.stream.getTracks().forEach(track => track.stop());
    
    // Wait for the recording to finish
    await new Promise(resolve => {
        videoRecorder.onstop = resolve;
    });
    
    // Hide recording UI
    document.getElementById('videoRecordingIndicator').style.display = 'none';
    document.getElementById('messageInput').style.display = 'block';
    
    // Show video preview
    showVideoPreview();
}

async function cancelVideoRecording() {
    if (!videoRecorder) return;
    
    clearInterval(videoRecordingTimer);
    videoRecorder.stop();
    
    // Stop all tracks in the stream
    videoRecorder.stream.getTracks().forEach(track => track.stop());
    
    // Hide recording UI
    document.getElementById('videoRecordingIndicator').style.display = 'none';
    document.getElementById('messageInput').style.display = 'block';
    
    // Reset variables
    videoRecorder = null;
    videoChunks = [];
}

function showVideoPreview() {
    if (videoChunks.length === 0) return;
    
    const videoBlob = new Blob(videoChunks, { type: 'video/webm' });
    const videoUrl = URL.createObjectURL(videoBlob);
    
    // Create preview modal
    const previewModal = document.createElement('div');
    previewModal.className = 'video-preview';
    previewModal.innerHTML = `
        <video controls autoplay>
            <source src="${videoUrl}" type="video/webm">
            Your browser does not support the video tag.
        </video>
        <div class="video-preview-controls">
            <button class="video-preview-btn" id="cancelVideoPreview">
                <i class="fas fa-times"></i>
            </button>
            <button class="video-preview-btn" id="sendVideoPreview">
                <i class="fas fa-paper-plane"></i>
            </button>
        </div>
    `;
    
    document.body.appendChild(previewModal);
    previewModal.style.display = 'flex';
    
    // Add event listeners
    document.getElementById('cancelVideoPreview').addEventListener('click', () => {
        previewModal.remove();
        videoRecorder = null;
        videoChunks = [];
    });
    
    document.getElementById('sendVideoPreview').addEventListener('click', async () => {
        await sendVideoMessage(videoBlob);
        previewModal.remove();
    });
}

async function sendVideoMessage(videoBlob) {
    try {
        // Check if user has chat points
        const hasPoints = await deductChatPoint();
        if (!hasPoints) {
            return;
        }
        
        // Show uploading state
        const sendBtn = document.getElementById('sendVideoPreview');
        if (sendBtn) {
            sendBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
            sendBtn.disabled = true;
        }
        
        // Upload to Cloudinary
        const videoUrl = await uploadVideoToCloudinary(videoBlob);
        
        // Calculate duration
        const duration = Math.floor((Date.now() - videoRecordingStartTime) / 1000);
        
        // Add video message to chat
        await addMessage(null, null, null, null, videoUrl, duration);
        
        // Reset recording state
        videoRecorder = null;
        videoChunks = [];
    } catch (error) {
        logError(error, 'sending video message');
        showNotification('Failed to send video message. Please try again.', 'error');
    }
}

// Upload Functions - COMPLETELY REMOVED UPLOADTHING, USING ONLY CLOUDINARY
async function uploadAudioToCloudinary(audioBlob) {
    const formData = new FormData();
    formData.append('file', audioBlob);
    formData.append('upload_preset', cloudinaryConfig.uploadPreset);
    formData.append('resource_type', 'auto'); // Important for audio files
    
    try {
        const response = await fetch(
            `https://api.cloudinary.com/v1_1/${cloudinaryConfig.cloudName}/upload`,
            {
                method: 'POST',
                body: formData,
                headers: {
                    'X-Requested-With': 'XMLHttpRequest'
                }
            }
        );
        
        if (!response.ok) {
            throw new Error(`Cloudinary error: ${response.statusText}`);
        }
        
        const data = await response.json();
        if (!data.secure_url) {
            throw new Error('Invalid response from Cloudinary');
        }
        return data.secure_url;
    } catch (error) {
        logError(error, 'uploading audio to Cloudinary');
        throw error;
    }
}

// Cloudinary video upload function
async function uploadVideoToCloudinary(videoBlob) {
    const formData = new FormData();
    formData.append('file', videoBlob);
    formData.append('upload_preset', cloudinaryConfig.uploadPreset);
    formData.append('resource_type', 'video');
    
    try {
        console.log('Uploading video to Cloudinary...');
        
        const response = await fetch(
            `https://api.cloudinary.com/v1_1/${cloudinaryConfig.cloudName}/video/upload`,
            {
                method: 'POST',
                body: formData
            }
        );
        
        if (!response.ok) {
            throw new Error(`Cloudinary video upload failed: ${response.statusText}`);
        }
        
        const data = await response.json();
        if (!data.secure_url) {
            throw new Error('Invalid response from Cloudinary');
        }
        
        console.log('Cloudinary video upload successful');
        return data.secure_url;
    } catch (error) {
        console.error('Cloudinary video upload error:', error);
        throw new Error('Video upload failed. Please try again later.');
    }
}

// Upload file function for both images and videos
async function uploadFileToCloudinary(file) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', cloudinaryConfig.uploadPreset);
    
    // Determine resource type based on file type
    const resourceType = file.type.startsWith('video/') ? 'video' : 'image';
    formData.append('resource_type', resourceType);
    
    try {
        // First check if we have a valid connection
        if (!navigator.onLine) {
            throw new Error('No internet connection available');
        }

        // Validate file based on type
        if (resourceType === 'image') {
            validateImageFile(file);
        } else if (resourceType === 'video') {
            validateVideoFile(file);
        }

        const response = await fetch(
            `https://api.cloudinary.com/v1_1/${cloudinaryConfig.cloudName}/${resourceType}/upload`, 
            {
                method: 'POST',
                body: formData,
                headers: {
                    'Accept': 'application/json'
                }
            }
        );
        
        if (!response.ok) {
            throw new Error(`Cloudinary error: ${response.statusText}`);
        }
        
        const data = await response.json();
        if (!data.secure_url) {
            throw new Error('Invalid response from Cloudinary');
        }
        return data.secure_url;
    } catch (error) {
        logError(error, `uploading ${resourceType} to Cloudinary`);
        throw new Error(`Failed to upload ${resourceType}. Please check your connection and try again.`);
    }
}

async function uploadImageToCloudinary(file) {
    return uploadFileToCloudinary(file);
}

// UPDATED: Image sending with immediate display and sending state
async function sendImageMessage(file) {
    try {
        // Check if user has chat points
        const hasPoints = await deductChatPoint();
        if (!hasPoints) {
            return;
        }

        // Generate temporary ID for optimistic update
        const tempMessageId = 'temp_image_' + Date.now();
        
        // Create temporary message data for immediate display
        const tempMessage = {
            id: tempMessageId,
            senderId: currentUser.uid,
            imageUrl: URL.createObjectURL(file), // Use blob URL for immediate display
            timestamp: new Date().toISOString(),
            status: 'sending'
        };

        // Display the image immediately with "sending" state
        displayMessage(tempMessage, currentUser.uid);
        
        // Scroll to bottom to show the new message
        const messagesContainer = document.getElementById('chatMessages');
        messagesContainer.scrollTop = messagesContainer.scrollHeight;

        // Upload to Cloudinary
        const imageUrl = await uploadImageToCloudinary(file);
        
        // Revoke the blob URL to free memory
        URL.revokeObjectURL(tempMessage.imageUrl);

        // Add the real message to Firestore
        await addMessage(null, imageUrl);
        
        // The real message will replace the temporary one via the listener
        // The temporary message will be automatically removed when the real one arrives

    } catch (error) {
        logError(error, 'sending image message');
        showNotification('Failed to send image. Please try again.', 'error');
        
        // Remove the temporary message if there was an error
        const tempMessageElement = document.querySelector(`[data-message-id="temp_image_"]`);
        if (tempMessageElement) {
            tempMessageElement.remove();
        }
    }
}

// FIXED: Updated voice note player with proper event handling
function createAudioPlayer(audioUrl, duration) {
    const audio = new Audio(audioUrl);
    const container = document.createElement('div');
    container.className = 'voice-message-controls';
    
    container.innerHTML = `
        <button class="voice-message-play-btn">
            <i class="fas fa-play"></i>
        </button>
        <div class="waveform">
            ${Array(5).fill('').map((_, i) => 
                `<div class="waveform-bar" style="height: 5px;"></div>`
            ).join('')}
        </div>
        <span class="voice-message-duration">${Math.floor(duration / 60)}:${(duration % 60).toString().padStart(2, '0')}</span>
    `;
    
    const playBtn = container.querySelector('.voice-message-play-btn');
    const waveformBars = container.querySelectorAll('.waveform-bar');
    let animationInterval = null;
    
    // Function to start animation
    const startAnimation = () => {
        // Clear any existing animation
        if (animationInterval) {
            clearInterval(animationInterval);
        }
        
        // Start new animation
        animationInterval = setInterval(() => {
            waveformBars.forEach(bar => {
                // Random height for each bar to create wave effect
                const randomHeight = Math.floor(Math.random() * 15) + 5;
                bar.style.height = `${randomHeight}px`;
            });
        }, 100);
    };
    
    // Function to stop animation
    const stopAnimation = () => {
        if (animationInterval) {
            clearInterval(animationInterval);
            animationInterval = null;
        }
        waveformBars.forEach(bar => {
            bar.style.height = '5px';
        });
    };
    
    // FIX: Stop event propagation to prevent swipe detection from triggering
    playBtn.addEventListener('click', (e) => {
        e.stopPropagation(); // Prevent the event from bubbling up to parent elements
        
        if (audio.paused) {
            audio.play();
            playBtn.innerHTML = '<i class="fas fa-pause"></i>';
            startAnimation();
        } else {
            audio.pause();
            playBtn.innerHTML = '<i class="fas fa-play"></i>';
            stopAnimation();
        }
    });
    
    // Handle audio events
    audio.onended = () => {
        playBtn.innerHTML = '<i class="fas fa-play"></i>';
        stopAnimation();
    };
    
    audio.onpause = () => {
        playBtn.innerHTML = '<i class="fas fa-play"></i>';
        stopAnimation();
    };
    
    return container;
}

// Video player function
function createVideoPlayer(videoUrl, duration) {
    const container = document.createElement('div');
    container.className = 'video-message';
    
    container.innerHTML = `
        <video controls>
            <source src="${videoUrl}" type="video/webm">
            Your browser does not support the video tag.
        </video>
        <div class="video-message-controls">
            <span class="video-duration">${Math.floor(duration / 60)}:${(duration % 60).toString().padStart(2, '0')}</span>
        </div>
    `;
    
    return container;
}

// UPDATED: Display message function to handle image sending state
function displayMessage(message, currentUserId) {
    const messagesContainer = document.getElementById('chatMessages');
    
    // Remove "no messages" placeholder if it exists
    const noMessagesDiv = messagesContainer.querySelector('.no-messages');
    if (noMessagesDiv) {
        noMessagesDiv.remove();
    }
    
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${message.senderId === currentUserId ? 'sent' : 'received'}`;
    messageDiv.dataset.messageId = message.id;
    
    // Handle sending state for images and temporary messages
    if (message.id && (message.id.startsWith('temp_') || message.status === 'sending')) {
        messageDiv.style.opacity = '0.7';
        messageDiv.classList.add('sending');
    }
    
    let messageContent = '';
    
    // Add reply indicator if this is a reply
    if (message.replyTo) {
        const repliedMessage = getRepliedMessage(message.replyTo);
        if (repliedMessage) {
            const senderName = repliedMessage.senderId === currentUserId ? 'You' : document.getElementById('chatPartnerName').textContent;
            let previewText = '';
            
            if (repliedMessage.text) {
                previewText = repliedMessage.text;
            } else if (repliedMessage.imageUrl) {
                previewText = '📷 Photo';
            } else if (repliedMessage.audioUrl) {
                previewText = '🎤 Voice message';
            } else if (repliedMessage.videoUrl) {
                previewText = '🎥 Video message';
            }
            
            messageContent += `
                <div class="reply-indicator">
                    <i class="fas fa-reply"></i> Replying to ${senderName}
                </div>
                <div class="reply-message-preview">${previewText}</div>
            `;
        }
    }
    
    if (message.imageUrl) {
        // Create image container with sending indicator if needed
        const imageContainer = document.createElement('div');
        imageContainer.style.position = 'relative';
        imageContainer.style.display = 'inline-block';
        
        const img = document.createElement('img');
        img.src = message.imageUrl;
        img.alt = "Message image";
        img.className = 'message-image';
        
        // Add sending class if this is a temporary image
        if (message.id && message.id.startsWith('temp_') || message.status === 'sending') {
            img.classList.add('sending');
            
            // Add sending indicator
            const sendingIndicator = document.createElement('div');
            sendingIndicator.className = 'sending-indicator';
            sendingIndicator.innerHTML = '<i class="fas fa-spinner"></i> Sending...';
            imageContainer.appendChild(sendingIndicator);
        }
        
        imageContainer.appendChild(img);
        messageContent += imageContainer.outerHTML;
    } else if (message.text) {
        messageContent += `<p>${message.text}</p>`;
    }
    
    // Add reactions if any
    if (message.reactions && Object.keys(message.reactions).length > 0) {
        messageContent += `<div class="message-reactions">`;
        for (const [emoji, users] of Object.entries(message.reactions)) {
            messageContent += `<span class="reaction">${emoji} <span class="reaction-count">${users.length}</span></span>`;
        }
        messageContent += `</div>`;
    }
    
    // Add timestamp - Handle different states
    let timestampText = '';
    if (message.id && message.id.startsWith('temp_') || message.status === 'sending') {
        timestampText = 'Sending...';
    } else {
        timestampText = formatTime(message.timestamp);
        if (message.senderId === currentUserId && message.read) {
            timestampText += ' ✓✓';
        }
    }
    
    messageContent += `<span class="message-time">${timestampText}</span>`;
    
    messageDiv.innerHTML = messageContent;
    
    // Handle voice messages
    if (message.audioUrl) {
        const voiceMessageDiv = document.createElement('div');
        voiceMessageDiv.className = `voice-message ${message.senderId === currentUserId ? 'sent' : 'received'}`;
        
        const audioPlayer = createAudioPlayer(message.audioUrl, message.duration || 0);
        voiceMessageDiv.appendChild(audioPlayer);
        
        // Add timestamp for voice message
        const timeSpan = document.createElement('span');
        timeSpan.className = 'message-time';
        timeSpan.textContent = timestampText;
        
        messageDiv.appendChild(voiceMessageDiv);
    }
    
    // Handle video messages
    if (message.videoUrl) {
        const videoPlayer = createVideoPlayer(message.videoUrl, message.duration || 0);
        messageDiv.appendChild(videoPlayer);
    }
    
    messagesContainer.appendChild(messageDiv);
}

// Loading message functions
function showFastLoadingMessage() {
    // Remove any existing loading messages
    const existingMessages = document.querySelectorAll('.fast-loading-message');
    existingMessages.forEach(msg => msg.remove());
    
    const loadingMsg = document.createElement('div');
    loadingMsg.className = 'fast-loading-message';
    loadingMsg.innerHTML = '<i class="fas fa-bolt"></i> Loading content...';
    
    const mainContent = document.querySelector('main') || document.querySelector('.container') || document.body;
    mainContent.insertBefore(loadingMsg, mainContent.firstChild);
    
    // Auto-remove after 3 seconds
    setTimeout(() => {
        loadingMsg.remove();
    }, 3000);
}

function showChatLoadingMessage() {
    const messagesContainer = document.getElementById('chatMessages');
    if (!messagesContainer) return;
    
    // Remove any existing loading messages first
    hideChatLoadingMessage();
    
    // Create and show loading message
    const loadingDiv = document.createElement('div');
    loadingDiv.className = 'loading-message';
    loadingDiv.innerHTML = `
        <div class="dot-pulse"></div>
        <span>Loading messages...</span>
    `;
    messagesContainer.appendChild(loadingDiv);
}

function hideChatLoadingMessage() {
    const messagesContainer = document.getElementById('chatMessages');
    if (!messagesContainer) return;
    
    const loadingMessage = messagesContainer.querySelector('.loading-message');
    if (loadingMessage) {
        loadingMessage.remove();
    }
}

function showMessagesLoadingMessage() {
    const messagesList = document.getElementById('messagesList');
    if (!messagesList) return;
    
    messagesList.innerHTML = `
        <div class="page-loader">
            <div class="dot-pulse"></div>
            <span>Loading conversations...</span>
        </div>
    `;
}

function hideMessagesLoadingMessage() {
    const loadingMessage = document.querySelector('#messagesList .page-loader');
    if (loadingMessage) {
        loadingMessage.remove();
    }
}

// Add this function to handle page cleanup
function cleanupChatPage() {
    if (unsubscribeChat) {
        unsubscribeChat();
        unsubscribeChat = null;
    }
    
    // Clear typing status
    if (chatPartnerId && currentUser) {
        updateTypingStatus(false);
    }
    
    // Stop any ongoing recording
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
        // Don't stop preloaded stream
        if (!preloadedAudioStream) {
            mediaRecorder.stream.getTracks().forEach(track => track.stop());
        }
    }
    
    // Stop any ongoing video recording
    if (videoRecorder && videoRecorder.state !== 'inactive') {
        videoRecorder.stop();
        videoRecorder.stream.getTracks().forEach(track => track.stop());
    }
    
    // Clear timers
    if (typingTimeout) clearTimeout(typingTimeout);
    if (recordingTimer) clearInterval(recordingTimer);
    if (videoRecordingTimer) clearInterval(videoRecordingTimer);
    if (longPressTimer) clearTimeout(longPressTimer);
    
    // Reset chat partner ID
    chatPartnerId = null;
}

// FIXED: Updated chat messages loading with proper read status handling
function loadChatMessages(userId, partnerId) {
    const messagesContainer = document.getElementById('chatMessages');
    
    // Clear any existing listener
    if (unsubscribeChat) {
        unsubscribeChat();
    }
    
    // Create a combined ID for the chat thread
    const threadId = [userId, partnerId].sort().join('_');
    
    // Show loading message immediately
    showChatLoadingMessage();
    
    // Try to load cached messages first
    const cacheKey = `messages_${userId}_${partnerId}`;
    const cachedMessages = cache.get(cacheKey);
    
    if (cachedMessages && cachedMessages.length > 0) {
        displayCachedMessages(cachedMessages);
        // Don't hide loading message here - wait for real-time data
    }
    
    // Set up real-time listener with proper error handling
    try {
        unsubscribeChat = onSnapshot(
            collection(db, 'conversations', threadId, 'messages'),
            async (snapshot) => {
                const messages = [];
                let hasUnreadMessages = false;
                
                snapshot.forEach(doc => {
                    const messageData = doc.data();
                    // Convert Firestore timestamp to serializable format for caching
                    const serializableMessage = {
                        id: doc.id,
                        ...messageData,
                        timestamp: messageData.timestamp ? 
                            (messageData.timestamp.toDate ? messageData.timestamp.toDate().toISOString() : messageData.timestamp) 
                            : new Date().toISOString()
                    };
                    messages.push(serializableMessage);
                    
                    // Check if there are unread messages from partner
                    if (messageData.senderId === partnerId && !messageData.read) {
                        hasUnreadMessages = true;
                    }
                });
                
                // Sort messages by timestamp
                messages.sort((a, b) => {
                    const timeA = new Date(a.timestamp).getTime();
                    const timeB = new Date(b.timestamp).getTime();
                    return timeA - timeB;
                });
                
                // Cache messages with proper timestamp format
                cache.set(cacheKey, messages, 'short');
                
                // FIXED: Clear only temporary messages and update display
                updateMessagesDisplay(messages, userId);
                
                // Mark messages as read if there are unread ones
                if (hasUnreadMessages) {
                    await markMessagesAsRead(threadId, partnerId, userId);
                }
                
                // Scroll to bottom
                setTimeout(() => {
                    messagesContainer.scrollTop = messagesContainer.scrollHeight;
                }, 100);
                
                // Only hide loading message on initial load, not on subsequent updates
                if (document.querySelector('#chatMessages .loading-message')) {
                    hideChatLoadingMessage();
                }
                
                // Refresh the global unread count
                refreshUnreadMessageCount();
            },
            (error) => {
                logError(error, 'chat messages listener');
                // If real-time fails, show cached messages
                if (cachedMessages) {
                    displayCachedMessages(cachedMessages);
                }
                hideChatLoadingMessage();
            }
        );
    } catch (error) {
        logError(error, 'setting up chat messages listener');
        hideChatLoadingMessage();
    }
}

// FIXED: Mark messages as read when viewing chat
async function markMessagesAsRead(threadId, partnerId, userId) {
    try {
        // Get all unread messages from partner
        const unreadMessagesQuery = query(
            collection(db, 'conversations', threadId, 'messages'),
            where('senderId', '==', partnerId),
            where('read', '==', false)
        );
        
        const unreadMessagesSnap = await getDocs(unreadMessagesQuery);
        
        // Mark each message as read
        const updatePromises = [];
        unreadMessagesSnap.forEach((doc) => {
            updatePromises.push(updateDoc(doc.ref, {
                read: true
            }));
        });
        
        await Promise.all(updatePromises);
        
        // Refresh unread count after marking messages as read
        refreshUnreadMessageCount();
        
    } catch (error) {
        logError(error, 'marking messages as read');
    }
}

// FIXED: Updated message display function to prevent duplicates
function updateMessagesDisplay(newMessages, currentUserId) {
    const messagesContainer = document.getElementById('chatMessages');
    
    // Remove only temporary messages and keep real messages
    const tempMessages = messagesContainer.querySelectorAll('[data-message-id^="temp_"]');
    tempMessages.forEach(msg => msg.remove());
    
    // Remove loading message if it exists
    hideChatLoadingMessage();
    
    // Clear the container only if we have no messages displayed
    const existingMessages = messagesContainer.querySelectorAll('.message:not([data-message-id^="temp_"])');
    if (existingMessages.length === 0 && newMessages.length > 0) {
        messagesContainer.innerHTML = '';
    }
    
    // Display all messages
    newMessages.forEach(message => {
        // Check if message already exists (not temporary)
        const existingMessage = messagesContainer.querySelector(`[data-message-id="${message.id}"]`);
        if (!existingMessage) {
            displayMessage(message, currentUserId);
        } else {
            // Update existing message if needed (like reactions, read status)
            updateExistingMessage(existingMessage, message, currentUserId);
        }
    });
    
    // If no messages at all, show empty state
    if (newMessages.length === 0 && messagesContainer.children.length === 0) {
        const noMessagesDiv = document.createElement('div');
        noMessagesDiv.className = 'no-messages';
        noMessagesDiv.textContent = 'No messages yet. Start the conversation!';
        messagesContainer.appendChild(noMessagesDiv);
    }
}

// FIXED: Updated addMessage function to prevent duplicate messages
async function addMessage(text = null, imageUrl = null, audioUrl = null, audioDuration = null, videoUrl = null, videoDuration = null) {
    if (!text && !imageUrl && !audioUrl && !videoUrl) return;
    
    try {
        // Create a combined ID for the chat thread
        const threadId = [currentUser.uid, chatPartnerId].sort().join('_');
        
        const messageData = {
            senderId: currentUser.uid,
            text: text || null,
            imageUrl: imageUrl || null,
            audioUrl: audioUrl || null,
            duration: audioDuration || videoDuration || null,
            videoUrl: videoUrl || null,
            read: false,
            timestamp: serverTimestamp()
        };
        
        // Add replyTo if replying to a message
        if (selectedMessageForReply) {
            messageData.replyTo = selectedMessageForReply;
        }
        
        // FIXED: Generate a temporary ID that we can track
        const tempMessageId = 'temp_' + Date.now();
        const tempMessage = {
            id: tempMessageId,
            ...messageData,
            timestamp: new Date().toISOString() // Temporary client-side timestamp
        };
        
        // Store the temp message ID so we can remove it later
        window.lastTempMessageId = tempMessageId;
        
        // Display the message immediately (optimistic update)
        displayMessage(tempMessage, currentUser.uid);
        
        // Scroll to bottom to show the new message
        const messagesContainer = document.getElementById('chatMessages');
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
        
        // Add message to Firestore
        const docRef = await addDoc(collection(db, 'conversations', threadId, 'messages'), messageData);
        
        // FIXED: Update the conversation document after successful message send
        let lastMessageText = '';
        if (text) lastMessageText = text;
        else if (imageUrl) lastMessageText = 'Image';
        else if (audioUrl) lastMessageText = 'Voice message';
        else if (videoUrl) lastMessageText = 'Video message';
        
        await setDoc(doc(db, 'conversations', threadId), {
            participants: [currentUser.uid, chatPartnerId],
            lastMessage: {
                text: lastMessageText,
                senderId: currentUser.uid,
                timestamp: serverTimestamp()
            },
            updatedAt: serverTimestamp()
        }, { merge: true });
        
        // The Firestore listener will automatically update the message with the real ID and timestamp
        // The temporary message will be replaced when the real message comes through the listener
        
        // Clear reply after sending
        cancelReply();
        
    } catch (error) {
        logError(error, 'adding message');
        showNotification('Error sending message. Please try again.', 'error');
        
        // FIXED: Remove the optimistic message if there was an error
        const tempMessageElement = document.querySelector(`[data-message-id="${window.lastTempMessageId}"]`);
        if (tempMessageElement) {
            tempMessageElement.remove();
        }
    }
}

// FIXED: Update existing message without recreating it
function updateExistingMessage(existingElement, message, currentUserId) {
    // Update reactions
    updateMessageReactions(existingElement, message);
    
    // Update read status
    if (message.senderId === currentUserId && message.read) {
        const timeElement = existingElement.querySelector('.message-time');
        if (timeElement && !timeElement.textContent.includes('✓✓')) {
            timeElement.textContent = timeElement.textContent.replace('✓', '✓✓');
        }
    }
    
    // Update timestamp if it's a temporary message that was just confirmed
    if (existingElement.classList.contains('sending')) {
        const timeElement = existingElement.querySelector('.message-time');
        if (timeElement && timeElement.textContent === 'Sending...') {
            timeElement.textContent = formatTime(message.timestamp);
            existingElement.style.opacity = '1';
            existingElement.classList.remove('sending');
            
            // Remove sending indicator for images
            const sendingIndicator = existingElement.querySelector('.sending-indicator');
            if (sendingIndicator) {
                sendingIndicator.remove();
            }
            
            // Remove sending class from image
            const image = existingElement.querySelector('.message-image.sending');
            if (image) {
                image.classList.remove('sending');
            }
        }
    }
}

// FIXED: Update only the reactions part of a message
function updateMessageReactions(messageElement, message) {
    let reactionsContainer = messageElement.querySelector('.message-reactions');
    const reactions = message.reactions || {};
    
    if (Object.keys(reactions).length === 0) {
        // Remove reactions container if no reactions
        if (reactionsContainer) {
            reactionsContainer.remove();
        }
        return;
    }
    
    if (!reactionsContainer) {
        // Create reactions container if it doesn't exist
        reactionsContainer = document.createElement('div');
        reactionsContainer.className = 'message-reactions';
        
        // Insert before the timestamp
        const timeElement = messageElement.querySelector('.message-time');
        if (timeElement) {
            messageElement.insertBefore(reactionsContainer, timeElement);
        } else {
            messageElement.appendChild(reactionsContainer);
        }
    }
    
    // Update reactions content
    reactionsContainer.innerHTML = '';
    for (const [emoji, users] of Object.entries(reactions)) {
        const reactionElement = document.createElement('span');
        reactionElement.className = 'reaction';
        reactionElement.innerHTML = `${emoji} <span class="reaction-count">${users.length}</span>`;
        reactionsContainer.appendChild(reactionElement);
    }
}

// FIXED: Updated displayCachedMessages function to handle loading state properly
function displayCachedMessages(messages) {
    const messagesContainer = document.getElementById('chatMessages');
    
    // Remove loading message but don't clear the entire container
    hideChatLoadingMessage();
    
    // Only proceed if we have messages to display
    if (messages.length === 0) {
        const noMessagesDiv = document.createElement('div');
        noMessagesDiv.className = 'no-messages';
        noMessagesDiv.textContent = 'No messages yet. Start the conversation!';
        messagesContainer.appendChild(noMessagesDiv);
        return;
    }
    
    // Ensure messages are sorted
    messages.sort((a, b) => {
        const timeA = new Date(a.timestamp).getTime();
        const timeB = new Date(b.timestamp).getTime();
        return timeA - timeB;
    });
    
    // Add messages that don't already exist
    messages.forEach(message => {
        const existingMessage = document.querySelector(`[data-message-id="${message.id}"]`);
        if (!existingMessage) {
            displayMessage(message, currentUser.uid);
        }
    });
    
    // Scroll to bottom
    setTimeout(() => {
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }, 100);
}

function getRepliedMessage(messageId) {
    const cachedMessages = cache.get(`messages_${currentUser.uid}_${chatPartnerId}`) || [];
    return cachedMessages.find(m => m.id === messageId);
}

// Page Initialization Functions
function initLandingPage() {
    // Show fast loading message
    showFastLoadingMessage();
}

function initLoginPage() {
    const loginForm = document.getElementById('loginForm');
    const togglePassword = document.getElementById('toggleLoginPassword');
    const resetPasswordLink = document.getElementById('resetPassword');

    // Show fast loading message
    showFastLoadingMessage();

    if (loginForm) {
        eventManager.addListener(loginForm, 'submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('loginEmail').value;
            const password = document.getElementById('loginPassword').value;

            try {
                const userCredential = await signInWithEmailAndPassword(auth, email, password);
                const user = userCredential.user;
                
                // Manually check if account is disabled
                const userDoc = await getDoc(doc(db, 'users', user.uid));
                if (userDoc.exists() && userDoc.data().accountDisabled) {
                    // DON'T sign out - just redirect to disabled page
                    // This keeps the user logged in so they can request verification emails
                    window.location.href = 'disabled.html';
                    return;
                }
                
                showNotification('Login successful! Redirecting...', 'success');
                setTimeout(() => {
                    window.location.href = 'mingle.html';
                }, 1500);
                
            } catch (error) {
                logError(error, 'login');
                showNotification(error.message, 'error');
            }
        });
    }

    if (togglePassword) {
        eventManager.addListener(togglePassword, 'click', () => {
            const passwordInput = document.getElementById('loginPassword');
            const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
            passwordInput.setAttribute('type', type);
            togglePassword.innerHTML = type === 'password' ? '<i class="far fa-eye"></i>' : '<i class="far fa-eye-slash"></i>';
        });
    }

    if (resetPasswordLink) {
        eventManager.addListener(resetPasswordLink, 'click', async (e) => {
            e.preventDefault();
            const email = prompt('Please enter your email address:');
            if (email) {
                try {
                    await sendPasswordResetEmail(auth, email);
                    showNotification('Password reset email sent. Please check your inbox.', 'success');
                } catch (error) {
                    logError(error, 'resetPassword');
                    showNotification(error.message, 'error');
                }
            }
        });
    }
}

function initSignupPage() {
    const signupForm = document.getElementById('signupForm');
    const togglePassword = document.getElementById('toggleSignupPassword');

    // Show fast loading message
    showFastLoadingMessage();

    if (signupForm) {
        eventManager.addListener(signupForm, 'submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('signupEmail').value;
            const password = document.getElementById('signupPassword').value;
            const confirmPassword = document.getElementById('confirmPassword').value;

            if (password !== confirmPassword) {
                showNotification('Passwords do not match', 'error');
                return;
            }

            try {
                const userCredential = await createUserWithEmailAndPassword(auth, email, password);
                const user = userCredential.user;
                
                // Create user profile in Firestore
                await setDoc(doc(db, 'users', user.uid), {
                    email: email,
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp(),
                    profileComplete: false,
                    chatPoints: 12,
                    paymentHistory: [],
                    accountDisabled: false
                });
                
                showNotification('Account created successfully! Redirecting...', 'success');
                setTimeout(() => {
                    window.location.href = 'account.html';
                }, 1500);
                
            } catch (error) {
                logError(error, 'signup');
                showNotification(error.message, 'error');
            }
        });
    }

    if (togglePassword) {
        eventManager.addListener(togglePassword, 'click', () => {
            const passwordInput = document.getElementById('signupPassword');
            const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
            passwordInput.setAttribute('type', type);
            togglePassword.innerHTML = type === 'password' ? '<i class="far fa-eye"></i>' : '<i class="far fa-eye-slash"></i>';
        });
    }
}

function initDashboardPage() {
    const logoutBtn = document.getElementById('logoutBtn');
    const mingleBtn = document.getElementById('mingleBtn');
    const messagesBtn = document.getElementById('messagesBtn');
    const profileBtn = document.getElementById('profileBtn');
    const accountBtn = document.getElementById('accountBtn');
    const purchasePointsBtn = document.getElementById('purchasePointsBtn');

    // Show fast loading message
    showFastLoadingMessage();

    // Load user's chat points
    loadUserChatPoints();

    if (logoutBtn) {
        eventManager.addListener(logoutBtn, 'click', handleLogout);
    }

    if (mingleBtn) {
        eventManager.addListener(mingleBtn, 'click', () => {
            window.location.href = 'mingle.html';
        });
    }

    if (messagesBtn) {
        eventManager.addListener(messagesBtn, 'click', () => {
            window.location.href = 'messages.html';
        });
    }

    if (profileBtn) {
        eventManager.addListener(profileBtn, 'click', () => {
            window.location.href = 'profile.html';
        });
    }

    if (accountBtn) {
        eventManager.addListener(accountBtn, 'click', () => {
            window.location.href = 'account.html';
        });
    }

    if (purchasePointsBtn) {
        eventManager.addListener(purchasePointsBtn, 'click', () => {
            window.location.href = 'payment.html';
        });
    }
}

function initPaymentPage() {
    const logoutBtn = document.getElementById('logoutBtn');
    const backBtn = document.getElementById('backBtn');
    const planButtons = document.querySelectorAll('.plan-button');
    const paymentForm = document.getElementById('paymentForm');
    const copyBtns = document.querySelectorAll('.copy-btn');

    // Show fast loading message
    showFastLoadingMessage();

    // Load user's chat points
    loadUserChatPoints();

    if (logoutBtn) {
        eventManager.addListener(logoutBtn, 'click', handleLogout);
    }

    if (backBtn) {
        eventManager.addListener(backBtn, 'click', () => {
            window.location.href = 'dashboard.html';
        });
    }

    // Plan selection
    planButtons.forEach(button => {
        eventManager.addListener(button, 'click', () => {
            planButtons.forEach(btn => btn.classList.remove('selected'));
            button.classList.add('selected');
            document.getElementById('selectedPlan').value = button.dataset.plan;
        });
    });

    // Copy wallet address
    copyBtns.forEach(btn => {
        eventManager.addListener(btn, 'click', (e) => {
            e.preventDefault();
            const address = btn.dataset.address;
            navigator.clipboard.writeText(address).then(() => {
                const originalText = btn.innerHTML;
                btn.innerHTML = '<i class="fas fa-check"></i> Copied!';
                setTimeout(() => {
                    btn.innerHTML = originalText;
                }, 2000);
            }).catch(err => {
                console.error('Could not copy text: ', err);
            });
        });
    });

    // Payment form submission
    if (paymentForm) {
        eventManager.addListener(paymentForm, 'submit', async (e) => {
            e.preventDefault();
            
            const plan = document.getElementById('selectedPlan').value;
            const transactionId = document.getElementById('transactionId').value.trim();
            const email = document.getElementById('paymentEmail').value.trim();
            
            if (!plan) {
                showNotification('Please select a plan', 'warning');
                return;
            }
            
            if (!transactionId) {
                showNotification('Please enter your transaction ID', 'warning');
                return;
            }
            
            try {
                // Add payment to user's history using arrayUnion
                const userRef = doc(db, 'users', currentUser.uid);
                
                const paymentData = {
                    plan,
                    transactionId,
                    email,
                    status: 'pending',
                    date: new Date().toISOString()
                };
                
                await updateDoc(userRef, {
                    paymentHistory: arrayUnion(paymentData),
                    updatedAt: serverTimestamp()
                });
                
                showNotification('Payment submitted successfully! Our team will verify your payment and add your chat points soon.', 'success');
                paymentForm.reset();
            } catch (error) {
                logError(error, 'submitting payment');
                showNotification('Error submitting payment. Please try again.', 'error');
            }
        });
    }
}

function initAdminPage() {
    const loginForm = document.getElementById('adminLoginForm');
    const paymentList = document.getElementById('paymentList');
    const adminContent = document.getElementById('adminContent');
    const logoutBtn = document.getElementById('adminLogoutBtn');

    // Show fast loading message
    showFastLoadingMessage();

    // Check if admin is already logged in
    const isAdmin = sessionStorage.getItem('adminLoggedIn') === 'true';
    if (isAdmin) {
        showAdminContent();
        loadPendingPayments();
    } else {
        showLoginForm();
    }

    if (loginForm) {
        eventManager.addListener(loginForm, 'submit', (e) => {
            e.preventDefault();
            const email = document.getElementById('adminEmail').value;
            const password = document.getElementById('adminPassword').value;
            
            if (email === 'cypriandavidonyebuchi@gmail.com' && password === 'admin123') {
                sessionStorage.setItem('adminLoggedIn', 'true');
                showAdminContent();
                loadPendingPayments();
            } else {
                showNotification('Invalid admin credentials', 'error');
            }
        });
    }

    if (logoutBtn) {
        eventManager.addListener(logoutBtn, 'click', () => {
            sessionStorage.removeItem('adminLoggedIn');
            showLoginForm();
        });
    }

    function showLoginForm() {
        if (loginForm) loginForm.style.display = 'block';
        if (adminContent) adminContent.style.display = 'none';
    }

    function showAdminContent() {
        if (loginForm) loginForm.style.display = 'none';
        if (adminContent) adminContent.style.display = 'block';
    }

    async function loadPendingPayments() {
        try {
            const usersRef = collection(db, 'users');
            const usersSnap = await getDocs(usersRef);
            
            paymentList.innerHTML = '';
            
            for (const userDoc of usersSnap.docs) {
                const userData = userDoc.data();
                if (userData.paymentHistory && userData.paymentHistory.length > 0) {
                    const pendingPayments = userData.paymentHistory.filter(p => p.status === 'pending');
                    
                    for (const payment of pendingPayments) {
                        const paymentItem = document.createElement('div');
                        paymentItem.className = 'payment-item';
                        paymentItem.innerHTML = `
                            <div class="payment-info">
                                <p><strong>User:</strong> ${userData.email}</p>
                                <p><strong>Plan:</strong> ${payment.plan}</p>
                                <p><strong>Transaction ID:</strong> ${payment.transactionId}</p>
                                <p><strong>Date:</strong> ${formatTime(payment.date)}</p>
                            </div>
                            <div class="payment-actions">
                                <button class="approve-btn" data-user="${userDoc.id}" data-tx="${payment.transactionId}" data-plan="${payment.plan}">Approve</button>
                                <button class="reject-btn" data-user="${userDoc.id}" data-tx="${payment.transactionId}">Reject</button>
                            </div>
                        `;
                        
                        paymentList.appendChild(paymentItem);
                    }
                }
            }
            
            // Add event listeners to approve/reject buttons
            document.querySelectorAll('.approve-btn').forEach(btn => {
                eventManager.addListener(btn, 'click', async () => {
                    const userId = btn.dataset.user;
                    const txId = btn.dataset.tx;
                    const plan = btn.dataset.plan;
                    
                    try {
                        // Get user data
                        const userRef = doc(db, 'users', userId);
                        const userSnap = await getDoc(userRef);
                        
                        if (userSnap.exists()) {
                            // Update payment status in the array
                            const updatedPayments = userSnap.data().paymentHistory.map(p => {
                                if (p.transactionId === txId) {
                                    return { ...p, status: 'approved' };
                                }
                                return p;
                            });
                            
                            // Determine points to add based on plan
                            let pointsToAdd = 0;
                            switch (plan) {
                                case '30_points': pointsToAdd = 30; break;
                                case '300_points': pointsToAdd = 300; break;
                                case 'lifetime': pointsToAdd = 9999; break;
                            }
                            
                            // Update user document
                            await updateDoc(userRef, {
                                paymentHistory: updatedPayments,
                                chatPoints: (userSnap.data().chatPoints || 0) + pointsToAdd,
                                updatedAt: serverTimestamp()
                            });
                            
                            showNotification('Payment approved and points added!', 'success');
                            loadPendingPayments();
                        }
                    } catch (error) {
                        logError(error, 'approving payment');
                        showNotification('Error approving payment', 'error');
                    }
                });
            });
            
            document.querySelectorAll('.reject-btn').forEach(btn => {
                eventManager.addListener(btn, 'click', async () => {
                    const userId = btn.dataset.user;
                    const txId = btn.dataset.tx;
                    
                    try {
                        // Get user data
                        const userRef = doc(db, 'users', userId);
                        const userSnap = await getDoc(userRef);
                        
                        if (userSnap.exists()) {
                            // Update payment status in the array
                            const updatedPayments = userSnap.data().paymentHistory.map(p => {
                                if (p.transactionId === txId) {
                                    return { ...p, status: 'rejected' };
                                }
                                return p;
                            });
                            
                            // Update user document
                            await updateDoc(userRef, {
                                paymentHistory: updatedPayments,
                                updatedAt: serverTimestamp()
                            });
                            
                            showNotification('Payment rejected!', 'success');
                            loadPendingPayments();
                        }
                    } catch (error) {
                        logError(error, 'rejecting payment');
                        showNotification('Error rejecting payment', 'error');
                    }
                });
            });
        } catch (error) {
            logError(error, 'loading pending payments');
            paymentList.innerHTML = '<p>Error loading payments. Please try again.</p>';
        }
    }
}

function initMinglePage() {
    const dislikeBtn = document.getElementById('dislikeBtn');
    const likeBtn = document.getElementById('likeBtn');
    const viewProfileBtn = document.getElementById('viewProfileBtn');
    const chatBtn = document.getElementById('chatBtn');
    const logoutBtn = document.getElementById('logoutBtn');
    const dashboardBtn = document.getElementById('dashboardBtn');

    // Show fast loading message
    showFastLoadingMessage();

    // Load profiles to mingle with
    loadProfiles();

    if (dislikeBtn) {
        eventManager.addListener(dislikeBtn, 'click', () => {
            showNextProfile();
        });
    }

    if (likeBtn) {
        eventManager.addListener(likeBtn, 'click', async () => {
            const currentProfile = profiles[currentProfileIndex];
            if (currentProfile) {
                try {
                    // Add to liked profiles
                    await addDoc(collection(db, 'users', currentUser.uid, 'liked'), {
                        userId: currentProfile.id,
                        timestamp: serverTimestamp()
                    });
                    
                    // Increment like count for the profile
                    const profileRef = doc(db, 'users', currentProfile.id);
                    const profileSnap = await getDoc(profileRef);
                    
                    if (profileSnap.exists()) {
                        const currentLikes = profileSnap.data().likes || 0;
                        await updateDoc(profileRef, {
                            likes: currentLikes + 50
                        });
                    }
                    
                    showNextProfile();
                } catch (error) {
                    logError(error, 'liking profile');
                    showNotification('Error liking profile. Please try again.', 'error');
                }
            }
        });
    }

    if (viewProfileBtn) {
        eventManager.addListener(viewProfileBtn, 'click', () => {
            const currentProfile = profiles[currentProfileIndex];
            if (currentProfile) {
                window.location.href = `profile.html?id=${currentProfile.id}`;
            }
        });
    }

    if (chatBtn) {
        eventManager.addListener(chatBtn, 'click', () => {
            const currentProfile = profiles[currentProfileIndex];
            if (currentProfile) {
                window.location.href = `chat.html?id=${currentProfile.id}`;
            }
        });
    }

    if (logoutBtn) {
        eventManager.addListener(logoutBtn, 'click', handleLogout);
    }

    if (dashboardBtn) {
        eventManager.addListener(dashboardBtn, 'click', () => {
            window.location.href = 'dashboard.html';
        });
    }
}

function initProfilePage() {
    console.log('Initializing profile page...');
    
    const backToMingle = document.getElementById('backToMingle');
    const messageProfileBtn = document.getElementById('messageProfileBtn');
    const likeProfileBtn = document.getElementById('likeProfileBtn');
    const logoutBtn = document.getElementById('logoutBtn');
    const dashboardBtn = document.getElementById('dashboardBtn');
    const thumbnails = document.querySelectorAll('.thumbnail');

    // Show fast loading message
    showFastLoadingMessage();

    // Load profile data from URL parameter
    const urlParams = new URLSearchParams(window.location.search);
    const profileId = urlParams.get('id');

    // Store profileId globally for use in like function
    window.currentProfileId = profileId;

    if (profileId) {
        loadProfileData(profileId);
    } else {
        // If no profile ID, redirect to mingle page
        showNotification('No profile selected', 'error');
        setTimeout(() => {
            window.location.href = 'mingle.html';
        }, 2000);
        return;
    }

    // Thumbnail click event
    thumbnails.forEach(thumbnail => {
        eventManager.addListener(thumbnail, 'click', () => {
            thumbnails.forEach(t => t.classList.remove('active'));
            thumbnail.classList.add('active');
            document.getElementById('mainProfileImage').src = thumbnail.src;
        });
    });

    if (backToMingle) {
        eventManager.addListener(backToMingle, 'click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log('Back to mingle clicked');
            window.location.href = 'mingle.html';
        });
    } else {
        console.error('Back to mingle button not found');
    }

    if (messageProfileBtn) {
        eventManager.addListener(messageProfileBtn, 'click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log('Message profile clicked');
            
            const urlParams = new URLSearchParams(window.location.search);
            const profileId = urlParams.get('id');
            
            if (profileId) {
                window.location.href = `chat.html?id=${profileId}`;
            } else {
                showNotification('Cannot message this profile', 'error');
            }
        });
    } else {
        console.error('Message profile button not found');
    }

    if (likeProfileBtn) {
        eventManager.addListener(likeProfileBtn, 'click', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log('Like profile clicked');
            
            await handleLikeProfile(likeProfileBtn);
        });
    } else {
        console.error('Like profile button not found');
    }

    if (logoutBtn) {
        eventManager.addListener(logoutBtn, 'click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            handleLogout();
        });
    }

    if (dashboardBtn) {
        eventManager.addListener(dashboardBtn, 'click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            window.location.href = 'dashboard.html';
        });
    }
}

// Handle like profile function
async function handleLikeProfile(likeButton) {
    // Use the stored profileId
    const profileIdToLike = window.currentProfileId;
    
    if (!profileIdToLike) {
        showNotification('Cannot like this profile', 'error');
        return;
    }

    if (!currentUser) {
        showNotification('Please log in to like profiles', 'error');
        return;
    }

    try {
        // Check if already liked to prevent duplicate likes
        const likedRef = collection(db, 'users', currentUser.uid, 'liked');
        const likedQuery = query(likedRef, where('userId', '==', profileIdToLike));
        const likedSnap = await getDocs(likedQuery);
        
        if (!likedSnap.empty) {
            showNotification('You already liked this profile!', 'info');
            return;
        }

        // Add to liked profiles
        await addDoc(collection(db, 'users', currentUser.uid, 'liked'), {
            userId: profileIdToLike,
            timestamp: serverTimestamp(),
            likedAt: new Date().toISOString()
        });
        
        // Increment like count for the profile
        const profileRef = doc(db, 'users', profileIdToLike);
        const profileSnap = await getDoc(profileRef);
        
        if (profileSnap.exists()) {
            const currentLikes = profileSnap.data().likes || 0;
            await updateDoc(profileRef, {
                likes: currentLikes + 1,
                updatedAt: serverTimestamp()
            });
            
            // Update the displayed like count immediately
            const likeCountElement = document.getElementById('viewLikeCount');
            if (likeCountElement) {
                likeCountElement.textContent = currentLikes + 1;
            }
        }
        
        // Update button state
        likeButton.innerHTML = '<i class="fas fa-heart"></i> Liked';
        likeButton.classList.add('liked');
        likeButton.disabled = true;
        
        showNotification('Profile liked successfully!', 'success');
        
    } catch (error) {
        logError(error, 'liking profile from profile page');
        showNotification('Error liking profile. Please try again.', 'error');
    }
}

function initAccountPage() {
    const profileImageUpload = document.getElementById('profileImageUpload');
    const removeProfileImage = document.getElementById('removeProfileImage');
    const accountMenuItems = document.querySelectorAll('.menu-item');
    const addInterestBtn = document.getElementById('addInterestBtn');
    const profileForm = document.getElementById('profileForm');
    const settingsForm = document.getElementById('settingsForm');
    const privacyForm = document.getElementById('privacyForm');
    const logoutBtn = document.getElementById('logoutBtn');
    const dashboardBtn = document.getElementById('dashboardBtn');

    // Show fast loading message
    showFastLoadingMessage();

    // Initialize menu tabs
    accountMenuItems.forEach(item => {
        eventManager.addListener(item, 'click', () => {
            accountMenuItems.forEach(i => i.classList.remove('active'));
            item.classList.add('active');
            
            document.querySelectorAll('.account-section').forEach(section => {
                section.style.display = 'none';
            });
            
            document.getElementById(`${item.dataset.section}Section`).style.display = 'block';
        });
    });

    // Profile image upload
    if (profileImageUpload) {
        eventManager.addListener(profileImageUpload, 'change', async (e) => {
            const file = e.target.files[0];
            if (file) {
                try {
                    // Show loading state
                    const uploadButton = document.querySelector('.upload-button');
                    if (uploadButton) {
                        uploadButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Uploading...';
                        uploadButton.disabled = true;
                    }

                    // Upload to Cloudinary
                    const imageUrl = await uploadImageToCloudinary(file);
                    
                    // Update profile image in Firestore
                    await updateDoc(doc(db, 'users', currentUser.uid), {
                        profileImage: imageUrl,
                        updatedAt: serverTimestamp()
                    });
                    
                    // Update image display
                    document.getElementById('accountProfileImage').src = imageUrl;
                    
                    // Reset button state
                    if (uploadButton) {
                        uploadButton.innerHTML = '<i class="fas fa-upload"></i> Upload Image';
                        uploadButton.disabled = false;
                    }
                } catch (error) {
                    logError(error, 'uploading profile image');
                    showNotification('Failed to upload image. Please check your connection and try again.', 'error');
                    
                    // Reset button state on error
                    const uploadButton = document.querySelector('.upload-button');
                    if (uploadButton) {
                        uploadButton.innerHTML = '<i class="fas fa-upload"></i> Upload Image';
                        uploadButton.disabled = false;
                    }
                }
            }
        });
    }

    if (removeProfileImage) {
        eventManager.addListener(removeProfileImage, 'click', async () => {
            try {
                // Remove profile image in Firestore
                await updateDoc(doc(db, 'users', currentUser.uid), {
                    profileImage: null,
                    updatedAt: serverTimestamp()
                });
                
                // Reset to default image
                document.getElementById('accountProfileImage').src = 'images-default-profile.jpg';
            } catch (error) {
                logError(error, 'removing profile image');
                showNotification('Error removing image: ' + error.message, 'error');
            }
        });
    }

    // Add interest
    if (addInterestBtn) {
        eventManager.addListener(addInterestBtn, 'click', () => {
            const interestInput = document.getElementById('accountInterests');
            const interest = interestInput.value.trim();
            
            if (interest) {
                const interestsContainer = document.getElementById('accountInterestsContainer');
                const existingInterests = interestsContainer.querySelectorAll('.interest-tag');
                
                if (existingInterests.length >= 5) {
                    showNotification('You can only add up to 5 interests', 'warning');
                    return;
                }
                
                const interestTag = document.createElement('span');
                interestTag.className = 'interest-tag';
                interestTag.textContent = interest;
                
                const removeBtn = document.createElement('span');
                removeBtn.innerHTML = ' &times;';
                removeBtn.style.cursor = 'pointer';
                removeBtn.addEventListener('click', () => {
                    interestTag.remove();
                });
                
                interestTag.appendChild(removeBtn);
                interestsContainer.appendChild(interestTag);
                interestInput.value = '';
            }
        });
    }

    // Profile form submission
    if (profileForm) {
        eventManager.addListener(profileForm, 'submit', async (e) => {
            e.preventDefault();
            
            const name = document.getElementById('accountName').value;
            const age = document.getElementById('accountAge').value;
            const gender = document.getElementById('accountGender').value;
            const location = document.getElementById('accountLocation').value;
            const bio = document.getElementById('accountBio').value;
            const phone = document.getElementById('accountPhone').value;
            
            const interestsContainer = document.getElementById('accountInterestsContainer');
            const interests = Array.from(interestsContainer.querySelectorAll('.interest-tag')).map(tag => 
                tag.textContent.replace(' ×', '')
            );
            
            try {
                await updateDoc(doc(db, 'users', currentUser.uid), {
                    name,
                    age: parseInt(age),
                    gender,
                    location,
                    bio,
                    phone: phone || null,
                    interests,
                    profileComplete: true,
                    updatedAt: serverTimestamp()
                });
                
                showNotification('Profile updated successfully!', 'success');
            } catch (error) {
                logError(error, 'updating profile');
                showNotification('Error updating profile: ' + error.message, 'error');
            }
        });
    }

    // Settings form submission
    if (settingsForm) {
        eventManager.addListener(settingsForm, 'submit', async (e) => {
            e.preventDefault();
            
            const currentPassword = document.getElementById('currentPassword').value;
            const newPassword = document.getElementById('newPassword').value;
            const confirmNewPassword = document.getElementById('confirmNewPassword').value;
            
            if (newPassword !== confirmNewPassword) {
                showNotification('New passwords do not match', 'error');
                return;
            }
            
            if (newPassword && !currentPassword) {
                showNotification('Please enter your current password', 'warning');
                return;
            }
            
            try {
                if (newPassword) {
                    showNotification('Password change not possible at the moment', 'info');
                }
                
                // Clear form
                settingsForm.reset();
                showNotification('Settings updated successfully!', 'success');
            } catch (error) {
                logError(error, 'updating settings');
                showNotification('Error updating settings: ' + error.message, 'error');
            }
        });
    }

    // Privacy form submission
    if (privacyForm) {
        eventManager.addListener(privacyForm, 'submit', async (e) => {
            e.preventDefault();
            
            const showAge = document.getElementById('showAge').checked;
            const showLocation = document.getElementById('showLocation').checked;
            const showOnlineStatus = document.getElementById('showOnlineStatus').checked;
            
            try {
                await updateDoc(doc(db, 'users', currentUser.uid), {
                    privacySettings: {
                        showAge,
                        showLocation,
                        showOnlineStatus
                    },
                    updatedAt: serverTimestamp()
                });
                
                showNotification('Privacy settings updated successfully!', 'success');
            } catch (error) {
                logError(error, 'updating privacy settings');
                showNotification('Error updating privacy settings: ' + error.message, 'error');
            }
        });
    }

    if (logoutBtn) {
        eventManager.addListener(logoutBtn, 'click', handleLogout);
    }

    if (dashboardBtn) {
        eventManager.addListener(dashboardBtn, 'click', () => {
            window.location.href = 'dashboard.html';
        });
    }
}

// UPDATED: Chat page initialization with optimized voice recording and image sending
function initChatPage() {
    const backToMessages = document.getElementById('backToMessages');
    const messageInput = document.getElementById('messageInput');
    const sendMessageBtn = document.getElementById('sendMessageBtn');
    const attachmentBtn = document.getElementById('attachmentBtn');
    const imageUpload = document.getElementById('imageUpload');
    const videoUpload = document.getElementById('videoUpload');
    const voiceNoteBtn = document.getElementById('voiceNoteBtn');
    const videoNoteBtn = document.getElementById('videoNoteBtn');
    const voiceNoteIndicator = document.getElementById('voiceNoteIndicator');
    const voiceNoteTimer = document.getElementById('voiceNoteTimer');
    const cancelVoiceNoteBtn = document.getElementById('cancelVoiceNoteBtn');
    const sendVoiceNoteBtn = document.getElementById('sendVoiceNoteBtn');
    const videoRecordingIndicator = document.getElementById('videoRecordingIndicator');
    const videoRecordingTimer = document.getElementById('videoRecordingTimer');
    const cancelVideoRecordingBtn = document.getElementById('cancelVideoRecordingBtn');
    const logoutBtn = document.getElementById('logoutBtn');
    const dashboardBtn = document.getElementById('dashboardBtn');
    const cancelReplyBtn = document.getElementById('cancelReply');

    // FIX: Show loading message immediately and keep it until messages are loaded
    showChatLoadingMessage();

    // Load chat data from URL parameter
    const urlParams = new URLSearchParams(window.location.search);
    chatPartnerId = urlParams.get('id');

    // Clear any existing listeners first
    if (unsubscribeChat) {
        unsubscribeChat();
        unsubscribeChat = null;
    }

    if (chatPartnerId) {
        // Try to load cached chat partner data first
        const cachedPartnerData = cache.get(`partner_${chatPartnerId}`);
        if (cachedPartnerData) {
            displayChatPartnerData(cachedPartnerData);
        } else {
            loadChatPartnerData(chatPartnerId);
        }

        // Load messages with proper cleanup - this will handle the loading state
        loadChatMessages(currentUser.uid, chatPartnerId);
        
        setupTypingIndicator();
        setupMessageLongPress();
        setupMessageSwipe();
    } else {
        // If no chat partner, show error and redirect
        showNotification('No chat selected', 'error');
        setTimeout(() => {
            window.location.href = 'messages.html';
        }, 2000);
        return;
    }

    if (backToMessages) {
        eventManager.addListener(backToMessages, 'click', () => {
            // Clean up before leaving
            cleanupChatPage();
            window.location.href = 'messages.html';
        });
    }

    // Send message function - FIXED with faster sending
    async function sendMessage() {
        const message = messageInput.value.trim();
        if (message) {
            // Check if user has chat points
            const hasPoints = await deductChatPoint();
            if (!hasPoints) {
                return;
            }
            
            // Disable send button and show sending state immediately
            sendMessageBtn.disabled = true;
            
            messageInput.value = '';
            
            try {
                await addMessage(message);
                
                // Clear reply if any
                cancelReply();
            } catch (error) {
                logError(error, 'sending message');
                showNotification('Error sending message. Please try again.', 'error');
            } finally {
                // Re-enable send button regardless of outcome
                sendMessageBtn.disabled = false;
                sendMessageBtn.innerHTML = '<i class="fas fa-paper-plane"></i>';
            }
        }
    }

    if (sendMessageBtn) {
        eventManager.addListener(sendMessageBtn, 'click', sendMessage);
    }

    if (messageInput) {
        eventManager.addListener(messageInput, 'keypress', (e) => {
            if (e.key === 'Enter') {
                sendMessage();
            }
        });
    }

    // Typing indicator
    if (messageInput) {
        eventManager.addListener(messageInput, 'input', () => {
            updateTypingStatus(true);
            
            // Reset after 2 seconds of no typing
            clearTimeout(typingTimeout);
            typingTimeout = setTimeout(() => {
                updateTypingStatus(false);
            }, 2000);
        });
    }

    // File attachment - UPDATED to use new image sending function
    if (attachmentBtn) {
        eventManager.addListener(attachmentBtn, 'click', () => {
            // Create a file input for images and videos
            const fileInput = document.createElement('input');
            fileInput.type = 'file';
            fileInput.accept = 'image/*,video/*';
            fileInput.multiple = false;
            
            fileInput.addEventListener('change', async (e) => {
                const file = e.target.files[0];
                if (file) {
                    try {
                        // Show loading state
                        const originalText = attachmentBtn.innerHTML;
                        attachmentBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
                        attachmentBtn.disabled = true;
                        
                        if (file.type.startsWith('image/')) {
                            // Use the new image sending function with immediate display
                            await sendImageMessage(file);
                        } else if (file.type.startsWith('video/')) {
                            // Upload to Cloudinary for videos
                            const fileUrl = await uploadFileToCloudinary(file);
                            await addMessage(null, null, null, null, fileUrl, 0);
                        }
                        
                        // Reset button state
                        attachmentBtn.innerHTML = originalText;
                        attachmentBtn.disabled = false;
                        
                        // Clear reply if any
                        cancelReply();
                    } catch (error) {
                        logError(error, 'uploading file');
                        showNotification('Failed to upload file. Please check your connection and try again.', 'error');
                        
                        // Reset button state on error
                        attachmentBtn.innerHTML = '<i class="fas fa-paperclip"></i>';
                        attachmentBtn.disabled = false;
                    }
                }
            });
            
            fileInput.click();
        });
    }

    // UPDATED: Voice note functionality with faster response
    if (voiceNoteBtn) {
        eventManager.addListener(voiceNoteBtn, 'mousedown', async () => {
            // Show recording UI immediately for faster response
            document.getElementById('voiceNoteIndicator').style.display = 'flex';
            document.getElementById('messageInput').style.display = 'none';
            
            try {
                await startRecording();
            } catch (error) {
                // Hide recording UI if there's an error
                document.getElementById('voiceNoteIndicator').style.display = 'none';
                document.getElementById('messageInput').style.display = 'block';
                showNotification('Could not start recording. Please try again.', 'error');
            }
        });
    }

    if (cancelVoiceNoteBtn) {
        eventManager.addListener(cancelVoiceNoteBtn, 'click', cancelRecording);
    }

    if (sendVoiceNoteBtn) {
        eventManager.addListener(sendVoiceNoteBtn, 'click', sendVoiceNote);
    }

    // Video note functionality
    if (videoNoteBtn) {
        eventManager.addListener(videoNoteBtn, 'click', async () => {
            const hasPermission = await requestCameraPermission();
            if (hasPermission) {
                startVideoRecording();
            } else {
                showNotification('Camera access is required to send video messages. Please enable camera permissions in your browser settings.', 'warning');
            }
        });
    }

    if (cancelVideoRecordingBtn) {
        eventManager.addListener(cancelVideoRecordingBtn, 'click', cancelVideoRecording);
    }

    if (cancelReplyBtn) {
        eventManager.addListener(cancelReplyBtn, 'click', cancelReply);
    }

    if (logoutBtn) {
        eventManager.addListener(logoutBtn, 'click', handleLogout);
    }

    if (dashboardBtn) {
        eventManager.addListener(dashboardBtn, 'click', () => {
            window.location.href = 'dashboard.html';
        });
    }
}

function initMessagesPage() {
    const logoutBtn = document.getElementById('logoutBtn');
    const messageSearch = document.getElementById('messageSearch');
    const dashboardBtn = document.getElementById('dashboardBtn');

    // Show loading message initially
    showMessagesLoadingMessage();

    // Try to load cached message threads first
    const cachedThreads = cache.get(`threads_${currentUser.uid}`);
    if (cachedThreads) {
        renderMessageThreads(cachedThreads);
        hideMessagesLoadingMessage();
    } else {
        // Show loader immediately while we fetch fresh data
        showMessagesLoadingMessage();
    }

    // Always load fresh data in the background
    loadMessageThreads();

    if (messageSearch) {
        eventManager.addListener(messageSearch, 'input', (e) => {
            const searchTerm = e.target.value.toLowerCase();
            const messageCards = document.querySelectorAll('.message-card');
            
            messageCards.forEach(card => {
                const name = card.querySelector('h3').textContent.toLowerCase();
                const message = card.querySelector('p').textContent.toLowerCase();
                
                if (name.includes(searchTerm) || message.includes(searchTerm)) {
                    card.style.display = 'flex';
                } else {
                    card.style.display = 'none';
                }
            });
        });
    }

    if (logoutBtn) {
        eventManager.addListener(logoutBtn, 'click', handleLogout);
    }

    if (dashboardBtn) {
        eventManager.addListener(dashboardBtn, 'click', () => {
            window.location.href = 'dashboard.html';
        });
    }
}

// Data Loading Functions
async function loadUserData(userId) {
    // Try cache first
    const cachedData = cache.get(`user_${userId}`);
    if (cachedData) {
        updateAccountPage(cachedData);
        return cachedData;
    }

    // Fall back to network
    try {
        const userRef = doc(db, 'users', userId);
        const userSnap = await getDoc(userRef);
        
        if (userSnap.exists()) {
            const userData = userSnap.data();
            cache.set(`user_${userId}`, userData, 'long');
            updateAccountPage(userData);
            return userData;
        }
        return null;
    } catch (error) {
        logError(error, 'loading user data');
        return null;
    }
}

function updateAccountPage(userData) {
    if (currentPage !== 'account') return;
    
    document.getElementById('accountName').value = userData.name || '';
    document.getElementById('accountAge').value = userData.age || '';
    document.getElementById('accountGender').value = userData.gender || 'male';
    document.getElementById('accountLocation').value = userData.location || '';
    document.getElementById('accountBio').value = userData.bio || '';
    document.getElementById('accountEmail').value = userData.email || '';
    document.getElementById('accountPhone').value = userData.phone || '';
    
    if (userData.profileImage) {
        document.getElementById('accountProfileImage').src = userData.profileImage;
    }
    
    // Load interests
    const interestsContainer = document.getElementById('accountInterestsContainer');
    interestsContainer.innerHTML = '';
    
    if (userData.interests && userData.interests.length > 0) {
        userData.interests.forEach(interest => {
            const interestTag = document.createElement('span');
            interestTag.className = 'interest-tag';
            interestTag.textContent = interest;
            
            const removeBtn = document.createElement('span');
            removeBtn.innerHTML = ' &times;';
            removeBtn.style.cursor = 'pointer';
            removeBtn.addEventListener('click', () => {
                interestTag.remove();
            });
            
            interestTag.appendChild(removeBtn);
            interestsContainer.appendChild(interestTag);
        });
    }
    
    // Load privacy settings
    if (userData.privacySettings) {
        document.getElementById('showAge').checked = userData.privacySettings.showAge !== false;
        document.getElementById('showLocation').checked = userData.privacySettings.showLocation !== false;
        document.getElementById('showOnlineStatus').checked = userData.privacySettings.showOnlineStatus !== false;
    }
}

async function loadProfiles() {
    // Try cache first
    const cachedProfiles = cache.get('mingle_profiles');
    if (cachedProfiles) {
        profiles = cachedProfiles;
        // Shuffle profiles when loading from cache
        shuffleProfiles();
        if (profiles.length > 0) {
            showProfile(0);
        } else {
            showNoProfilesMessage();
        }
    }

    // Always fetch fresh data in the background
    try {
        // Get all users except current user
        const usersRef = collection(db, 'users');
        const q = query(usersRef, where('__name__', '!=', currentUser.uid));
        const querySnapshot = await getDocs(q);
        
        profiles = [];
        querySnapshot.forEach(doc => {
            profiles.push({ id: doc.id, ...doc.data() });
        });
        
        // Shuffle the profiles array
        shuffleProfiles();
        
        // Cache the profiles
        cache.set('mingle_profiles', profiles, 'short');
        
        if (profiles.length > 0) {
            showProfile(0);
        } else {
            showNoProfilesMessage();
        }
    } catch (error) {
        logError(error, 'loading profiles');
        if (profiles.length === 0) {
            showNoProfilesMessage();
        }
    }
}

// Function to shuffle profiles array
function shuffleProfiles() {
    for (let i = profiles.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [profiles[i], profiles[j]] = [profiles[j], profiles[i]];
    }
}

function showNoProfilesMessage() {
    document.getElementById('currentProfileImage').src = 'images/default-profile.jpg';
    document.getElementById('profileName').textContent = 'No profiles found';
    document.getElementById('profileAgeLocation').textContent = '';
    document.getElementById('profileBio').textContent = 'Check back later for new profiles';
}

function showProfile(index) {
    if (index >= 0 && index < profiles.length) {
        currentProfileIndex = index;
        const profile = profiles[index];
        
        document.getElementById('currentProfileImage').src = profile.profileImage || 'images-default-profile.jpg';
        document.getElementById('profileName').textContent = profile.name || 'Unknown';
        
        let ageLocation = '';
        if (profile.age) ageLocation += `${profile.age} • `;
        if (profile.location) ageLocation += profile.location;
        document.getElementById('profileAgeLocation').textContent = ageLocation;
        
        document.getElementById('profileBio').textContent = profile.bio || 'No bio available';
        document.getElementById('likeCount').textContent = profile.likes || 0;
        
        // Update online status indicator
        updateProfileOnlineStatus(profile.id);
    }
}

function updateProfileOnlineStatus(userId) {
    const statusRef = doc(db, 'status', userId);
    
    onSnapshot(statusRef, (doc) => {
        const status = doc.data()?.state || 'offline';
        const statusIndicator = document.getElementById('profileStatusIndicator');
        
        if (statusIndicator) {
            statusIndicator.className = `online-status ${status}`;
        }
    });
}

function showNextProfile() {
    if (currentProfileIndex < profiles.length - 1) {
        showProfile(currentProfileIndex + 1);
    } else {
        // Reached end of profiles
        showNoProfilesMessage();
    }
}

async function loadProfileData(profileId) {
    // Try cache first
    const cachedProfile = cache.get(`profile_${profileId}`);
    if (cachedProfile) {
        displayProfileData(cachedProfile);
    }

    // Always fetch fresh data
    try {
        const profileRef = doc(db, 'users', profileId);
        const profileSnap = await getDoc(profileRef);
        
        if (profileSnap.exists()) {
            const profileData = profileSnap.data();
            // Cache the profile data
            cache.set(`profile_${profileId}`, profileData, 'medium');
            displayProfileData(profileData);
            
            // Check if already liked
            const likedRef = collection(db, 'users', currentUser.uid, 'liked');
            const likedQuery = query(likedRef, where('userId', '==', profileId));
            const likedSnap = await getDocs(likedQuery);
            
            if (!likedSnap.empty) {
                document.getElementById('likeProfileBtn').innerHTML = '<i class="fas fa-heart"></i> Liked';
                document.getElementById('likeProfileBtn').classList.add('liked');
            }
            
            // Set up online status listener
            setupOnlineStatusListener(profileId);
        } else {
            window.location.href = 'mingle.html';
        }
    } catch (error) {
        logError(error, 'loading profile data');
        window.location.href = 'mingle.html';
    }
}

function displayProfileData(profileData) {
    document.getElementById('mainProfileImage').src = profileData.profileImage || 'images-default-profile.jpg';
    document.querySelectorAll('.thumbnail')[0].src = profileData.profileImage || 'images-default-profile.jpg';
    document.getElementById('viewProfileName').textContent = profileData.name || 'Unknown';
    
    let ageText = '';
    if (profileData.age) ageText = `${profileData.age}`;
    document.getElementById('viewProfileAge').textContent = ageText;
    
    if (profileData.location) {
        document.getElementById('viewProfileLocation').textContent = profileData.location;
    } else {
        document.getElementById('viewProfileLocation').textContent = '';
    }
    
    document.getElementById('viewProfileBio').textContent = profileData.bio || 'No bio available';
    document.getElementById('viewLikeCount').textContent = profileData.likes || 0;
    
    // Load interests
    const interestsContainer = document.getElementById('interestsContainer');
    interestsContainer.innerHTML = '';
    
    if (profileData.interests && profileData.interests.length > 0) {
        profileData.interests.forEach(interest => {
            const interestTag = document.createElement('span');
            interestTag.className = 'interest-tag';
            interestTag.textContent = interest;
            interestsContainer.appendChild(interestTag);
        });
    }
    
    // Add online status indicator to profile image
    const profileImageContainer = document.querySelector('.profile-image-container');
    if (profileImageContainer) {
        // Remove existing status indicator if any
        const existingIndicator = profileImageContainer.querySelector('.online-status');
        if (existingIndicator) {
            existingIndicator.remove();
        }
        
        const statusIndicator = document.createElement('div');
        statusIndicator.id = 'profileStatusIndicator';
        statusIndicator.className = 'online-status';
        profileImageContainer.appendChild(statusIndicator);
        
        // Set up online status listener
        setupOnlineStatusListener(profileData.id, 'profileStatusIndicator');
    }
}

async function loadChatPartnerData(partnerId) {
    try {
        const partnerRef = doc(db, 'users', partnerId);
        const partnerSnap = await getDoc(partnerRef);
        
        if (partnerSnap.exists()) {
            const partnerData = partnerSnap.data();
            // Cache the partner data
            cache.set(`partner_${partnerId}`, partnerData, 'medium');
            displayChatPartnerData(partnerData);
            
            // Set up online status listener
            setupOnlineStatusListener(partnerId, 'chatPartnerStatus');
        }
    } catch (error) {
        logError(error, 'loading chat partner data');
    }
}

function displayChatPartnerData(partnerData) {
    document.getElementById('chatPartnerImage').src = partnerData.profileImage || 'images-default-profile.jpg';
    document.getElementById('chatPartnerName').textContent = partnerData.name || 'Unknown';
}

// FIXED: Setup online status listener with proper disconnect handling
function setupOnlineStatusListener(userId, elementId = 'onlineStatus') {
    try {
        const statusRef = doc(db, 'status', userId);
        
        onSnapshot(statusRef, (doc) => {
            const statusData = doc.data();
            const status = statusData?.state || 'offline';
            const element = document.getElementById(elementId);
            
            if (element) {
                if (status === 'online') {
                    element.innerHTML = '<i class="fas fa-circle"></i>';
                    element.style.color = 'var(--accent-color)';
                    element.title = 'Online';
                } else {
                    element.innerHTML = '<i class="far fa-circle"></i>';
                    element.style.color = 'var(--text-light)';
                    // Show last seen time if available
                    if (statusData?.lastSeen) {
                        const lastSeen = statusData.lastSeen.toDate ? 
                            statusData.lastSeen.toDate() : 
                            new Date(statusData.lastSeen);
                        element.title = `Last seen ${formatTime(lastSeen)}`;
                    } else {
                        element.title = 'Offline';
                    }
                }
            }
        });
    } catch (error) {
        logError(error, 'setting up online status listener');
    }
}

async function markMessageAsRead(messageRef) {
    try {
        await updateDoc(messageRef, {
            read: true
        });
    } catch (error) {
        logError(error, 'marking message as read');
    }
}

// FIXED: Load message threads with proper unread count handling
async function loadMessageThreads() {
    const messagesList = document.getElementById('messagesList');
    
    try {
        // Get all conversations where user is a participant
        const threadsQuery = query(
            collection(db, 'conversations'),
            where('participants', 'array-contains', currentUser.uid)
        );
        
        unsubscribeMessages = onSnapshot(threadsQuery, async (snapshot) => {
            const threads = [];
            
            // First collect all thread data
            snapshot.forEach(doc => {
                threads.push({ id: doc.id, ...doc.data() });
            });
            
            // Sort threads client-side by lastMessageTime
            threads.sort((a, b) => {
                const timeA = a.lastMessage?.timestamp?.toMillis ? a.lastMessage.timestamp.toMillis() : (new Date(a.lastMessage?.timestamp)).getTime();
                const timeB = b.lastMessage?.timestamp?.toMillis ? b.lastMessage.timestamp.toMillis() : (new Date(b.lastMessage?.timestamp)).getTime();
                return (timeB || 0) - (timeA || 0);
            });
            
            // Now load partner data and unread counts
            const threadsWithData = [];
            let totalUnread = 0;
            
            for (const thread of threads) {
                const partnerId = thread.participants.find(id => id !== currentUser.uid);
                if (!partnerId) continue;
                
                try {
                    // Get partner profile
                    const partnerRef = doc(db, 'users', partnerId);
                    const partnerSnap = await getDoc(partnerRef);
                    
                    if (!partnerSnap.exists()) continue;
                    
                    // Get unread count
                    let unreadCount = 0;
                    try {
                        const messagesQuery = query(
                            collection(db, 'conversations', thread.id, 'messages'),
                            where('senderId', '==', partnerId),
                            where('read', '==', false)
                        );
                        const messagesSnap = await getDocs(messagesQuery);
                        unreadCount = messagesSnap.size;
                    } catch (error) {
                        logError(error, 'getting unread count');
                    }
                    
                    totalUnread += unreadCount;
                    
                    threadsWithData.push({
                        ...thread,
                        partnerData: partnerSnap.data(),
                        unreadCount
                    });
                } catch (error) {
                    logError(error, 'loading thread data');
                }
            }
            
            // Cache the threads
            cache.set(`threads_${currentUser.uid}`, threadsWithData, 'short');
            
            // Render all threads
            renderMessageThreads(threadsWithData);
            updateMessageCount(totalUnread);
            hideMessagesLoadingMessage();
        });
    } catch (error) {
        logError(error, 'loading message threads');
        messagesList.innerHTML = '<p class="no-messages">Error loading messages. Please refresh the page.</p>';
        hideMessagesLoadingMessage();
    }
}

function renderMessageThreads(threads) {
    const messagesList = document.getElementById('messagesList');
    messagesList.innerHTML = '';
    
    if (threads.length === 0) {
        messagesList.innerHTML = '<p class="no-messages">No messages yet. Start mingling!</p>';
        return;
    }
    
    threads.forEach(thread => {
        const messageCard = document.createElement('div');
        messageCard.className = 'message-card';
        
        // Truncate message preview to 3 words
        let messagePreview = thread.lastMessage?.text || 'New match';
        if (messagePreview.split(' ').length > 3) {
            messagePreview = messagePreview.split(' ').slice(0, 3).join(' ') + '...';
        }
        
        const messageTime = thread.lastMessage?.timestamp 
            ? formatTime(thread.lastMessage.timestamp)
            : '';
        
        messageCard.innerHTML = `
            <img src="${thread.partnerData.profileImage || 'images-default-profile.jpg'}" 
                 alt="${thread.partnerData.name}">
            <div class="message-content">
                <h3>${thread.partnerData.name || 'Unknown'} 
                    <span class="message-time">${messageTime}</span>
                </h3>
                <p>${messagePreview}</p>
            </div>
            ${thread.unreadCount > 0 ? `<span class="unread-count">${thread.unreadCount}</span>` : ''}
            <div class="online-status" id="status-${thread.participants.find(id => id !== currentUser.uid)}">
                <i class="fas fa-circle"></i>
            </div>
        `;
        
        messageCard.addEventListener('click', () => {
            window.location.href = `chat.html?id=${
                thread.participants.find(id => id !== currentUser.uid)
            }`;
        });
        
        messagesList.appendChild(messageCard);
        
        // Set up online status listener for each thread
        const partnerId = thread.participants.find(id => id !== currentUser.uid);
        if (partnerId) {
            setupOnlineStatusListener(partnerId, `status-${partnerId}`);
        }
    });
}

function setupTypingIndicator() {
    try {
        const threadId = [currentUser.uid, chatPartnerId].sort().join('_');
        const typingRef = doc(db, 'typing', threadId);
        
        // Listen for partner's typing status
        onSnapshot(typingRef, (doc) => {
            const typingData = doc.data();
            const typingIndicator = document.getElementById('typingIndicator');
            
            if (typingData && typingData[chatPartnerId]) {
                document.getElementById('partnerNameTyping').textContent = 
                    document.getElementById('chatPartnerName').textContent;
                typingIndicator.style.display = 'block';
            } else {
                typingIndicator.style.display = 'none';
            }
        });
    } catch (error) {
        logError(error, 'setting up typing indicator');
    }
}

async function updateTypingStatus(isTyping) {
    try {
        const threadId = [currentUser.uid, chatPartnerId].sort().join('_');
        const typingRef = doc(db, 'typing', threadId);
        
        await setDoc(typingRef, {
            [currentUser.uid]: isTyping
        }, { merge: true });
    } catch (error) {
        logError(error, 'updating typing status');
    }
}

// FIXED: Clean up listeners when leaving page
window.addEventListener('beforeunload', () => {
    try {
        // Clean up messages page listener
        if (unsubscribeMessages) {
            unsubscribeMessages();
            unsubscribeMessages = null;
        }
        
        // Clean up chat page
        cleanupChatPage();
        
        // Clean up global message listener
        if (globalMessageListener) {
            globalMessageListener();
            globalMessageListener = null;
        }
        
        // Clear all event listeners
        eventManager.clearAll();
        
        // Set user as offline when leaving - ONLY if user exists and is authenticated
        if (currentUser && currentUser.uid && auth.currentUser) {
            const userStatusRef = doc(db, 'status', currentUser.uid);
            setDoc(userStatusRef, {
                state: 'offline',
                lastChanged: serverTimestamp(),
                lastSeen: serverTimestamp()
            }).catch(error => {
                console.error('Error setting offline status:', error);
            });
        }
    } catch (error) {
        logError(error, 'beforeunload cleanup');
    }
});