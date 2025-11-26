// notifications.js - Complete working OneSignal notification service
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
        // REPLACE THIS WITH YOUR ACTUAL ONESIGNAL APP ID
        this.oneSignalAppId = "3129a6d2-f764-4d6b-bcd1-abd0260bc839"; // ← REPLACE THIS!
        this.isInitialized = false;
        this.currentUser = null;
        this.firebaseConfig = {
            apiKey: "AIzaSyC9uL_BX14Z6rRpgG4MT9Tca1opJl8EviQ",
            authDomain: "dating-connect.firebaseapp.com",
            projectId: "dating-connect",
            storageBucket: "dating-connect.appspot.com",
            messagingSenderId: "1062172180210",
            appId: "1:1062172180210:web:0c9b3c1578a5dbae58da6b"
        };
        this.listeners = [];
        
        this.init();
    }

    async init() {
        try {
            console.log('🚀 Starting OneSignal notification service...');
            
            // Initialize Firebase
            this.app = initializeApp(this.firebaseConfig, 'OneSignalNotificationService');
            this.db = getFirestore(this.app);
            this.auth = getAuth(this.app);
            
            // Load OneSignal SDK
            await this.loadOneSignalSDK();
            
            // Wait for auth state
            onAuthStateChanged(this.auth, (user) => {
                this.currentUser = user;
                if (user) {
                    console.log('✅ User logged in:', user.email);
                    this.initializeOneSignal();
                    setTimeout(() => this.setupFirebaseListeners(), 2000);
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
            script.defer = true;
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
            console.error('❌ OneSignal SDK not loaded');
            return;
        }

        console.log('🔄 Initializing OneSignal...');
        
        window.OneSignal = window.OneSignal || [];
        
        window.OneSignal.push(function() {
            window.OneSignal.init({
                appId: this.oneSignalAppId,
                
                // Important settings
                allowLocalhostAsSecureOrigin: true,
                autoRegister: true,
                autoResubscribe: true,
                
                // Notification prompt
                promptOptions: {
                    slidedown: {
                        enabled: true,
                        autoPrompt: true,
                        timeDelay: 3,
                        pageViews: 1,
                        actionMessage: "Get notified about new messages and matches!",
                        acceptButtonText: "ALLOW",
                        cancelButtonText: "NO THANKS"
                    }
                },
                
                welcomeNotification: {
                    title: "Welcome to Dating Connect!",
                    message: "You'll get notifications for new messages even when offline"
                },
                
                notifyButton: {
                    enable: false,
                },
            });

            // Set external user ID
            if (this.currentUser) {
                window.OneSignal.setExternalUserId(this.currentUser.uid)
                    .then(() => console.log('✅ External user ID set:', this.currentUser.uid))
                    .catch(err => console.error('❌ Failed to set external user ID:', err));
            }

            // Check subscription status
            window.OneSignal.isPushNotificationsEnabled((isEnabled) => {
                if (isEnabled) {
                    console.log('✅ Push notifications are enabled');
                    this.isInitialized = true;
                } else {
                    console.log('❌ Push notifications are not enabled');
                }
            });

            console.log('✅ OneSignal initialized successfully');
            
        }.bind(this));
    }

    setupFirebaseListeners() {
        console.log('🔄 Setting up Firebase listeners...');
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
            
            // Send notification using OneSignal API
            await this.sendOneSignalNotification(
                senderData.name || 'Someone',
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

            await this.sendOneSignalNotification(
                'New Match! 🎉',
                `You matched with ${partnerData.name || 'Someone'}`,
                partnerId
            );
            
        } catch (error) {
            console.error('❌ Error handling new conversation:', error);
        }
    }

    async sendOneSignalNotification(title, message, targetUserId) {
        if (!this.isOneSignalInitialized()) {
            console.log('❌ OneSignal not initialized, cannot send notification');
            return;
        }

        try {
            console.log('📤 Sending OneSignal notification...', { title, message });
            
            // Method 1: Send to specific user by external user ID
            window.OneSignal.sendSelfNotification(title, message, null, { 
                url: `chat.html?id=${targetUserId}` 
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

    isOneSignalInitialized() {
        return window.OneSignal && this.isInitialized;
    }

    // TEST FUNCTION - Call this to test notifications
    async testNotification() {
        console.log('🧪 Testing notification...');
        
        if (this.isOneSignalInitialized()) {
            window.OneSignal.sendSelfNotification(
                "Test Notification 🔔",
                "This is a test notification from Dating Connect!",
                null,
                { url: 'mingle.html' }
            );
            console.log('✅ Test notification sent');
        } else {
            console.log('❌ OneSignal not ready for testing');
        }
    }

    // Check subscription status
    async checkSubscriptionStatus() {
        if (!window.OneSignal) return 'OneSignal not loaded';
        
        return new Promise((resolve) => {
            window.OneSignal.isPushNotificationsEnabled((isEnabled) => {
                resolve(isEnabled ? 'Subscribed' : 'Not subscribed');
            });
        });
    }

    cleanupListeners() {
        this.listeners.forEach(unsubscribe => {
            if (unsubscribe && typeof unsubscribe === 'function') {
                unsubscribe();
            }
        });
        this.listeners = [];
        this.isInitialized = false;
    }
}

// Auto-initialize
console.log('🚀 Starting OneSignal Notification Service...');
const notificationService = new OneSignalNotificationService();

// Make it globally available for testing
window.notificationService = notificationService;

// Auto-test after 10 seconds
setTimeout(() => {
    console.log('⏰ Running auto-test...');
    if (window.notificationService) {
        window.notificationService.testNotification();
    }
}, 10000);