// notifications.js - FIXED OneSignal notification service
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { 
    getFirestore, 
    doc, 
    getDoc,
    onSnapshot,
    collection,
    query,
    where,
    getDocs
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { 
    getAuth, 
    onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

class OneSignalNotificationService {
    constructor() {
        // ⚠️ REPLACE THIS WITH YOUR REAL ONESIGNAL APP ID!
        this.oneSignalAppId = "3129a6d2-f764-4d6b-bcd1-abd0260bc839"; 
        this.isInitialized = false;
        this.currentUser = null;
        this.oneSignalInitialized = false;
        this.firebaseConfig = {
            apiKey: "AIzaSyC9uL_BX14Z6rRpgG4MT9Tca1opJl8EviQ",
            authDomain: "dating-connect.firebaseapp.com",
            projectId: "dating-connect",
            storageBucket: "dating-connect.appspot.com",
            messagingSenderId: "1062172180210",
            appId: "1:1062172180210:web:0c9b3c1578a5dbae58da6b"
        };
        this.listeners = [];
        
        console.log('🚀 Starting OneSignal Notification Service...');
        this.init();
    }

    async init() {
        try {
            // 1. First load OneSignal SDK
            await this.loadOneSignalSDK();
            
            // 2. Wait a bit for SDK to load completely
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // 3. Initialize Firebase
            this.app = initializeApp(this.firebaseConfig, 'OneSignalNotificationService');
            this.db = getFirestore(this.app);
            this.auth = getAuth(this.app);
            
            // 4. Wait for auth state
            onAuthStateChanged(this.auth, (user) => {
                this.currentUser = user;
                if (user) {
                    console.log('✅ User logged in:', user.email);
                    this.initializeOneSignal();
                } else {
                    console.log('❌ User logged out');
                    this.cleanupListeners();
                }
            });
            
        } catch (error) {
            console.error('❌ Failed to initialize notification service:', error);
        }
    }

    loadOneSignalSDK() {
        return new Promise((resolve, reject) => {
            if (window.OneSignal) {
                console.log('✅ OneSignal SDK already loaded');
                resolve();
                return;
            }

            const script = document.createElement('script');
            script.src = "https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js";
            script.async = true; // Changed from defer to async
            script.onload = () => {
                console.log('✅ OneSignal SDK loaded successfully');
                resolve();
            };
            script.onerror = (error) => {
                console.error('❌ Failed to load OneSignal SDK:', error);
                reject(error);
            };
            document.head.appendChild(script);
        });
    }

    initializeOneSignal() {
        if (!window.OneSignal) {
            console.error('❌ OneSignal SDK not loaded - waiting...');
            setTimeout(() => this.initializeOneSignal(), 1000);
            return;
        }

        console.log('🔄 Initializing OneSignal...');
        
        // Use the correct OneSignal initialization method
        window.OneSignal.init({
            appId: this.oneSignalAppId,
            allowLocalhostAsSecureOrigin: true,
            
            // Simpler prompt options
            promptOptions: {
                slidedown: {
                    enabled: true,
                    autoPrompt: true,
                    timeDelay: 1, // Faster prompt
                    pageViews: 1,
                }
            },
            
            notifyButton: {
                enable: false,
            },
        }).then(() => {
            console.log('✅ OneSignal initialization complete');
            
            // Set external user ID
            if (this.currentUser) {
                window.OneSignal.setExternalUserId(this.currentUser.uid)
                    .then(() => console.log('✅ External user ID set'))
                    .catch(err => console.error('❌ Failed to set external user ID:', err));
            }
            
            // Check if push is enabled
            window.OneSignal.isPushNotificationsEnabled((isEnabled) => {
                console.log('📢 Push notifications enabled:', isEnabled);
                this.oneSignalInitialized = true;
                this.isInitialized = true;
                
                // Now setup Firebase listeners
                this.setupFirebaseListeners();
                
                // Auto-test after initialization
                setTimeout(() => {
                    this.testNotification();
                }, 3000);
            });
            
        }).catch(error => {
            console.error('❌ OneSignal initialization failed:', error);
        });
    }

    setupFirebaseListeners() {
        if (!this.currentUser) {
            console.log('❌ No user logged in, skipping Firebase listeners');
            return;
        }

        console.log('🔄 Setting up Firebase listeners for user:', this.currentUser.uid);
        this.setupConversationListeners();
    }

    setupConversationListeners() {
        const conversationsQuery = query(
            collection(this.db, 'conversations'),
            where('participants', 'array-contains', this.currentUser.uid)
        );

        const conversationListener = onSnapshot(conversationsQuery, (snapshot) => {
            snapshot.docChanges().forEach((change) => {
                if (change.type === 'added') {
                    console.log('💬 New conversation detected');
                    this.handleNewConversation(change.doc.data(), change.doc.id);
                }
            });
        });

        this.listeners.push(conversationListener);
        this.setupMessageListenersForAllConversations();
    }

    async setupMessageListenersForAllConversations() {
        try {
            const conversationsQuery = query(
                collection(this.db, 'conversations'),
                where('participants', 'array-contains', this.currentUser.uid)
            );

            const conversationsSnap = await getDocs(conversationsQuery);
            console.log(`📁 Found ${conversationsSnap.size} conversations`);
            
            conversationsSnap.forEach((conversationDoc) => {
                const conversation = conversationDoc.data();
                this.listenToConversationMessages(conversationDoc.id, conversation);
            });
            
        } catch (error) {
            console.error('❌ Error setting up message listeners:', error);
        }
    }

    listenToConversationMessages(conversationId, conversation) {
        const messagesQuery = query(
            collection(this.db, 'conversations', conversationId, 'messages'),
            where('senderId', '!=', this.currentUser.uid)
        );

        const messageListener = onSnapshot(messagesQuery, (snapshot) => {
            snapshot.docChanges().forEach((change) => {
                if (change.type === 'added') {
                    console.log('✉️ New message detected');
                    this.handleNewMessage(change.doc.data(), conversation);
                }
            });
        });

        this.listeners.push(messageListener);
    }

    async handleNewMessage(message, conversation) {
        if (message.senderId === this.currentUser.uid || message.read) {
            return;
        }

        try {
            console.log('🔄 Processing new message notification...');
            
            const senderDoc = await getDoc(doc(this.db, 'users', message.senderId));
            if (!senderDoc.exists()) return;

            const senderData = senderDoc.data();
            
            // Send notification
            this.sendOneSignalNotification(
                `New message from ${senderData.name || 'Someone'}`,
                this.formatMessagePreview(message),
                message.senderId
            );
            
        } catch (error) {
            console.error('❌ Error handling new message:', error);
        }
    }

    async handleNewConversation(conversation, conversationId) {
        const partnerId = conversation.participants.find(id => id !== this.currentUser.uid);
        if (!partnerId) return;

        try {
            const partnerDoc = await getDoc(doc(this.db, 'users', partnerId));
            if (!partnerDoc.exists()) return;

            const partnerData = partnerDoc.data();

            this.sendOneSignalNotification(
                'New Match! 🎉',
                `You matched with ${partnerData.name || 'Someone'}`,
                partnerId
            );
            
        } catch (error) {
            console.error('❌ Error handling new conversation:', error);
        }
    }

    sendOneSignalNotification(title, message, targetUserId) {
        if (!this.isOneSignalReady()) {
            console.log('❌ OneSignal not ready, queuing notification...');
            // Retry after 2 seconds
            setTimeout(() => this.sendOneSignalNotification(title, message, targetUserId), 2000);
            return;
        }

        try {
            console.log('📤 Sending notification:', title);
            
            // Use the correct method for sending notifications
            window.OneSignal.sendSelfNotification({
                title: title,
                message: message,
                url: `chat.html?id=${targetUserId}`,
                icon: 'https://yourdomain.com/icons/icon-192x192.png'
            });
            
            console.log('✅ Notification sent successfully');
            
        } catch (error) {
            console.error('❌ Error sending notification:', error);
        }
    }

    formatMessagePreview(message) {
        if (message.text) {
            return message.text.length > 100 ? message.text.substring(0, 100) + '...' : message.text;
        } else if (message.imageUrl) {
            return '📷 Sent a photo';
        } else if (message.audioUrl) {
            return '🎤 Sent a voice message';
        } else if (message.videoUrl) {
            return '🎥 Sent a video';
        } else {
            return 'Sent a message';
        }
    }

    isOneSignalReady() {
        return window.OneSignal && this.oneSignalInitialized;
    }

    // TEST FUNCTION - Call this to test notifications
    async testNotification() {
        console.log('🧪 Testing notification...');
        
        if (this.isOneSignalReady()) {
            console.log('✅ OneSignal is ready, sending test notification...');
            
            window.OneSignal.sendSelfNotification({
                title: "Test Notification 🔔",
                message: "This is a test notification from Dating Connect!",
                url: "mingle.html",
                icon: "https://yourdomain.com/icons/icon-192x192.png"
            });
            
            console.log('✅ Test notification sent successfully!');
        } else {
            console.log('❌ OneSignal not ready yet. Current status:', {
                windowOneSignal: !!window.OneSignal,
                oneSignalInitialized: this.oneSignalInitialized,
                isInitialized: this.isInitialized
            });
            
            // Retry test in 2 seconds
            setTimeout(() => this.testNotification(), 2000);
        }
    }

    // Check if user has granted notification permission
    async getNotificationPermission() {
        if (!window.OneSignal) return 'OneSignal not loaded';
        
        return new Promise((resolve) => {
            window.OneSignal.getNotificationPermission(resolve);
        });
    }

    cleanupListeners() {
        this.listeners.forEach(unsubscribe => {
            if (unsubscribe && typeof unsubscribe === 'function') {
                unsubscribe();
            }
        });
        this.listeners = [];
        this.oneSignalInitialized = false;
        this.isInitialized = false;
    }
}

// Auto-initialize
const notificationService = new OneSignalNotificationService();

// Make it globally available for testing
window.notificationService = notificationService;

// Auto-test after 15 seconds (gives time for initialization)
setTimeout(() => {
    console.log('⏰ Running auto-test...');
    if (window.notificationService) {
        window.notificationService.testNotification();
    }
}, 15000);