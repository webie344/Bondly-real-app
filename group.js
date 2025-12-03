// group.js - Complete Group Chat System with Cloudinary Image Support and Fixed Issues

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
    arrayRemove,
    increment,
    deleteDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

import { 
    getAuth, 
    onAuthStateChanged,
    signOut
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";

// Use your existing Firebase config
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
const db = getFirestore(app);
const auth = getAuth(app);

// Cloudinary configuration (using your existing config)
const cloudinaryConfig = {
    cloudName: "ddtdqrh1b",
    uploadPreset: "profile-pictures",
    apiUrl: "https://api.cloudinary.com/v1_1"
};

// Avatar options for users
const AVATAR_OPTIONS = [
    'https://api.dicebear.com/7.x/avataaars/svg?seed=user1',
    'https://api.dicebear.com/7.x/avataaars/svg?seed=user2',
    'https://api.dicebear.com/7.x/avataaars/svg?seed=user3',
    'https://api.dicebear.com/7.x/avataaars/svg?seed=user4',
    'https://api.dicebear.com/7.x/avataaars/svg?seed=user5',
    'https://api.dicebear.com/7.x/avataaars/svg?seed=user6',
    'https://api.dicebear.com/7.x/avataaars/svg?seed=user7',
    'https://api.dicebear.com/7.x/avataaars/svg?seed=user8'
];

// Local storage keys (now per user)
const GROUP_USER_KEY = 'group_user_data_';
const JOINED_GROUPS_KEY = 'joined_groups_';
const PROFILE_SETUP_KEY = 'profile_setup_';

// Group chat class
class GroupChat {
    constructor() {
        this.currentUser = null;
        this.firebaseUser = null;
        this.currentGroupId = null;
        this.unsubscribeMessages = null;
        this.unsubscribeMembers = null;
        this.unsubscribeAuth = null;
        
        this.setupAuthListener();
    }

    // Setup Firebase auth listener
    setupAuthListener() {
        this.unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
            if (user) {
                this.firebaseUser = user;
                console.log('User authenticated:', user.uid);
                
                // Load user profile from Firestore
                await this.loadUserProfile(user.uid);
                
                // Dispatch event for pages to know auth is ready
                document.dispatchEvent(new Event('groupAuthReady'));
            } else {
                this.firebaseUser = null;
                this.currentUser = null;
                console.log('User logged out');
                
                // Redirect to login if on protected page
                const protectedPages = ['create-group', 'group'];
                const currentPage = window.location.pathname.split('/').pop().split('.')[0];
                
                if (protectedPages.includes(currentPage)) {
                    window.location.href = 'login.html';
                }
            }
        });
    }

    // Load user profile from Firestore
    async loadUserProfile(userId) {
        try {
            const userRef = doc(db, 'group_users', userId);
            const userSnap = await getDoc(userRef);
            
            if (userSnap.exists()) {
                // User exists, load their data
                const userData = userSnap.data();
                this.currentUser = {
                    id: userId,
                    name: userData.displayName || 'Anonymous',
                    avatar: userData.avatar || AVATAR_OPTIONS[0],
                    bio: userData.bio || '',
                    email: this.firebaseUser.email,
                    profileComplete: true // Mark as complete since data exists
                };
                
                // Save to localStorage for this user
                this.saveCurrentUser();
            } else {
                // New user, create default profile
                this.currentUser = {
                    id: userId,
                    name: this.firebaseUser.email.split('@')[0] || 'User',
                    avatar: AVATAR_OPTIONS[0],
                    bio: '',
                    email: this.firebaseUser.email,
                    profileComplete: false // Mark as incomplete
                };
                
                this.saveCurrentUser();
            }
            
            console.log('User profile loaded:', this.currentUser);
            
        } catch (error) {
            console.error('Error loading user profile:', error);
        }
    }

    // Update user profile
    async updateUserProfile(userData) {
        try {
            if (!this.firebaseUser) return;
            
            const userRef = doc(db, 'group_users', this.firebaseUser.uid);
            
            await setDoc(userRef, {
                displayName: userData.name,
                avatar: userData.avatar,
                bio: userData.bio,
                email: this.firebaseUser.email,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
                lastSeen: serverTimestamp()
            }, { merge: true });
            
            // Update local user
            this.currentUser = {
                ...this.currentUser,
                name: userData.name,
                avatar: userData.avatar,
                bio: userData.bio,
                profileComplete: true // Mark as complete
            };
            
            this.saveCurrentUser();
            
            // Also mark profile as setup in localStorage
            this.markProfileAsSetup();
            
            return true;
        } catch (error) {
            console.error('Error updating user profile:', error);
            throw error;
        }
    }

    // Mark profile as setup in localStorage
    markProfileAsSetup() {
        if (!this.firebaseUser) return;
        const setupKey = PROFILE_SETUP_KEY + this.firebaseUser.uid;
        localStorage.setItem(setupKey, 'true');
    }

    // Check if profile is setup in localStorage
    isProfileSetupInStorage() {
        if (!this.firebaseUser) return false;
        const setupKey = PROFILE_SETUP_KEY + this.firebaseUser.uid;
        return localStorage.getItem(setupKey) === 'true';
    }

    // Get current user from localStorage (user-specific)
    getCurrentUser() {
        if (!this.firebaseUser) return null;
        const userKey = GROUP_USER_KEY + this.firebaseUser.uid;
        const userData = localStorage.getItem(userKey);
        return userData ? JSON.parse(userData) : null;
    }

    // Save anonymous user to localStorage (user-specific)
    saveCurrentUser() {
        if (!this.firebaseUser || !this.currentUser) return;
        const userKey = GROUP_USER_KEY + this.firebaseUser.uid;
        localStorage.setItem(userKey, JSON.stringify(this.currentUser));
    }

    // Check if user has joined a specific group (user-specific)
    hasJoinedGroup(groupId) {
        if (!this.firebaseUser) return false;
        const joinedKey = JOINED_GROUPS_KEY + this.firebaseUser.uid;
        const joinedGroups = JSON.parse(localStorage.getItem(joinedKey) || '[]');
        return joinedGroups.includes(groupId);
    }

    // Add group to joined groups list (user-specific)
    addJoinedGroup(groupId) {
        if (!this.firebaseUser) return;
        const joinedKey = JOINED_GROUPS_KEY + this.firebaseUser.uid;
        const joinedGroups = JSON.parse(localStorage.getItem(joinedKey) || '[]');
        if (!joinedGroups.includes(groupId)) {
            joinedGroups.push(groupId);
            localStorage.setItem(joinedKey, JSON.stringify(joinedGroups));
        }
    }

    // Remove group from joined groups
    removeJoinedGroup(groupId) {
        if (!this.firebaseUser) return;
        const joinedKey = JOINED_GROUPS_KEY + this.firebaseUser.uid;
        const joinedGroups = JSON.parse(localStorage.getItem(joinedKey) || '[]');
        const updatedGroups = joinedGroups.filter(id => id !== groupId);
        localStorage.setItem(joinedKey, JSON.stringify(updatedGroups));
    }

    // Check if user needs profile setup
    needsProfileSetup() {
        // First check localStorage for profile setup flag
        if (this.isProfileSetupInStorage()) {
            return false;
        }
        
        // Then check current user data
        return !this.currentUser?.profileComplete || 
               !this.currentUser?.name || 
               this.currentUser?.name === 'User' ||
               !this.currentUser?.avatar;
    }

    // Create a new group
    async createGroup(groupData) {
        try {
            if (!this.firebaseUser || !this.currentUser) {
                throw new Error('You must be logged in to create a group');
            }
            
            const groupRef = doc(collection(db, 'groups'));
            
            const group = {
                id: groupRef.id,
                name: groupData.name,
                description: groupData.description,
                category: groupData.category || 'social',
                topics: groupData.topics || [],
                rules: groupData.rules || [],
                maxMembers: groupData.maxMembers || 50,
                privacy: groupData.privacy || 'public',
                createdBy: this.firebaseUser.uid,
                creatorName: this.currentUser.name,
                creatorAvatar: this.currentUser.avatar,
                memberCount: 1,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
                lastActivity: serverTimestamp()
            };

            await setDoc(groupRef, group);
            
            // Add creator as first member
            await this.addMember(groupRef.id, 'creator');
            
            // Add to joined groups
            this.addJoinedGroup(groupRef.id);
            
            return groupRef.id;
        } catch (error) {
            console.error('Error creating group:', error);
            throw error;
        }
    }

    // Add member to group
    async addMember(groupId, role = 'member') {
        try {
            if (!this.firebaseUser || !this.currentUser) {
                throw new Error('You must be logged in to join a group');
            }
            
            const memberRef = doc(collection(db, 'groups', groupId, 'members'), this.firebaseUser.uid);
            
            const memberData = {
                id: this.firebaseUser.uid,
                name: this.currentUser.name,
                avatar: this.currentUser.avatar,
                bio: this.currentUser.bio || '',
                role: role, // 'creator' or 'member'
                joinedAt: serverTimestamp(),
                lastActive: serverTimestamp()
            };
            
            await setDoc(memberRef, memberData);
            
            // Increment member count in group document
            const groupRef = doc(db, 'groups', groupId);
            await updateDoc(groupRef, {
                memberCount: increment(1),
                updatedAt: serverTimestamp(),
                lastActivity: serverTimestamp()
            });
            
            return true;
        } catch (error) {
            console.error('Error adding member:', error);
            throw error;
        }
    }

    // Remove member from group
    async removeMember(groupId) {
        try {
            if (!this.firebaseUser) return;
            
            const memberRef = doc(db, 'groups', groupId, 'members', this.firebaseUser.uid);
            await deleteDoc(memberRef);
            
            // Decrement member count in group document
            const groupRef = doc(db, 'groups', groupId);
            await updateDoc(groupRef, {
                memberCount: increment(-1),
                updatedAt: serverTimestamp()
            });
            
            // Remove from joined groups
            this.removeJoinedGroup(groupId);
            
            return true;
        } catch (error) {
            console.error('Error removing member:', error);
            throw error;
        }
    }

    // Get all groups
    async getAllGroups() {
        try {
            const groupsRef = collection(db, 'groups');
            const q = query(groupsRef, orderBy('lastActivity', 'desc'));
            const querySnapshot = await getDocs(q);
            
            const groups = [];
            querySnapshot.forEach(doc => {
                const data = doc.data();
                groups.push({ 
                    id: doc.id, 
                    ...data,
                    createdAt: data.createdAt ? (data.createdAt.toDate ? data.createdAt.toDate() : data.createdAt) : new Date(),
                    updatedAt: data.updatedAt ? (data.updatedAt.toDate ? data.updatedAt.toDate() : data.updatedAt) : new Date()
                });
            });
            
            return groups;
        } catch (error) {
            console.error('Error getting groups:', error);
            throw error;
        }
    }

    // Get group by ID
    async getGroup(groupId) {
        try {
            const groupRef = doc(db, 'groups', groupId);
            const groupSnap = await getDoc(groupRef);
            
            if (groupSnap.exists()) {
                const data = groupSnap.data();
                return { 
                    id: groupSnap.id, 
                    ...data,
                    createdAt: data.createdAt ? (data.createdAt.toDate ? data.createdAt.toDate() : data.createdAt) : new Date(),
                    updatedAt: data.updatedAt ? (data.updatedAt.toDate ? data.updatedAt.toDate() : data.updatedAt) : new Date()
                };
            }
            return null;
        } catch (error) {
            console.error('Error getting group:', error);
            throw error;
        }
    }

    // Get group members
    async getGroupMembers(groupId) {
        try {
            const membersRef = collection(db, 'groups', groupId, 'members');
            const q = query(membersRef, orderBy('joinedAt', 'asc'));
            const querySnapshot = await getDocs(q);
            
            const members = [];
            querySnapshot.forEach(doc => {
                const data = doc.data();
                members.push({
                    id: doc.id,
                    ...data,
                    joinedAt: data.joinedAt ? (data.joinedAt.toDate ? data.joinedAt.toDate() : data.joinedAt) : new Date(),
                    lastActive: data.lastActive ? (data.lastActive.toDate ? data.lastActive.toDate() : data.lastActive) : new Date()
                });
            });
            
            return members;
        } catch (error) {
            console.error('Error getting group members:', error);
            return [];
        }
    }

    // Check if user is member of group
    async isMember(groupId) {
        try {
            if (!this.firebaseUser) return false;
            
            const memberRef = doc(db, 'groups', groupId, 'members', this.firebaseUser.uid);
            const memberSnap = await getDoc(memberRef);
            
            return memberSnap.exists();
        } catch (error) {
            console.error('Error checking membership:', error);
            return false;
        }
    }

    // Join a group
    async joinGroup(groupId) {
        try {
            if (!this.firebaseUser || !this.currentUser) {
                throw new Error('You must be logged in to join a group');
            }
            
            const groupRef = doc(db, 'groups', groupId);
            const groupSnap = await getDoc(groupRef);
            
            if (!groupSnap.exists()) {
                throw new Error('Group not found');
            }
            
            const group = groupSnap.data();
            
            // Check if user is already a member
            const isMember = await this.isMember(groupId);
            if (isMember) {
                // User is already a member, just update last active
                await this.updateLastActive(groupId);
                return true;
            }
            
            // Check if group is full
            if (group.memberCount >= group.maxMembers) {
                throw new Error('Group is full');
            }
            
            // Check if user is the creator
            const role = group.createdBy === this.firebaseUser.uid ? 'creator' : 'member';
            
            // Add user as member
            await this.addMember(groupId, role);
            
            // Add to joined groups
            this.addJoinedGroup(groupId);
            
            return true;
        } catch (error) {
            console.error('Error joining group:', error);
            throw error;
        }
    }

    // Leave a group
    async leaveGroup(groupId) {
        try {
            if (!this.firebaseUser) {
                throw new Error('No user found');
            }
            
            // Remove member from members collection
            await this.removeMember(groupId);
            
            return true;
        } catch (error) {
            console.error('Error leaving group:', error);
            throw error;
        }
    }

    // Upload image to Cloudinary
    async uploadImageToCloudinary(file) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('upload_preset', cloudinaryConfig.uploadPreset);
        formData.append('resource_type', 'image');
        
        try {
            const response = await fetch(
                `https://api.cloudinary.com/v1_1/${cloudinaryConfig.cloudName}/image/upload`,
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
            console.error('Error uploading image to Cloudinary:', error);
            throw error;
        }
    }

    // Validate image file
    validateImageFile(file) {
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

    // Send message to group (with image support)
    async sendMessage(groupId, text = null, imageUrl = null, replyTo = null) {
        try {
            if (!this.firebaseUser || !this.currentUser) {
                throw new Error('You must be logged in to send messages');
            }
            
            if (!text && !imageUrl) {
                throw new Error('Message cannot be empty');
            }
            
            const messagesRef = collection(db, 'groups', groupId, 'messages');
            const messageData = {
                senderId: this.firebaseUser.uid,
                senderName: this.currentUser.name,
                senderAvatar: this.currentUser.avatar,
                timestamp: serverTimestamp(),
                replyTo: replyTo || null
            };
            
            // Add text if provided
            if (text) {
                messageData.text = text.trim();
            }
            
            // Add image if provided
            if (imageUrl) {
                messageData.imageUrl = imageUrl;
                messageData.type = 'image';
            }
            
            await addDoc(messagesRef, messageData);
            
            // Update group's last activity
            const groupRef = doc(db, 'groups', groupId);
            await updateDoc(groupRef, {
                updatedAt: serverTimestamp(),
                lastActivity: serverTimestamp(),
                lastMessage: {
                    text: text ? text.trim() : '📷 Image',
                    sender: this.currentUser.name,
                    timestamp: serverTimestamp()
                }
            });
            
            // Update user's last active time
            await this.updateLastActive(groupId);
            
            return true;
        } catch (error) {
            console.error('Error sending message:', error);
            throw error;
        }
    }

    // Send image message
    async sendImageMessage(groupId, file, replyTo = null) {
        try {
            // Validate file
            this.validateImageFile(file);
            
            // Show uploading indicator
            const tempMessageId = 'temp_image_' + Date.now();
            this.showTempImageMessage(groupId, file, tempMessageId);
            
            // Upload to Cloudinary
            const imageUrl = await this.uploadImageToCloudinary(file);
            
            // Send message with image URL
            await this.sendMessage(groupId, null, imageUrl, replyTo);
            
            // Remove temp message
            this.removeTempMessage(tempMessageId);
            
            return true;
        } catch (error) {
            console.error('Error sending image message:', error);
            throw error;
        }
    }

    // Show temporary image message while uploading
    showTempImageMessage(groupId, file, tempId) {
        if (window.currentGroupId === groupId) {
            const tempImageUrl = URL.createObjectURL(file);
            const messagesContainer = document.getElementById('messagesContainer');
            
            const tempMessage = {
                id: tempId,
                senderId: this.firebaseUser.uid,
                senderName: this.currentUser.name,
                senderAvatar: this.currentUser.avatar,
                imageUrl: tempImageUrl,
                timestamp: new Date().toISOString(),
                type: 'image',
                status: 'uploading'
            };
            
            const event = new CustomEvent('tempImageMessage', { detail: tempMessage });
            document.dispatchEvent(event);
        }
    }

    // Remove temporary message
    removeTempMessage(tempId) {
        const event = new CustomEvent('removeTempMessage', { detail: { tempId } });
        document.dispatchEvent(event);
    }

    // Get messages for a group
    async getMessages(groupId, limitCount = 50) {
        try {
            const messagesRef = collection(db, 'groups', groupId, 'messages');
            const q = query(messagesRef, orderBy('timestamp', 'desc'), limit(limitCount));
            const querySnapshot = await getDocs(q);
            
            const messages = [];
            querySnapshot.forEach(doc => {
                const data = doc.data();
                messages.push({ 
                    id: doc.id, 
                    ...data,
                    timestamp: data.timestamp ? (data.timestamp.toDate ? data.timestamp.toDate() : data.timestamp) : new Date()
                });
            });
            
            // Reverse to show oldest first
            return messages.reverse();
        } catch (error) {
            console.error('Error getting messages:', error);
            throw error;
        }
    }

    // Listen for new messages
    listenToMessages(groupId, callback) {
        try {
            if (this.unsubscribeMessages) {
                this.unsubscribeMessages();
            }
            
            const messagesRef = collection(db, 'groups', groupId, 'messages');
            const q = query(messagesRef, orderBy('timestamp', 'asc'));
            
            this.unsubscribeMessages = onSnapshot(q, (snapshot) => {
                const messages = [];
                snapshot.forEach(doc => {
                    const data = doc.data();
                    messages.push({ 
                        id: doc.id, 
                        ...data,
                        timestamp: data.timestamp ? (data.timestamp.toDate ? data.timestamp.toDate() : data.timestamp) : new Date()
                    });
                });
                callback(messages);
            });
            
            return this.unsubscribeMessages;
        } catch (error) {
            console.error('Error listening to messages:', error);
            throw error;
        }
    }

    // Listen for member updates
    listenToMembers(groupId, callback) {
        try {
            if (this.unsubscribeMembers) {
                this.unsubscribeMembers();
            }
            
            const membersRef = collection(db, 'groups', groupId, 'members');
            const q = query(membersRef, orderBy('joinedAt', 'asc'));
            
            this.unsubscribeMembers = onSnapshot(q, (snapshot) => {
                const members = [];
                snapshot.forEach(doc => {
                    const data = doc.data();
                    members.push({
                        id: doc.id,
                        ...data,
                        joinedAt: data.joinedAt ? (data.joinedAt.toDate ? data.joinedAt.toDate() : data.joinedAt) : new Date(),
                        lastActive: data.lastActive ? (data.lastActive.toDate ? data.lastActive.toDate() : data.lastActive) : new Date()
                    });
                });
                callback(members);
            });
            
            return this.unsubscribeMembers;
        } catch (error) {
            console.error('Error listening to members:', error);
            throw error;
        }
    }

    // Update user's last active time
    async updateLastActive(groupId) {
        try {
            if (!this.firebaseUser) return;
            
            const memberRef = doc(db, 'groups', groupId, 'members', this.firebaseUser.uid);
            const memberSnap = await getDoc(memberRef);
            
            if (memberSnap.exists()) {
                await updateDoc(memberRef, {
                    lastActive: serverTimestamp()
                });
            }
            
            // Also update user's last seen in user profile
            const userRef = doc(db, 'group_users', this.firebaseUser.uid);
            await updateDoc(userRef, {
                lastSeen: serverTimestamp()
            });
        } catch (error) {
            console.error('Error updating last active:', error);
        }
    }

    // Logout
    async logout() {
        try {
            await signOut(auth);
            this.firebaseUser = null;
            this.currentUser = null;
            this.cleanup();
            
            // Clear localStorage for this user
            if (this.firebaseUser) {
                localStorage.removeItem(GROUP_USER_KEY + this.firebaseUser.uid);
                localStorage.removeItem(JOINED_GROUPS_KEY + this.firebaseUser.uid);
                localStorage.removeItem(PROFILE_SETUP_KEY + this.firebaseUser.uid);
            }
            
            // Redirect to login
            window.location.href = 'login.html';
        } catch (error) {
            console.error('Error logging out:', error);
        }
    }

    // Clean up listeners
    cleanup() {
        if (this.unsubscribeMessages) {
            this.unsubscribeMessages();
            this.unsubscribeMessages = null;
        }
        
        if (this.unsubscribeMembers) {
            this.unsubscribeMembers();
            this.unsubscribeMembers = null;
        }
        
        if (this.unsubscribeAuth) {
            this.unsubscribeAuth();
            this.unsubscribeAuth = null;
        }
    }
}

// Initialize group chat system
const groupChat = new GroupChat();

// Wait for auth to be ready before initializing pages
document.addEventListener('DOMContentLoaded', () => {
    document.addEventListener('groupAuthReady', () => {
        const currentPage = window.location.pathname.split('/').pop().split('.')[0];
        
        switch(currentPage) {
            case 'create-group':
                initCreateGroupPage();
                break;
            case 'groups':
                initGroupsPage();
                break;
            case 'set':
                initSetPage();
                break;
            case 'group':
                initGroupPage();
                break;
            default:
                // For pages that don't need auth check
                if (currentPage === 'login' || currentPage === 'signup') {
                    // These pages handle their own initialization
                } else {
                    // Other pages wait for auth
                    setTimeout(() => {
                        if (!groupChat.firebaseUser && currentPage !== 'login' && currentPage !== 'signup') {
                            window.location.href = 'login.html';
                        }
                    }, 1000);
                }
        }
    });
    
    // Also check after a delay in case auth was already ready
    setTimeout(() => {
        if (groupChat.firebaseUser) {
            document.dispatchEvent(new Event('groupAuthReady'));
        }
    }, 500);
});

// Initialize Create Group Page
function initCreateGroupPage() {
    // Check auth
    if (!groupChat.firebaseUser) {
        window.location.href = 'login.html';
        return;
    }
    
    const form = document.getElementById('createGroupForm');
    const nameInput = document.getElementById('groupName');
    const descInput = document.getElementById('groupDescription');
    const nameCount = document.getElementById('nameCount');
    const descCount = document.getElementById('descCount');
    const maxMembersSlider = document.getElementById('maxMembers');
    const memberCount = document.getElementById('memberCount');
    const addTopicBtn = document.getElementById('addTopicBtn');
    const addRuleBtn = document.getElementById('addRuleBtn');
    const cancelBtn = document.getElementById('cancelBtn');
    const createBtn = document.getElementById('createBtn');
    
    let topics = [''];
    let rules = [''];
    
    // Update character counts
    nameInput.addEventListener('input', () => {
        nameCount.textContent = nameInput.value.length;
    });
    
    descInput.addEventListener('input', () => {
        descCount.textContent = descInput.value.length;
    });
    
    // Update member count display
    maxMembersSlider.addEventListener('input', () => {
        memberCount.textContent = maxMembersSlider.value;
    });
    
    // Add topic input
    addTopicBtn.addEventListener('click', () => {
        if (topics.length < 5) {
            topics.push('');
            renderTopics();
        }
    });
    
    // Add rule input
    addRuleBtn.addEventListener('click', () => {
        rules.push('');
        renderRules();
    });
    
    // Render topics
    function renderTopics() {
        const container = document.getElementById('topicsContainer');
        container.innerHTML = '';
        
        topics.forEach((topic, index) => {
            const div = document.createElement('div');
            div.className = 'rule-item';
            
            div.innerHTML = `
                <input type="text" 
                       class="form-input rule-input" 
                       placeholder="Add a topic"
                       value="${topic}"
                       data-index="${index}">
                ${index === 0 ? `
                    <button type="button" class="add-rule-btn add-topic-btn">
                        <i class="fas fa-plus"></i>
                    </button>
                ` : `
                    <button type="button" class="remove-rule-btn remove-topic-btn">
                        <i class="fas fa-minus"></i>
                    </button>
                `}
            `;
            
            container.appendChild(div);
        });
        
        // Add event listeners
        document.querySelectorAll('.add-topic-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                if (topics.length < 5) {
                    topics.push('');
                    renderTopics();
                }
            });
        });
        
        document.querySelectorAll('.remove-topic-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const index = parseInt(e.target.closest('.remove-topic-btn').parentElement.querySelector('input').dataset.index);
                topics.splice(index, 1);
                renderTopics();
            });
        });
        
        document.querySelectorAll('.rule-input').forEach(input => {
            input.addEventListener('input', (e) => {
                const index = parseInt(e.target.dataset.index);
                topics[index] = e.target.value;
            });
        });
    }
    
    // Render rules
    function renderRules() {
        const container = document.getElementById('rulesContainer');
        container.innerHTML = '';
        
        rules.forEach((rule, index) => {
            const div = document.createElement('div');
            div.className = 'rule-item';
            
            div.innerHTML = `
                <input type="text" 
                       class="form-input rule-input" 
                       placeholder="Add a rule"
                       value="${rule}"
                       data-index="${index}">
                ${index === 0 ? `
                    <button type="button" class="add-rule-btn add-rule-btn">
                        <i class="fas fa-plus"></i>
                    </button>
                ` : `
                    <button type="button" class="remove-rule-btn remove-rule-btn">
                        <i class="fas fa-minus"></i>
                    </button>
                `}
            `;
            
            container.appendChild(div);
        });
        
        // Add event listeners
        document.querySelectorAll('.add-rule-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                rules.push('');
                renderRules();
            });
        });
        
        document.querySelectorAll('.remove-rule-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const index = parseInt(e.target.closest('.remove-rule-btn').parentElement.querySelector('input').dataset.index);
                rules.splice(index, 1);
                renderRules();
            });
        });
        
        document.querySelectorAll('.rule-input').forEach(input => {
            input.addEventListener('input', (e) => {
                const index = parseInt(e.target.dataset.index);
                rules[index] = e.target.value;
            });
        });
    }
    
    // Form submission
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        // Get form values
        const groupData = {
            name: nameInput.value.trim(),
            description: descInput.value.trim(),
            category: document.getElementById('groupCategory').value,
            topics: topics.filter(t => t.trim()).map(t => t.trim()),
            rules: rules.filter(r => r.trim()).map(r => r.trim()),
            maxMembers: parseInt(maxMembersSlider.value),
            privacy: document.getElementById('groupPrivacy').value
        };
        
        // Validate
        if (!groupData.name) {
            alert('Please enter a group name');
            return;
        }
        
        if (!groupData.description) {
            alert('Please enter a group description');
            return;
        }
        
        if (groupData.topics.length === 0) {
            alert('Please add at least one discussion topic');
            return;
        }
        
        createBtn.disabled = true;
        createBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating...';
        
        try {
            // Create group
            const groupId = await groupChat.createGroup(groupData);
            
            alert('Group created successfully!');
            window.location.href = `group.html?id=${groupId}`;
        } catch (error) {
            console.error('Error creating group:', error);
            alert('Failed to create group. Please try again.');
            createBtn.disabled = false;
            createBtn.textContent = 'Create Group';
        }
    });
    
    // Cancel button
    cancelBtn.addEventListener('click', () => {
        window.location.href = 'groups.html';
    });
    
    // Initial render
    renderTopics();
    renderRules();
}

// Initialize Groups Page
function initGroupsPage() {
    const groupsGrid = document.getElementById('groupsGrid');
    const createGroupBtn = document.getElementById('createGroupBtn');
    const searchInput = document.getElementById('groupSearch');
    
    let allGroups = [];
    
    // Load groups
    loadGroups();
    
    // Create group button
    createGroupBtn.addEventListener('click', () => {
        if (!groupChat.firebaseUser) {
            window.location.href = 'login.html';
            return;
        }
        
        // Check if user needs profile setup
        if (groupChat.needsProfileSetup()) {
            window.location.href = 'set.html?returnTo=create-group';
        } else {
            window.location.href = 'create-group.html';
        }
    });
    
    // Search functionality
    searchInput.addEventListener('input', (e) => {
        const searchTerm = e.target.value.toLowerCase().trim();
        filterGroups(searchTerm);
    });
    
    // Load groups function
    async function loadGroups() {
        try {
            allGroups = await groupChat.getAllGroups();
            displayGroups(allGroups);
        } catch (error) {
            console.error('Error loading groups:', error);
            groupsGrid.innerHTML = '<div class="no-groups"><p>Error loading groups. Please try again.</p></div>';
        }
    }
    
    // Display groups
    function displayGroups(groups) {
        if (groups.length === 0) {
            groupsGrid.innerHTML = `
                <div class="no-groups">
                    <i class="fas fa-users-slash"></i>
                    <p>No groups found. Be the first to create one!</p>
                </div>
            `;
            return;
        }
        
        groupsGrid.innerHTML = '';
        
        groups.forEach(group => {
            const isJoined = groupChat.hasJoinedGroup(group.id);
            
            const groupCard = document.createElement('div');
            groupCard.className = 'group-card';
            groupCard.innerHTML = `
                <div class="group-header">
                    <h3 class="group-name">${group.name}</h3>
                    <span class="group-category">${group.category || 'General'}</span>
                    <p class="group-description">${group.description}</p>
                    <div class="group-meta">
                        <span class="group-members">
                            <i class="fas fa-users"></i>
                            ${group.memberCount || 0} / ${group.maxMembers || 50}
                        </span>
                        <span class="group-privacy">
                            <i class="fas ${group.privacy === 'private' ? 'fa-lock' : 'fa-globe'}"></i>
                            ${group.privacy === 'private' ? 'Private' : 'Public'}
                        </span>
                    </div>
                </div>
                <div class="group-content">
                    <div class="group-topics">
                        <h4 class="section-title">Discussion Topics</h4>
                        <div class="topics-list">
                            ${(group.topics || []).slice(0, 3).map(topic => 
                                `<span class="topic-tag">${topic}</span>`
                            ).join('')}
                            ${(group.topics || []).length > 3 ? 
                                `<span class="topic-tag">+${(group.topics || []).length - 3} more</span>` : ''
                            }
                        </div>
                    </div>
                    <div class="group-rules">
                        <h4 class="section-title">Group Rules</h4>
                        <ul class="rules-list">
                            ${(group.rules || []).slice(0, 2).map(rule => 
                                `<li class="rule-item">
                                    <i class="fas fa-check-circle"></i>
                                    <span>${rule}</span>
                                </li>`
                            ).join('')}
                            ${(group.rules || []).length > 2 ? 
                                `<li class="rule-item">
                                    <i class="fas fa-ellipsis-h"></i>
                                    <span>${(group.rules || []).length - 2} more rules</span>
                                </li>` : ''
                            }
                        </ul>
                    </div>
                </div>
                <div class="group-actions">
                    <button class="join-btn ${isJoined ? 'joined' : ''}" data-group-id="${group.id}">
                        ${isJoined ? 'Enter Chat' : 'Join Group'}
                    </button>
                </div>
            `;
            
            groupsGrid.appendChild(groupCard);
        });
        
        // Add event listeners to join buttons
        document.querySelectorAll('.join-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const groupId = e.target.dataset.groupId;
                
                // Check if user is logged in
                if (!groupChat.firebaseUser) {
                    window.location.href = 'login.html';
                    return;
                }
                
                const isJoined = groupChat.hasJoinedGroup(groupId);
                
                if (isJoined) {
                    // Already joined, go to chat
                    window.location.href = `group.html?id=${groupId}`;
                } else {
                    // New user trying to join
                    // Check if user needs profile setup
                    if (groupChat.needsProfileSetup()) {
                        window.location.href = `set.html?id=${groupId}`;
                    } else {
                        // Try to join the group
                        try {
                            await groupChat.joinGroup(groupId);
                            window.location.href = `group.html?id=${groupId}`;
                        } catch (error) {
                            alert(error.message || 'Failed to join group. Please try again.');
                        }
                    }
                }
            });
        });
    }
    
    // Filter groups
    function filterGroups(searchTerm) {
        if (!searchTerm) {
            displayGroups(allGroups);
            return;
        }
        
        const filtered = allGroups.filter(group => {
            return (
                group.name.toLowerCase().includes(searchTerm) ||
                group.description.toLowerCase().includes(searchTerm) ||
                (group.category && group.category.toLowerCase().includes(searchTerm)) ||
                (group.topics || []).some(topic => topic.toLowerCase().includes(searchTerm))
            );
        });
        
        displayGroups(filtered);
    }
}

// Initialize Set Page (for profile setup)
function initSetPage() {
    const form = document.getElementById('setupForm');
    const avatarPreview = document.getElementById('avatarPreview');
    const avatarOptions = document.getElementById('avatarOptions');
    const displayName = document.getElementById('displayName');
    const nameCount = document.getElementById('nameCount');
    const userBio = document.getElementById('userBio');
    const bioCount = document.getElementById('bioCount');
    const cancelBtn = document.getElementById('cancelBtn');
    const joinBtn = document.getElementById('joinBtn');
    const groupInfo = document.getElementById('groupInfo');
    
    const urlParams = new URLSearchParams(window.location.search);
    const groupId = urlParams.get('id');
    const returnTo = urlParams.get('returnTo');
    
    let selectedAvatar = AVATAR_OPTIONS[0];
    let groupData = null;
    
    // Check if user is logged in
    if (!groupChat.firebaseUser) {
        window.location.href = 'login.html';
        return;
    }
    
    // Load group info if groupId is provided
    if (groupId) {
        loadGroupInfo();
    } else {
        // No group ID, just profile setup
        groupInfo.innerHTML = `
            <div class="group-name-display">Profile Setup</div>
            <div class="group-description-display">Set up your profile before joining groups</div>
        `;
    }
    
    // Update character counts
    displayName.addEventListener('input', () => {
        nameCount.textContent = displayName.value.length;
    });
    
    userBio.addEventListener('input', () => {
        bioCount.textContent = userBio.value.length;
    });
    
    // Render avatar options
    function renderAvatarOptions() {
        avatarOptions.innerHTML = '';
        
        AVATAR_OPTIONS.forEach((avatar, index) => {
            const img = document.createElement('img');
            img.src = avatar;
            img.alt = `Avatar ${index + 1}`;
            img.className = `avatar-option ${avatar === selectedAvatar ? 'selected' : ''}`;
            
            img.addEventListener('click', () => {
                selectedAvatar = avatar;
                avatarPreview.src = avatar;
                renderAvatarOptions();
            });
            
            avatarOptions.appendChild(img);
        });
    }
    
    // Load group info
    async function loadGroupInfo() {
        try {
            groupData = await groupChat.getGroup(groupId);
            
            if (!groupData) {
                alert('Group not found');
                window.location.href = 'groups.html';
                return;
            }
            
            groupInfo.innerHTML = `
                <div class="group-name-display">${groupData.name}</div>
                <div class="group-description-display">${groupData.description}</div>
            `;
        } catch (error) {
            console.error('Error loading group info:', error);
            alert('Error loading group information');
            window.location.href = 'groups.html';
        }
    }
    
    // Form submission
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const name = displayName.value.trim();
        const bio = userBio.value.trim();
        
        if (!name) {
            alert('Please enter a display name');
            return;
        }
        
        // Check if name is too short or too long
        if (name.length < 2) {
            alert('Display name must be at least 2 characters');
            return;
        }
        
        if (name.length > 20) {
            alert('Display name must be less than 20 characters');
            return;
        }
        
        // Create user data
        const userData = {
            name: name,
            avatar: selectedAvatar,
            bio: bio
        };
        
        joinBtn.disabled = true;
        joinBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
        
        try {
            // Update user profile
            await groupChat.updateUserProfile(userData);
            
            // If there's a group to join, join it
            if (groupId) {
                try {
                    await groupChat.joinGroup(groupId);
                    alert('Profile saved and joined group successfully!');
                    window.location.href = `group.html?id=${groupId}`;
                } catch (error) {
                    alert('Profile saved, but could not join group: ' + error.message);
                    window.location.href = 'groups.html';
                }
            } else if (returnTo === 'create-group') {
                // Return to create group page
                window.location.href = 'create-group.html';
            } else {
                // Just go to groups page
                alert('Profile saved successfully!');
                window.location.href = 'groups.html';
            }
            
        } catch (error) {
            console.error('Error saving profile:', error);
            alert('Failed to save profile. Please try again.');
            joinBtn.disabled = false;
            joinBtn.textContent = 'Save Profile';
        }
    });
    
    // Cancel button
    cancelBtn.addEventListener('click', () => {
        if (returnTo === 'create-group') {
            window.location.href = 'create-group.html';
        } else {
            window.location.href = 'groups.html';
        }
    });
    
    // Initial render
    renderAvatarOptions();
    
    // Pre-fill with current user data if available
    if (groupChat.currentUser && groupChat.currentUser.name !== 'User') {
        displayName.value = groupChat.currentUser.name || '';
        userBio.value = groupChat.currentUser.bio || '';
        selectedAvatar = groupChat.currentUser.avatar || AVATAR_OPTIONS[0];
        avatarPreview.src = selectedAvatar;
        
        // Update character counts
        nameCount.textContent = displayName.value.length;
        bioCount.textContent = userBio.value.length;
        
        renderAvatarOptions();
    }
}

// Initialize Group Chat Page with Image Support
function initGroupPage() {
    const sidebar = document.getElementById('sidebar');
    const backBtn = document.getElementById('backBtn');
    const sidebarToggle = document.getElementById('sidebarToggle');
    const infoBtn = document.getElementById('infoBtn');
    const messagesContainer = document.getElementById('messagesContainer');
    const noMessages = document.getElementById('noMessages');
    const messageInput = document.getElementById('messageInput');
    const sendBtn = document.getElementById('sendBtn');
    const emojiBtn = document.getElementById('emojiBtn');
    const attachmentBtn = document.getElementById('attachmentBtn');
    const groupAvatar = document.getElementById('groupAvatar');
    const groupNameSidebar = document.getElementById('groupNameSidebar');
    const groupMembersCount = document.getElementById('groupMembersCount');
    const chatTitle = document.getElementById('chatTitle');
    const chatSubtitle = document.getElementById('chatSubtitle');
    const membersList = document.getElementById('membersList');
    const rulesList = document.getElementById('rulesList');
    
    const urlParams = new URLSearchParams(window.location.search);
    const groupId = urlParams.get('id');
    
    let messages = [];
    let members = [];
    let groupData = null;
    let tempMessages = new Map(); // Store temporary messages
    
    if (!groupId) {
        window.location.href = 'groups.html';
        return;
    }
    
    // Check if user is logged in
    if (!groupChat.firebaseUser) {
        window.location.href = 'login.html';
        return;
    }
    
    // Store current group ID for temporary messages
    window.currentGroupId = groupId;
    
    // Check if user needs profile setup - FIXED: Check localStorage flag first
    if (groupChat.needsProfileSetup() && !groupChat.isProfileSetupInStorage()) {
        window.location.href = `set.html?id=${groupId}`;
        return;
    }
    
    // Check if user has joined the group
    if (!groupChat.hasJoinedGroup(groupId)) {
        // Try to check if they're actually a member in Firestore
        groupChat.isMember(groupId).then(isMember => {
            if (!isMember) {
                // Not a member, redirect to join flow
                window.location.href = `set.html?id=${groupId}`;
            } else {
                // They're a member but localStorage doesn't know it
                groupChat.addJoinedGroup(groupId);
                loadGroupData();
                setupListeners();
            }
        }).catch(() => {
            window.location.href = `set.html?id=${groupId}`;
        });
        return;
    }
    
    // Load group data and messages
    loadGroupData();
    setupListeners();
    
    // Back button
    backBtn.addEventListener('click', () => {
        groupChat.cleanup();
        window.location.href = 'groups.html';
    });
    
    // Sidebar toggle (for mobile)
    sidebarToggle.addEventListener('click', () => {
        sidebar.classList.toggle('active');
    });
    
    // Info button
    infoBtn.addEventListener('click', () => {
        sidebar.classList.toggle('active');
    });
    
    // Message input events
    messageInput.addEventListener('input', () => {
        sendBtn.disabled = !messageInput.value.trim();
        
        // Auto-resize textarea
        messageInput.style.height = 'auto';
        messageInput.style.height = Math.min(messageInput.scrollHeight, 120) + 'px';
    });
    
    // Send message
    sendBtn.addEventListener('click', sendMessage);
    
    messageInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });
    
    // Emoji button - simple implementation
    emojiBtn.addEventListener('click', () => {
        // Simple emoji picker
        const emojis = ['😀', '😂', '🥰', '😎', '🤔', '👍', '🎉', '❤️', '🔥', '✨'];
        const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];
        
        messageInput.value += randomEmoji;
        messageInput.focus();
        messageInput.dispatchEvent(new Event('input'));
    });
    
    // Attachment button - image upload
    attachmentBtn.addEventListener('click', () => {
        // Create file input
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = 'image/*';
        fileInput.multiple = false;
        
        fileInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (file) {
                try {
                    // Show loading state
                    const originalHTML = attachmentBtn.innerHTML;
                    attachmentBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
                    attachmentBtn.disabled = true;
                    
                    // Send image message
                    await groupChat.sendImageMessage(groupId, file);
                    
                    // Restore button state
                    attachmentBtn.innerHTML = originalHTML;
                    attachmentBtn.disabled = false;
                    
                } catch (error) {
                    console.error('Error sending image:', error);
                    alert(error.message || 'Failed to send image. Please try again.');
                    
                    // Restore button state
                    attachmentBtn.innerHTML = '<i class="fas fa-paperclip"></i>';
                    attachmentBtn.disabled = false;
                }
            }
        });
        
        fileInput.click();
    });
    
    // Listen for temporary image messages
    document.addEventListener('tempImageMessage', (e) => {
        const tempMessage = e.detail;
        tempMessages.set(tempMessage.id, tempMessage);
        
        // Add to messages array for display
        const tempMsgIndex = messages.findIndex(m => m.id === tempMessage.id);
        if (tempMsgIndex === -1) {
            messages.push(tempMessage);
            displayMessages();
        }
    });
    
    // Listen for temporary message removal
    document.addEventListener('removeTempMessage', (e) => {
        const tempId = e.detail.tempId;
        tempMessages.delete(tempId);
        
        // Remove from messages array
        const tempMsgIndex = messages.findIndex(m => m.id === tempId);
        if (tempMsgIndex !== -1) {
            messages.splice(tempMsgIndex, 1);
            displayMessages();
        }
    });
    
    // Load group data
    async function loadGroupData() {
        try {
            groupData = await groupChat.getGroup(groupId);
            
            if (!groupData) {
                alert('Group not found');
                window.location.href = 'groups.html';
                return;
            }
            
            // Update UI with group info
            groupAvatar.src = `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(groupData.name)}`;
            groupNameSidebar.textContent = groupData.name;
            groupMembersCount.textContent = `${groupData.memberCount || 0} members`;
            chatTitle.textContent = groupData.name;
            chatSubtitle.textContent = groupData.description;
            
            // Update rules
            rulesList.innerHTML = '';
            (groupData.rules || []).forEach(rule => {
                const li = document.createElement('li');
                li.className = 'rule-item';
                li.innerHTML = `<i class="fas fa-check-circle"></i><span>${rule}</span>`;
                rulesList.appendChild(li);
            });
            
            // Load initial members
            members = await groupChat.getGroupMembers(groupId);
            updateMembersList();
            
            // Load initial messages
            messages = await groupChat.getMessages(groupId);
            displayMessages();
            
        } catch (error) {
            console.error('Error loading group data:', error);
            alert('Error loading group data. Please try again.');
        }
    }
    
    // Setup real-time listeners
    function setupListeners() {
        // Listen for messages
        groupChat.listenToMessages(groupId, (newMessages) => {
            messages = newMessages;
            
            // Add any temporary messages back
            tempMessages.forEach((tempMsg, tempId) => {
                if (!messages.some(m => m.id === tempId)) {
                    messages.push(tempMsg);
                }
            });
            
            displayMessages();
        });
        
        // Listen for member updates
        groupChat.listenToMembers(groupId, (newMembers) => {
            members = newMembers;
            updateMembersList();
            
            // Update member count in sidebar
            if (groupData) {
                groupData.memberCount = newMembers.length;
                groupMembersCount.textContent = `${newMembers.length} members`;
            }
        });
        
        // Update last active every minute
        setInterval(() => {
            groupChat.updateLastActive(groupId);
        }, 60000);
        
        // Update last active when user focuses the window
        window.addEventListener('focus', () => {
            groupChat.updateLastActive(groupId);
        });
    }
    
    // Update members list with admin tags
    function updateMembersList() {
        membersList.innerHTML = '';
        
        if (members.length === 0) {
            membersList.innerHTML = '<p style="color: var(--text-light); font-size: 0.9rem;">No members yet</p>';
            return;
        }
        
        members.forEach(member => {
            const isOnline = member.lastActive && 
                (Date.now() - new Date(member.lastActive).getTime()) < 300000; // 5 minutes
            
            // Check if member is admin/creator
            const isAdmin = member.role === 'creator';
            const isCurrentUser = member.id === groupChat.firebaseUser?.uid;
            
            const div = document.createElement('div');
            div.className = 'member-item';
            div.innerHTML = `
                <img src="${member.avatar}" alt="${member.name}" class="member-avatar">
                <div class="member-info">
                    <div class="member-name">
                        ${member.name}
                        ${isAdmin ? '<span style="margin-left: 6px; background: var(--primary); color: white; padding: 2px 6px; border-radius: 4px; font-size: 10px;">Admin</span>' : ''}
                        ${isCurrentUser ? '<span style="margin-left: 6px; background: #666; color: white; padding: 2px 6px; border-radius: 4px; font-size: 10px;">You</span>' : ''}
                    </div>
                    ${member.bio ? `<div class="member-bio">${member.bio}</div>` : ''}
                </div>
                <div class="member-status ${isOnline ? 'online' : ''}"></div>
            `;
            
            membersList.appendChild(div);
        });
    }
    
    // Display messages with image support
    function displayMessages() {
        if (messages.length === 0) {
            noMessages.style.display = 'block';
            messagesContainer.innerHTML = '';
            return;
        }
        
        noMessages.style.display = 'none';
        
        // Group messages by sender and time
        const groupedMessages = [];
        let currentGroup = null;
        
        messages.forEach((message, index) => {
            const messageTime = message.timestamp ? new Date(message.timestamp) : new Date();
            const prevMessage = messages[index - 1];
            const prevTime = prevMessage && prevMessage.timestamp ? new Date(prevMessage.timestamp) : new Date(0);
            
            const timeDiff = Math.abs(messageTime - prevTime) / (1000 * 60); // minutes
            
            if (!prevMessage || 
                prevMessage.senderId !== message.senderId || 
                timeDiff > 5) {
                // Start new group
                currentGroup = {
                    senderId: message.senderId,
                    senderName: message.senderName,
                    senderAvatar: message.senderAvatar,
                    messages: [message]
                };
                groupedMessages.push(currentGroup);
            } else {
                // Add to current group
                currentGroup.messages.push(message);
            }
        });
        
        // Render grouped messages
        messagesContainer.innerHTML = '';
        
        groupedMessages.forEach(group => {
            const groupDiv = document.createElement('div');
            groupDiv.className = 'message-group';
            
            // First message in group
            const firstMessage = group.messages[0];
            const firstMessageTime = firstMessage.timestamp ? new Date(firstMessage.timestamp) : new Date();
            
            groupDiv.innerHTML = `
                <div class="message-header">
                    <img src="${group.senderAvatar}" alt="${group.senderName}" class="message-avatar">
                    <span class="message-sender">${group.senderName}</span>
                    <span class="message-time">${formatTime(firstMessageTime)}</span>
                </div>
                <div class="message-content">
                    ${group.messages.map(msg => {
                        const messageTime = msg.timestamp ? new Date(msg.timestamp) : new Date();
                        
                        let replyHtml = '';
                        if (msg.replyTo) {
                            const repliedMessage = messages.find(m => m.id === msg.replyTo);
                            if (repliedMessage) {
                                replyHtml = `
                                    <div class="reply-to">
                                        Replying to <span class="reply-sender">${repliedMessage.senderName}</span>: 
                                        ${repliedMessage.text ? (repliedMessage.text.length > 50 ? 
                                            repliedMessage.text.substring(0, 50) + '...' : 
                                            repliedMessage.text) : '📷 Image'}
                                    </div>
                                `;
                            }
                        }
                        
                        // Check if this is a temporary message
                        const isTemp = tempMessages.has(msg.id);
                        const isUploading = msg.status === 'uploading';
                        
                        if (msg.imageUrl) {
                            // Image message
                            return `
                                <div class="message-text">
                                    ${replyHtml}
                                    <div class="message-image-container" style="position: relative;">
                                        <img src="${msg.imageUrl}" 
                                             alt="Shared image" 
                                             class="message-image"
                                             style="max-width: 300px; max-height: 300px; border-radius: 8px; cursor: pointer;"
                                             onclick="openImageModal('${msg.imageUrl}')">
                                        ${isUploading ? `
                                            <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); 
                                                   background: rgba(0,0,0,0.7); color: white; padding: 8px 12px; border-radius: 20px;
                                                   font-size: 12px; display: flex; align-items: center; gap: 6px;">
                                                <i class="fas fa-spinner fa-spin"></i> Uploading...
                                            </div>
                                        ` : ''}
                                    </div>
                                    ${isTemp ? '<div style="font-size: 11px; color: #999; margin-top: 4px;">Sending...</div>' : ''}
                                </div>
                            `;
                        } else {
                            // Text message
                            return `
                                <div class="message-text">
                                    ${replyHtml}
                                    ${msg.text || ''}
                                    ${isTemp ? '<div style="font-size: 11px; color: #999; margin-top: 4px;">Sending...</div>' : ''}
                                </div>
                            `;
                        }
                    }).join('')}
                </div>
            `;
            
            messagesContainer.appendChild(groupDiv);
        });
        
        // Scroll to bottom
        setTimeout(() => {
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }, 100);
    }
    
    // Send message function
    async function sendMessage() {
        const text = messageInput.value.trim();
        
        if (!text) return;
        
        sendBtn.disabled = true;
        sendBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        
        try {
            await groupChat.sendMessage(groupId, text);
            
            // Clear input
            messageInput.value = '';
            messageInput.style.height = 'auto';
            messageInput.dispatchEvent(new Event('input'));
            
        } catch (error) {
            console.error('Error sending message:', error);
            alert('Failed to send message. Please try again.');
        } finally {
            sendBtn.disabled = false;
            sendBtn.innerHTML = 'Send';
        }
    }
    
    // Format time function
    function formatTime(date) {
        if (!(date instanceof Date)) {
            date = new Date(date);
        }
        
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMins / 60);
        const diffDays = Math.floor(diffHours / 24);
        
        if (diffDays > 0) {
            return `${diffDays}d ago`;
        } else if (diffHours > 0) {
            return `${diffHours}h ago`;
        } else if (diffMins > 0) {
            return `${diffMins}m ago`;
        } else {
            return 'just now';
        }
    }
    
    // Clean up on page unload
    window.addEventListener('beforeunload', () => {
        groupChat.cleanup();
    });
    
    // Add image modal function to window
    window.openImageModal = function(imageUrl) {
        const modal = document.createElement('div');
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.9);
            z-index: 10000;
            display: flex;
            justify-content: center;
            align-items: center;
        `;
        
        modal.innerHTML = `
            <div style="position: relative; max-width: 90%; max-height: 90%;">
                <img src="${imageUrl}" alt="Full size" style="max-width: 100%; max-height: 90vh; border-radius: 8px;">
                <button style="position: absolute; top: 20px; right: 20px; background: rgba(0,0,0,0.5); color: white; 
                        border: none; border-radius: 50%; width: 40px; height: 40px; font-size: 20px; cursor: pointer;">
                    ×
                </button>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        modal.querySelector('button').addEventListener('click', () => {
            document.body.removeChild(modal);
        });
        
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                document.body.removeChild(modal);
            }
        });
    };
}

// Make groupChat available globally for debugging
window.groupChat = groupChat;

// Helper function for logout
window.groupLogout = function() {
    groupChat.logout();
};