// messages.js - Independent Message Notification System
// Load this file BEFORE any other scripts in your HTML

(function() {
    // Firebase configuration
    const firebaseConfig = {
        apiKey: "AIzaSyC9uL_BX14Z6rRpgG4MT9Tca1opJl8EviQ",
        authDomain: "dating-connect.firebaseapp.com",
        projectId: "dating-connect",
        storageBucket: "dating-connect.appspot.com",
        messagingSenderId: "1062172180210",
        appId: "1:1062172180210:web:0c9b3c1578a5dbae58da6b"
    };

    // Global variables for message system
    let currentUser = null;
    let db = null;
    let unsubscribeNewMessages = null;
    let notificationTimer = null;
    let unreadMessages = new Map();
    let dismissedNotifications = new Set();

    // Load Firebase scripts dynamically
    function loadFirebaseDependencies() {
        return new Promise((resolve) => {
            // Check if Firebase is already loaded
            if (typeof firebase !== 'undefined' && firebase.apps && firebase.apps.length > 0) {
                resolve();
                return;
            }

            // Load Firebase App
            const firebaseAppScript = document.createElement('script');
            firebaseAppScript.src = 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js';
            document.head.appendChild(firebaseAppScript);

            firebaseAppScript.onload = function() {
                // Load Firebase Auth
                const firebaseAuthScript = document.createElement('script');
                firebaseAuthScript.src = 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth-compat.js';
                document.head.appendChild(firebaseAuthScript);

                firebaseAuthScript.onload = function() {
                    // Load Firebase Firestore
                    const firebaseFirestoreScript = document.createElement('script');
                    firebaseFirestoreScript.src = 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore-compat.js';
                    document.head.appendChild(firebaseFirestoreScript);

                    firebaseFirestoreScript.onload = function() {
                        // Initialize Firebase
                        firebase.initializeApp(firebaseConfig);
                        db = firebase.firestore();
                        resolve();
                    };
                };
            };
        });
    }

    // Initialize the message notification system
    function initMessageSystem() {
        loadFirebaseDependencies().then(() => {
            const auth = firebase.auth();
            
            // Load dismissed notifications from localStorage
            loadDismissedNotifications();
            
            // Listen for auth state changes
            auth.onAuthStateChanged((user) => {
                if (user) {
                    currentUser = user;
                    startMessageListener(user);
                } else {
                    currentUser = null;
                    stopMessageListener();
                    clearNotificationTimer();
                    // Clear all notifications
                    clearAllNotifications();
                }
            });
        });
    }

    // Load dismissed notifications from localStorage
    function loadDismissedNotifications() {
        try {
            const stored = localStorage.getItem('dismissedNotifications');
            if (stored) {
                const dismissed = JSON.parse(stored);
                dismissed.forEach(id => dismissedNotifications.add(id));
            }
        } catch (error) {
            // Error handling without console output
        }
    }

    // Save dismissed notifications to localStorage
    function saveDismissedNotifications() {
        try {
            localStorage.setItem('dismissedNotifications', JSON.stringify(Array.from(dismissedNotifications)));
        } catch (error) {
            // Error handling without console output
        }
    }

    // Start listening for new messages
    function startMessageListener(user) {
        if (!user || !db) return;
        
        // Query for conversations where the current user is a participant
        const conversationsQuery = db.collection('conversations')
            .where('participants', 'array-contains', user.uid);
        
        unsubscribeNewMessages = conversationsQuery.onSnapshot(async (snapshot) => {
            for (const change of snapshot.docChanges()) {
                if (change.type === 'modified' || change.type === 'added') {
                    try {
                        const conversation = change.doc.data();
                        const conversationId = change.doc.id;
                        const lastMessage = conversation.lastMessage;
                        
                        // Check if this is a new message from another user
                        if (lastMessage && lastMessage.senderId !== user.uid) {
                            const partnerId = conversation.participants.find(id => id !== user.uid);
                            
                            // Skip if this notification was already dismissed
                            if (dismissedNotifications.has(`${partnerId}_${lastMessage.timestamp}`)) {
                                continue;
                            }
                            
                            // Check if user is on a different page (not the chat page with this user)
                            const urlParams = new URLSearchParams(window.location.search);
                            const currentChatId = urlParams.get('id');
                            const currentPage = window.location.pathname.split('/').pop().split('.')[0];
                            
                            if (currentPage !== 'chat' || currentChatId !== partnerId) {
                                // Store message with timestamp and conversation ID
                                unreadMessages.set(partnerId, {
                                    timestamp: new Date(),
                                    message: lastMessage,
                                    conversationId: conversationId,
                                    messageTimestamp: lastMessage.timestamp
                                });
                                
                                // Get partner info for notification
                                try {
                                    const partnerDoc = await db.collection('users').doc(partnerId).get();
                                    
                                    if (partnerDoc.exists) {
                                        const partnerData = partnerDoc.data();
                                        
                                        // Show notification if not already dismissed
                                        if (!dismissedNotifications.has(`${partnerId}_${lastMessage.timestamp}`)) {
                                            showMessageNotification(partnerData, lastMessage, partnerId, conversationId, lastMessage.timestamp);
                                        }
                                    }
                                } catch (error) {
                                    // Error handling without console output
                                }
                            }
                        }
                    } catch (error) {
                        // Error handling without console output
                    }
                }
            }
        }, (error) => {
            // Error handling without console output
        });
    }

    // Stop listening for new messages
    function stopMessageListener() {
        if (unsubscribeNewMessages) {
            unsubscribeNewMessages();
            unsubscribeNewMessages = null;
        }
    }

    // Mark a conversation as read in Firebase
    async function markConversationAsRead(conversationId, userId, messageTimestamp) {
        if (!db) return false;
        
        try {
            // Get all messages from this conversation
            const messagesRef = db.collection('conversations').doc(conversationId).collection('messages');
            const messagesSnapshot = await messagesRef.get();
            
            // Mark all unread messages from partner as read
            const batch = db.batch();
            let markedCount = 0;
            
            messagesSnapshot.forEach(doc => {
                const message = doc.data();
                // Mark messages from partner that are unread
                if (message.senderId !== userId && !message.read) {
                    batch.update(doc.ref, { read: true });
                    markedCount++;
                }
            });
            
            if (markedCount > 0) {
                await batch.commit();
            }
            
            // Add to dismissed notifications with message timestamp
            if (messageTimestamp) {
                const partnerId = conversationId.split('_').find(id => id !== userId);
                dismissedNotifications.add(`${partnerId}_${messageTimestamp}`);
                saveDismissedNotifications();
            }
            
            return true;
        } catch (error) {
            return false;
        }
    }

    // Show message notification
    function showMessageNotification(partnerData, message, partnerId, conversationId, messageTimestamp) {
        // Create notification element if it doesn't exist
        let notification = document.querySelector(`.message-notification[data-partner-id="${partnerId}"]`);
        
        if (!notification) {
            notification = document.createElement('div');
            notification.className = 'message-notification';
            notification.dataset.partnerId = partnerId;
            notification.dataset.conversationId = conversationId;
            notification.dataset.messageTimestamp = messageTimestamp;
            
            // Determine message preview text
            let messageText = '';
            if (message.text) {
                messageText = message.text.length > 50 
                    ? message.text.substring(0, 50) + '...' 
                    : message.text;
            } else if (message.imageUrl) {
                messageText = 'Sent an image';
            } else if (message.audioUrl) {
                messageText = 'Sent a voice message';
            } else {
                messageText = 'Sent a message';
            }
            
            notification.innerHTML = `
                <div class="notification-content">
                    <img src="${partnerData.profileImage || 'images-default-profile.jpg'}" 
                         alt="${partnerData.name}" class="notification-avatar">
                    <div class="notification-details">
                        <h4>${partnerData.name || 'Unknown'}</h4>
                        <p>${messageText}</p>
                    </div>
                    <button class="notification-close">&times;</button>
                </div>
                <div class="notification-actions">
                    <button class="notification-action view-chat">View Chat</button>
                    <button class="notification-action mark-read">Mark as Read</button>
                </div>
            `;
            
            // Add styles if not already added
            addNotificationStyles();
            
            // Add to page
            document.body.appendChild(notification);
            
            // Set up event listeners
            notification.querySelector('.notification-close').addEventListener('click', () => {
                dismissNotification(notification, partnerId);
            });
            
            notification.querySelector('.view-chat').addEventListener('click', () => {
                window.location.href = `chat.html?id=${partnerId}`;
                dismissNotification(notification, partnerId);
            });
            
            notification.querySelector('.mark-read').addEventListener('click', async () => {
                const success = await markConversationAsRead(conversationId, currentUser.uid, messageTimestamp);
                if (success) {
                    dismissNotification(notification, partnerId, true, messageTimestamp);
                } else {
                    alert('Failed to mark message as read. Please try again.');
                }
            });
        }
        
        // Show notification with animation
        setTimeout(() => {
            notification.classList.add('show');
        }, 100);
        
        // Set timer to show notification again in 2 minutes if not dismissed
        if (!notificationTimer) {
            startNotificationTimer();
        }
    }

    // Dismiss notification
    function dismissNotification(notification, partnerId, markAsRead = false, messageTimestamp = null) {
        notification.classList.remove('show');
        
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
        
        if (markAsRead && messageTimestamp) {
            dismissedNotifications.add(`${partnerId}_${messageTimestamp}`);
            saveDismissedNotifications();
            // Remove from unread messages map
            unreadMessages.delete(partnerId);
        }
    }

    // Start notification timer (shows notifications every 2 minutes)
    function startNotificationTimer() {
        notificationTimer = setInterval(() => {
            // Re-show notifications for unread messages that weren't dismissed
            unreadMessages.forEach(async (messageData, partnerId) => {
                // Only show if message is older than 2 minutes and not dismissed
                const messageTime = messageData.timestamp;
                const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);
                
                if (messageTime < twoMinutesAgo && !dismissedNotifications.has(`${partnerId}_${messageData.messageTimestamp}`)) {
                    try {
                        const partnerDoc = await db.collection('users').doc(partnerId).get();
                        
                        if (partnerDoc.exists) {
                            const partnerData = partnerDoc.data();
                            showMessageNotification(partnerData, messageData.message, partnerId, messageData.conversationId, messageData.messageTimestamp);
                        }
                    } catch (error) {
                        // Error handling without console output
                    }
                }
            });
        }, 2 * 60 * 1000); // Check every 2 minutes
    }

    // Clear notification timer
    function clearNotificationTimer() {
        if (notificationTimer) {
            clearInterval(notificationTimer);
            notificationTimer = null;
        }
    }

    // Add notification styles to the page
    function addNotificationStyles() {
        if (document.getElementById('message-notification-styles')) return;
        
        const styles = document.createElement('style');
        styles.id = 'message-notification-styles';
        styles.textContent = `
            .message-notification {
                position: fixed;
                top: 20px;
                right: 20px;
                width: 350px;
                background: var(--discord-darker, #2f3136);
                border-radius: 10px;
                box-shadow: 0 4px 15px rgba(0, 0, 0, 0.4);
                z-index: 10000;
                transform: translateX(400px);
                transition: transform 0.3s ease;
                overflow: hidden;
                border: 1px solid var(--discord-border, #40444b);
                color: var(--discord-text, #ffffff);
            }
            
            .message-notification.show {
                transform: translateX(0);
            }
            
            .notification-content {
                display: flex;
                align-items: center;
                padding: 15px;
                border-bottom: 1px solid var(--discord-border, #40444b);
            }
            
            .notification-avatar {
                width: 40px;
                height: 40px;
                border-radius: 50%;
                object-fit: cover;
                margin-right: 15px;
                border: 2px solid var(--primary-blue, #4a8cff);
            }
            
            .notification-details {
                flex: 1;
            }
            
            .notification-details h4 {
                margin: 0 0 5px 0;
                font-size: 16px;
                color: var(--primary-blue, #4a8cff);
                font-weight: 600;
            }
            
            .notification-details p {
                margin: 0;
                font-size: 14px;
                color: var(--discord-text-muted, #b9bbbe);
            }
            
            .notification-close {
                background: none;
                border: none;
                font-size: 20px;
                cursor: pointer;
                color: var(--discord-text-muted, #b9bbbe);
                padding: 0;
                width: 24px;
                height: 24px;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: var(--transition, all 0.3s ease);
                border-radius: 50%;
            }
            
            .notification-close:hover {
                color: var(--discord-text, #ffffff);
                background-color: var(--discord-dark, #36393f);
            }
            
            .notification-actions {
                display: flex;
                padding: 10px 15px;
                gap: 10px;
            }
            
            .notification-action {
                flex: 2;
                padding: 4px 4px;
                border: none;
                border-radius: 5px;
                cursor: pointer;
                font-size: 14px;
                font-weight: 600;
                transition: var(--transition, all 0.3s ease);
            }
            
            .notification-action.view-chat {
                background-color: var(--primary-blue, #4a8cff);
                color: white;
            }
            
            .notification-action.view-chat:hover {
                background-color: var(--accent-blue, #5e9cff);
                transform: translateY(-2px);
            }
            
            .notification-action.mark-read {
                background-color: var(--discord-dark, #36393f);
                color: var(--discord-text, #ffffff);
                border: 1px solid var(--discord-border, #40444b);
            }
            
            .notification-action.mark-read:hover {
                background-color: var(--discord-border, #40444b);
                transform: translateY(-2px);
            }
            
            @media (max-width: 480px) {
                .message-notification {
                    width: calc(100% - 40px);
                    right: 20px;
                    left: 20px;
                }
                
                .notification-actions {
                    flex-direction: row;
                }
            }
        `;
        
        document.head.appendChild(styles);
    }

    // Clear all notifications
    function clearAllNotifications() {
        document.querySelectorAll('.message-notification').forEach(notification => {
            notification.classList.remove('show');
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        });
        
        // Clear unread messages but keep dismissed notifications
        unreadMessages.clear();
    }

    // Initialize the message system when the DOM is loaded
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initMessageSystem);
    } else {
        initMessageSystem();
    }

    // Clear notifications when navigating to messages page
    window.addEventListener('load', function() {
        const currentPage = window.location.pathname.split('/').pop().split('.')[0];
        if (currentPage === 'messages' || currentPage === 'chat') {
            clearAllNotifications();
        }
    });

    // Export functions for potential external use
    window.MessageNotifications = {
        clearAll: clearAllNotifications,
        init: initMessageSystem,
        markAsRead: markConversationAsRead
    };
})();