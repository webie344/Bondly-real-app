// stream.js - Video Streaming functionality with Cloudinary integration + Social Features
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
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
    deleteDoc,
    serverTimestamp,
    onSnapshot,
    orderBy,
    increment,
    arrayUnion
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { 
    getAuth, 
    onAuthStateChanged,
    signOut 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

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

// Cloudinary configuration
const cloudinaryConfig = {
    cloudName: "ddtdqrh1b",
    uploadPreset: "profile-pictures",
    apiUrl: "https://api.cloudinary.com/v1_1"
};

// Global variables
let currentUser = null;

// Social features tracking
let likedStreams = new Set();
let viewedStreams = new Set();

// Supported video formats
const SUPPORTED_VIDEO_FORMATS = [
    'video/mp4', 'video/quicktime', 'video/x-m4v', 'video/3gpp', 'video/3gpp2',
    'video/mpeg', 'video/webm', 'video/ogg', 'video/x-msvideo', 'video/x-matroska',
    'video/mp2t', 'video/h264', 'video/hevc', 'video/avi', 'video/x-flv',
    'video/x-ms-wmv', 'video/x-ms-asf', 'video/mp4v-es', 'video/mj2',
    'video/x-mpeg', 'video/mp2p', 'video/mp2t', 'video/MP2T'
];

// Supported file extensions
const SUPPORTED_EXTENSIONS = [
    '.mp4', '.mov', '.m4v', '.3gp', '.3g2', '.mpeg', '.mpg', '.webm', '.ogg',
    '.avi', '.mkv', '.ts', '.mts', '.m2ts', '.flv', '.f4v', '.wmv', '.mpg', '.mpeg',
    '.qt', '.mxf', '.m2v', '.m4p', '.m4b', '.mp2', '.mpv', '.mpe', '.m1v', '.m2p',
    '.divx', '.xvid', '.vob', '.mod', '.tod', '.mts', '.m2t', '.m2ts'
];

// Problematic formats that often need conversion
const PROBLEMATIC_FORMATS = [
    'video/quicktime',
    'video/x-msvideo',
    'video/x-matroska',
    'video/x-ms-wmv',
    'video/x-flv',
    'video/3gpp',
    'video/3gpp2'
];

// Stream Manager Class with Cloudinary integration
class StreamManager {
    constructor() {
        this.currentStreams = new Map();
        this.streamListeners = new Map();
        this.viewerListeners = new Map();
        this.commentListeners = new Map();
    }

    // Create a new stream with Cloudinary upload
    async createStream(videoData, headline, description, category, isLocalFile = false) {
        try {
            if (!currentUser) {
                throw new Error('You must be logged in to create a stream');
            }

            // Get user data
            const userRef = doc(db, 'users', currentUser.uid);
            const userSnap = await getDoc(userRef);
            
            if (!userSnap.exists()) {
                throw new Error('User profile not found');
            }

            const userData = userSnap.data();

            let streamData = {};

            if (isLocalFile && videoData instanceof File) {
                // Enhanced validation for downloaded videos
                await this.validateVideoFile(videoData);
                
                // Upload to Cloudinary
                const videoUrl = await this.uploadVideoToCloudinary(videoData);
                
                streamData = {
                    videoType: 'cloudinary',
                    videoUrl: videoUrl,
                    videoMimeType: videoData.type,
                    videoFileName: videoData.name,
                    videoFileSize: videoData.size,
                    videoFormat: this.getVideoFormat(videoData),
                    headline: headline,
                    description: description || '',
                    category: category,
                    authorId: currentUser.uid,
                    authorName: userData.name || 'Anonymous',
                    authorImage: userData.profileImage || 'images-default-profile.jpg',
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp(),
                    viewCount: 0,
                    currentViewers: 0,
                    likes: 0,
                    commentsCount: 0,
                    isActive: true,
                    sortTimestamp: new Date().getTime(),
                    embedUrl: null,
                    thumbnailUrl: 'images-defaultse-profile.jpg',
                    isPhoneVideo: this.isLikelyPhoneVideo(videoData),
                    isPortraitVideo: await this.isPortraitVideo(videoData),
                    needsConversion: this.needsConversion(videoData)
                };
            } else {
                throw new Error('Only file uploads are supported');
            }

            const streamRef = await addDoc(collection(db, 'streams'), streamData);
            
            return streamRef.id;
        } catch (error) {
            throw error;
        }
    }

    // Check if video needs conversion
    needsConversion(file) {
        const needsConversion = PROBLEMATIC_FORMATS.includes(file.type) || 
                               this.isDownloadedVideo(file) ||
                               file.name.toLowerCase().includes('discord') ||
                               file.name.toLowerCase().includes('whatsapp') ||
                               file.name.toLowerCase().includes('telegram') ||
                               file.name.toLowerCase().includes('social') ||
                               file.name.toLowerCase().includes('downloaded');
        
        return needsConversion;
    }

    // Check if video is likely downloaded from social media
    isDownloadedVideo(file) {
        const downloadedIndicators = [
            file.name.match(/(discord|whatsapp|telegram|instagram|facebook|twitter|tiktok|snapchat)/i),
            file.name.match(/(downloaded|save|received|forwarded)/i),
            file.size < 10000000 && file.type === 'video/mp4',
            file.name.includes('-') && file.name.split('-').length > 3,
        ];
        
        return downloadedIndicators.some(indicator => indicator);
    }

    // Check if video is portrait orientation
    async isPortraitVideo(file) {
        return new Promise((resolve) => {
            const video = document.createElement('video');
            video.src = URL.createObjectURL(file);
            video.crossOrigin = 'anonymous';
            
            video.addEventListener('loadedmetadata', () => {
                const isPortrait = video.videoHeight > video.videoWidth;
                URL.revokeObjectURL(video.src);
                resolve(isPortrait);
            });
            
            video.addEventListener('error', () => {
                URL.revokeObjectURL(video.src);
                resolve(false);
            });
            
            setTimeout(() => {
                URL.revokeObjectURL(video.src);
                resolve(false);
            }, 5000);
            
            video.load();
        });
    }

    // Validate video file for phone compatibility
    async validateVideoFile(file) {
        // Check file size (increased to 1GB for phone videos)
        const maxSize = 1024 * 1024 * 1024;
        if (file.size > maxSize) {
            throw new Error('Video file must be smaller than 1GB');
        }

        // Check if file is a video
        if (!file.type.startsWith('video/') && !this.isLikelyVideoFile(file)) {
            throw new Error('Please select a valid video file');
        }

        // Check supported formats
        const isSupportedFormat = SUPPORTED_VIDEO_FORMATS.some(format => 
            file.type === format || 
            file.type.includes(format.replace('video/', ''))
        );

        const isSupportedExtension = SUPPORTED_EXTENSIONS.some(ext => 
            file.name.toLowerCase().endsWith(ext)
        );

        if (!isSupportedFormat && !isSupportedExtension) {
            // We'll still try to upload as Cloudinary can handle many formats
        }

        // Warn about problematic formats but don't block them
        if (this.needsConversion(file)) {
            // We'll still try to upload with enhanced transformations
        }

        return true;
    }

    // Check if file is likely a video based on name and properties
    isLikelyVideoFile(file) {
        const videoIndicators = [
            file.name.toLowerCase().match(/\.(mp4|mov|avi|mkv|wmv|flv|webm|3gp|m4v|mpg|mpeg)$/),
            file.size > 100000,
            file.type === '' || file.type === 'application/octet-stream'
        ];
        
        return videoIndicators.some(indicator => indicator);
    }

    // Get video format information
    getVideoFormat(file) {
        return {
            mimeType: file.type,
            extension: file.name.split('.').pop().toLowerCase(),
            isCommonPhoneFormat: this.isCommonPhoneFormat(file)
        };
    }

    // Check if video is from common phone formats
    isCommonPhoneFormat(file) {
        const phoneFormats = [
            'video/mp4',
            'video/quicktime',
            'video/x-m4v',
            'video/3gpp',
            'video/3gpp2',
            'video/avi',
            'video/x-msvideo'
        ];
        
        return phoneFormats.includes(file.type) || 
               file.name.toLowerCase().includes('iphone') ||
               file.name.toLowerCase().includes('android') ||
               file.name.toLowerCase().includes('movi') ||
               file.name.toLowerCase().includes('vid_') ||
               file.name.toLowerCase().includes('camera') ||
               file.name.toLowerCase().includes('record');
    }

    // Check if video is likely from a phone
    isLikelyPhoneVideo(file) {
        return this.isCommonPhoneFormat(file) || 
               file.name.match(/(IMG_|VID_|PXL_|MVIMG_|CAM_|REC_)/i) !== null ||
               file.name.toLowerCase().includes('whatsapp') ||
               file.name.toLowerCase().includes('camera') ||
               file.type === 'video/quicktime' ||
               file.type === 'video/mp4' ||
               file.type === 'video/3gpp';
    }

    // Upload video to Cloudinary
    async uploadVideoToCloudinary(videoFile) {
        const formData = new FormData();
        formData.append('file', videoFile);
        formData.append('upload_preset', cloudinaryConfig.uploadPreset);
        formData.append('resource_type', 'video');
        
        try {
            const response = await fetch(
                `https://api.cloudinary.com/v1_1/${cloudinaryConfig.cloudName}/video/upload`,
                {
                    method: 'POST',
                    body: formData
                }
            );
            
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Video upload failed: ${response.statusText}`);
            }
            
            const data = await response.json();
            if (!data.secure_url) {
                throw new Error('Invalid response from Cloudinary - no video URL received');
            }
            
            return data.secure_url;
        } catch (error) {
            throw new Error(`Video upload failed: ${error.message}`);
        }
    }

    // Get all streams
    async getStreams(category = 'all') {
        try {
            const streamsQuery = collection(db, 'streams');
            const streamsSnap = await getDocs(streamsQuery);
            const streams = [];
            
            streamsSnap.forEach(doc => {
                const data = doc.data();
                if (data.isActive !== false) {
                    streams.push({
                        id: doc.id,
                        ...data,
                        createdAt: data.createdAt || new Date(),
                        updatedAt: data.updatedAt || new Date(),
                        timestamp: data.createdAt?.toDate?.()?.getTime() || 
                                  data.sortTimestamp || 
                                  new Date().getTime()
                    });
                }
            });

            let filteredStreams = streams;
            if (category !== 'all') {
                filteredStreams = streams.filter(stream => stream.category === category);
            }

            filteredStreams.sort((a, b) => {
                const timeA = a.timestamp || 0;
                const timeB = b.timestamp || 0;
                return timeB - timeA;
            });

            return filteredStreams;
        } catch (error) {
            return [];
        }
    }

    // Add viewer to stream
    async addViewer(streamId) {
        if (!currentUser) return;

        try {
            const streamRef = doc(db, 'streams', streamId);
            const viewerRef = doc(db, 'streams', streamId, 'viewers', currentUser.uid);
            
            await setDoc(viewerRef, {
                userId: currentUser.uid,
                joinedAt: serverTimestamp(),
                lastActive: serverTimestamp()
            });

            await updateDoc(streamRef, {
                currentViewers: increment(1),
                viewCount: increment(1),
                updatedAt: serverTimestamp()
            });

            this.currentStreams.set(streamId, {
                viewerRef: viewerRef,
                lastUpdate: Date.now()
            });

        } catch (error) {
            // Silently handle error
        }
    }

    // Remove viewer from stream
    async removeViewer(streamId) {
        if (!currentUser) return;

        try {
            const viewerRef = doc(db, 'streams', streamId, 'viewers', currentUser.uid);
            
            await setDoc(viewerRef, {
                userId: currentUser.uid,
                leftAt: serverTimestamp()
            }, { merge: true });

            const streamRef = doc(db, 'streams', streamId);
            await updateDoc(streamRef, {
                currentViewers: increment(-1),
                updatedAt: serverTimestamp()
            });

            this.currentStreams.delete(streamId);

        } catch (error) {
            // Silently handle error
        }
    }

    // LIKE FUNCTIONALITY
    async handleLike(streamId, likeButton) {
        if (!currentUser) return;

        // Prevent double liking
        if (likedStreams.has(streamId)) {
            return;
        }

        try {
            const streamRef = doc(db, 'streams', streamId);
            const streamSnap = await getDoc(streamRef);
            
            if (streamSnap.exists()) {
                const stream = streamSnap.data();
                const newLikes = (stream.likes || 0) + 1;
                
                // Update Firestore
                await updateDoc(streamRef, {
                    likes: newLikes,
                    updatedAt: serverTimestamp()
                });

                // Update UI immediately
                const likeCount = likeButton.querySelector('.like-count');
                const likeIcon = likeButton.querySelector('i');
                
                if (likeCount) {
                    likeCount.textContent = newLikes;
                }
                
                if (likeIcon) {
                    likeIcon.className = 'fas fa-heart';
                }
                
                likeButton.classList.add('liked');
                
                // Mark as liked to prevent double likes
                likedStreams.add(streamId);
                saveLikedStreams();
            }
        } catch (error) {
            // Silently handle error
        }
    }

    // COMMENT FUNCTIONALITY
    async toggleComments(streamId) {
        const commentsSection = document.getElementById(`comments-${streamId}`);
        if (commentsSection) {
            if (commentsSection.style.display === 'none') {
                commentsSection.style.display = 'block';
                await this.loadComments(streamId);
            } else {
                commentsSection.style.display = 'none';
            }
        }
    }

    async loadComments(streamId) {
        const commentsList = document.getElementById(`comments-list-${streamId}`);
        if (!commentsList) return;

        try {
            const commentsQuery = query(
                collection(db, 'streams', streamId, 'comments'), 
                orderBy('createdAt', 'asc')
            );
            const commentsSnap = await getDocs(commentsQuery);
            
            commentsList.innerHTML = '';
            
            if (commentsSnap.empty) {
                commentsList.innerHTML = '<div class="no-comments">No comments yet</div>';
                return;
            }

            const userIds = new Set();
            commentsSnap.forEach(doc => {
                const comment = doc.data();
                userIds.add(comment.userId);
            });

            const usersData = await this.getUsersData([...userIds]);

            commentsSnap.forEach(doc => {
                const comment = doc.data();
                const user = usersData[comment.userId] || {};
                const commentElement = this.createCommentElement(comment, user);
                commentsList.appendChild(commentElement);
            });
        } catch (error) {
            commentsList.innerHTML = '<div class="error">Error loading comments</div>';
        }
    }

    createCommentElement(comment, user) {
        const commentDiv = document.createElement('div');
        commentDiv.className = 'comment-item';
        commentDiv.innerHTML = `
            <div class="comment-header">
                <img src="${user.profileImage || 'images-defaultse-profile.jpg'}" 
                     alt="${user.name}" class="comment-avatar">
                <div class="comment-info">
                    <strong>${user.name || 'Unknown User'}</strong>
                    <span class="comment-time">${formatTime(comment.createdAt)}</span>
                </div>
            </div>
            <div class="comment-text">${comment.text}</div>
        `;
        return commentDiv;
    }

    async handleAddComment(streamId) {
        if (!currentUser) return;

        const commentInput = document.querySelector(`.comment-input[data-stream-id="${streamId}"]`);
        if (!commentInput) return;

        const commentText = commentInput.value.trim();
        if (!commentText) {
            alert('Please enter a comment');
            return;
        }

        try {
            // Add comment to subcollection
            await addDoc(collection(db, 'streams', streamId, 'comments'), {
                userId: currentUser.uid,
                text: commentText,
                createdAt: serverTimestamp()
            });

            // Update comments count
            const streamRef = doc(db, 'streams', streamId);
            await updateDoc(streamRef, {
                commentsCount: increment(1),
                updatedAt: serverTimestamp()
            });

            // Clear input and reload comments
            commentInput.value = '';
            await this.loadComments(streamId);

            // Update comment count in UI
            const commentCount = document.querySelector(`.comment-btn[data-stream-id="${streamId}"] .comment-count`);
            if (commentCount) {
                const currentCount = parseInt(commentCount.textContent) || 0;
                commentCount.textContent = currentCount + 1;
            }

        } catch (error) {
            alert('Error adding comment: ' + error.message);
        }
    }

    async getUsersData(userIds) {
        const usersData = {};
        
        for (const userId of userIds) {
            try {
                const userRef = doc(db, 'users', userId);
                const userSnap = await getDoc(userRef);
                if (userSnap.exists()) {
                    usersData[userId] = userSnap.data();
                }
            } catch (error) {
                // Silently handle error
            }
        }
        
        return usersData;
    }

    // Listen to stream updates
    listenToStreams(callback, category = 'all') {
        try {
            const streamsQuery = collection(db, 'streams');
            
            const unsubscribe = onSnapshot(streamsQuery, (snapshot) => {
                const streams = [];
                snapshot.forEach(doc => {
                    const data = doc.data();
                    if (data.isActive !== false) {
                        streams.push({
                            id: doc.id,
                            ...data,
                            timestamp: data.createdAt?.toDate?.()?.getTime() || 
                                      data.sortTimestamp || 
                                      new Date().getTime()
                        });
                    }
                });

                let filteredStreams = streams;
                if (category !== 'all') {
                    filteredStreams = streams.filter(stream => stream.category === category);
                }

                filteredStreams.sort((a, b) => {
                    const timeA = a.timestamp || 0;
                    const timeB = b.timestamp || 0;
                    return timeB - timeA;
                });

                callback(filteredStreams);
            }, (error) => {
                callback([]);
            });

            this.streamListeners.set(callback, unsubscribe);
            return unsubscribe;

        } catch (error) {
            return () => {};
        }
    }

    // Listen to viewer count for a specific stream
    listenToViewerCount(streamId, callback) {
        try {
            const streamRef = doc(db, 'streams', streamId);
            
            const unsubscribe = onSnapshot(streamRef, (doc) => {
                if (doc.exists()) {
                    const streamData = doc.data();
                    callback(streamData.currentViewers || 0);
                }
            }, (error) => {
                callback(0);
            });

            this.viewerListeners.set(`${streamId}_${callback}`, unsubscribe);
            return unsubscribe;

        } catch (error) {
            return () => {};
        }
    }

    // Get total viewers across all streams
    async getTotalViewers() {
        try {
            const streams = await this.getStreams('all');
            return streams.reduce((total, stream) => total + (stream.currentViewers || 0), 0);
        } catch (error) {
            return 0;
        }
    }

    // Initialize activity tracking for current user
    initializeActivityTracking() {
        const activityInterval = setInterval(() => {
            this.currentStreams.forEach((streamInfo, streamId) => {
                if (Date.now() - streamInfo.lastUpdate > 25000) {
                    this.updateViewerActivity(streamId);
                    streamInfo.lastUpdate = Date.now();
                }
            });
        }, 30000);

        window.addEventListener('beforeunload', () => {
            clearInterval(activityInterval);
            this.currentStreams.forEach((streamInfo, streamId) => {
                this.removeViewer(streamId);
            });
        });

        this.activityInterval = activityInterval;
    }

    async updateViewerActivity(streamId) {
        if (!currentUser) return;

        try {
            const viewerRef = doc(db, 'streams', streamId, 'viewers', currentUser.uid);
            await updateDoc(viewerRef, {
                lastActive: serverTimestamp()
            });
        } catch (error) {
            // Silently handle error
        }
    }

    // Clean up all listeners
    cleanup() {
        if (this.activityInterval) {
            clearInterval(this.activityInterval);
        }

        this.streamListeners.forEach(unsubscribe => unsubscribe());
        this.viewerListeners.forEach(unsubscribe => unsubscribe());
        this.streamListeners.clear();
        this.viewerListeners.clear();
        
        this.currentStreams.forEach((streamInfo, streamId) => {
            this.removeViewer(streamId);
        });
        this.currentStreams.clear();
    }
}

// Initialize Stream Manager
const streamManager = new StreamManager();

// Enhanced Video Player with better error handling for downloaded videos
class VideoPlayer {
    constructor() {
        this.modal = null;
        this.currentStreamId = null;
        this.currentVideoElement = null;
        this.init();
    }

    init() {
        this.createModal();
        this.setupEventListeners();
    }

    createModal() {
        const existingModal = document.getElementById('videoPlayerModal');
        if (existingModal) {
            existingModal.remove();
        }

        this.modal = document.createElement('div');
        this.modal.id = 'videoPlayerModal';
        this.modal.className = 'video-player-modal';
        this.modal.innerHTML = `
            <div class="video-player-container">
                <div class="video-player-header">
                    <h3 class="video-player-title" id="videoPlayerTitle">Stream Video</h3>
                    <button class="close-video-player" id="closeVideoPlayer">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                
                <div class="video-player-content" id="videoPlayerContent">
                    <!-- Video will be loaded here -->
                </div>

                <div class="video-player-info">
                    <div class="video-viewers">
                        <i class="fas fa-eye"></i>
                        <span id="videoPlayerViewers">0</span> watching now
                    </div>
                    <div class="video-description" id="videoPlayerDescription"></div>
                    <div class="video-format-info" id="videoFormatInfo"></div>
                </div>

                <!-- Social Actions -->
                <div class="social-actions-container" id="socialActionsContainer">
                    <div class="stream-actions">
                        <button class="stream-action like-btn" id="modalLikeBtn">
                            <i class="far fa-heart"></i> 
                            <span class="like-count">0</span>
                        </button>
                        <button class="stream-action comment-btn" id="modalCommentBtn">
                            <i class="far fa-comment"></i> 
                            <span class="comment-count">0</span>
                        </button>
                    </div>
                    
                    <div class="comments-section" id="modalCommentsSection" style="display: none;">
                        <div class="add-comment">
                            <input type="text" class="comment-input" id="modalCommentInput" placeholder="Write a comment...">
                            <button class="send-comment-btn" id="modalSendComment">
                                <i class="fas fa-paper-plane"></i> Send
                            </button>
                        </div>
                        <div class="comments-list" id="modalCommentsList"></div>
                    </div>
                </div>

                <div class="video-player-controls">
                    <button class="video-control-btn" id="reloadVideo">
                        <i class="fas fa-redo"></i> Reload Video
                    </button>
                    <button class="video-control-btn" id="toggleFullscreen">
                        <i class="fas fa-expand"></i> Fullscreen
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(this.modal);
        this.addStyles();
    }

    addStyles() {
        if (!document.getElementById('videoPlayerStyles')) {
            const styles = document.createElement('style');
            styles.id = 'videoPlayerStyles';
            styles.textContent = `
                .video-player-modal {
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    background: rgba(0, 0, 0, 0.95);
                    z-index: 10000;
                    display: none;
                    justify-content: center;
                    align-items: center;
                    backdrop-filter: blur(5px);
                    padding: 20px;
                    box-sizing: border-box;
                }
                
                .video-player-container {
                    background: var(--bg-light);
                    border-radius: 15px;
                    padding: 20px;
                    max-width: 95vw;
                    max-height: 95vh;
                    width: 1000px;
                    height: auto;
                    position: relative;
                    box-shadow: 0 20px 40px rgba(0,0,0,0.3);
                    display: flex;
                    flex-direction: column;
                }
                
                .video-player-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 15px;
                    flex-shrink: 0;
                }
                
                .video-player-title {
                    color: var(--text-dark);
                    font-size: 20px;
                    font-weight: 600;
                    margin: 0;
                    flex: 1;
                }
                
                .close-video-player {
                    background: none;
                    border: none;
                    color: var(--text-light);
                    font-size: 20px;
                    cursor: pointer;
                    padding: 8px;
                    border-radius: 50%;
                    transition: all 0.3s ease;
                }
                
                .close-video-player:hover {
                    background: var(--bg-dark);
                    color: var(--text-dark);
                }
                
                .video-player-content {
                    margin-bottom: 15px;
                    flex: 1;
                    min-height: 400px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    background: #000;
                    border-radius: 10px;
                    overflow: hidden;
                    position: relative;
                }
                
                .video-embed-container {
                    position: relative;
                    width: 100%;
                    height: 0;
                    padding-bottom: 56.25%;
                    border-radius: 10px;
                    overflow: hidden;
                    background: #000;
                }
                
                .video-embed-container iframe {
                    position: absolute;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    border: none;
                    border-radius: 8px;
                }
                
                .cloudinary-video-container {
                    width: 100%;
                    height: 100%;
                    border-radius: 10px;
                    overflow: hidden;
                    background: #000;
                    position: relative;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }
                
                .cloudinary-video-container video {
                    width: 100%;
                    height: 100%;
                    max-height: 70vh;
                    border-radius: 8px;
                    display: block;
                    object-fit: contain;
                }
                
                .cloudinary-video-container video::-webkit-media-controls-panel {
                    display: flex !important;
                    opacity: 1 !important;
                    visibility: visible !important;
                }
                
                .cloudinary-video-container video::-webkit-media-controls {
                    display: flex !important;
                    opacity: 1 !important;
                }
                
                .cloudinary-video-container video::-webkit-media-controls-play-button,
                .cloudinary-video-container video::-webkit-media-controls-timeline,
                .cloudinary-video-container video::-webkit-media-controls-current-time-display,
                .cloudinary-video-container video::-webkit-media-controls-time-remaining-display,
                .cloudinary-video-container video::-webkit-media-controls-mute-button,
                .cloudinary-video-container video::-webkit-media-controls-volume-slider,
                .cloudinary-video-container video::-webkit-media-controls-fullscreen-button {
                    display: flex !important;
                    opacity: 1 !important;
                }
                
                .video-loading {
                    position: absolute;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    background: rgba(0, 0, 0, 0.8);
                    color: white;
                    padding: 20px;
                    border-radius: 10px;
                    text-align: center;
                    z-index: 10;
                }
                
                .video-error {
                    position: absolute;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    background: rgba(255, 0, 0, 0.8);
                    color: white;
                    padding: 20px;
                    border-radius: 10px;
                    text-align: center;
                    z-index: 10;
                    width: 80%;
                    max-width: 400px;
                }
                
                .video-retry-button {
                    background: var(--accent-color);
                    color: white;
                    border: none;
                    padding: 10px 20px;
                    border-radius: 5px;
                    cursor: pointer;
                    margin-top: 10px;
                    font-weight: 600;
                }
                
                .video-retry-button:hover {
                    background: var(--accent-dark);
                }
                
                .video-placeholder {
                    position: relative;
                    width: 100%;
                    height: 400px;
                    display: flex;
                    flex-direction: column;
                    justify-content: center;
                    align-items: center;
                    background: #1a1a1a;
                    color: white;
                    cursor: pointer;
                    transition: background-color 0.3s ease;
                    border-radius: 10px;
                }
                
                .video-placeholder:hover {
                    background: #2a2a2a;
                }
                
                .video-placeholder i {
                    font-size: 60px;
                    margin-bottom: 15px;
                    color: var(--accent-color);
                }
                
                .video-placeholder p {
                    margin: 0;
                    font-size: 16px;
                    font-weight: 500;
                }
                
                .video-player-info {
                    padding: 15px;
                    background: var(--bg-dark);
                    border-radius: 8px;
                    margin-bottom: 15px;
                    flex-shrink: 0;
                }
                
                .video-viewers {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    color: var(--accent-color);
                    font-weight: 600;
                    margin-bottom: 10px;
                    font-size: 14px;
                }
                
                .video-description {
                    color: var(--text-light);
                    font-size: 14px;
                    line-height: 1.4;
                    margin-bottom: 10px;
                }
                
                .video-format-info {
                    color: var(--text-light);
                    font-size: 12px;
                    opacity: 0.7;
                }
                
                .social-actions-container {
                    margin-bottom: 15px;
                    flex-shrink: 0;
                }
                
                .stream-actions {
                    display: flex;
                    gap: 15px;
                    margin-bottom: 15px;
                    padding: 12px;
                    background: var(--bg-dark);
                    border-radius: 8px;
                }

                .stream-action {
                    background: none;
                    border: none;
                    color: var(--text-light);
                    cursor: pointer;
                    padding: 10px 15px;
                    border-radius: 8px;
                    transition: all 0.3s ease;
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    font-size: 14px;
                    font-weight: 500;
                }

                .stream-action:hover {
                    background: rgba(255, 255, 255, 0.1);
                    color: var(--text-dark);
                }

                .stream-action.liked {
                    color: #e74c3c;
                }

                .stream-action.liked i {
                    color: #e74c3c;
                }

                .stream-action i {
                    font-size: 16px;
                }

                .comments-section {
                    padding: 15px;
                    background: var(--bg-dark);
                    border-radius: 8px;
                    margin-top: 10px;
                }

                .add-comment {
                    display: flex;
                    gap: 10px;
                    margin-bottom: 15px;
                }

                .comment-input {
                    flex: 1;
                    padding: 10px 12px;
                    border: 1px solid var(--border-color);
                    border-radius: 8px;
                    background: var(--bg-light);
                    color: var(--text-dark);
                    font-size: 14px;
                }

                .comment-input:focus {
                    outline: none;
                    border-color: var(--accent-color);
                }

                .comment-input::placeholder {
                    color: var(--text-light);
                }

                .send-comment-btn {
                    background: var(--accent-color);
                    color: white;
                    border: none;
                    padding: 10px 15px;
                    border-radius: 8px;
                    cursor: pointer;
                    font-size: 14px;
                    display: flex;
                    align-items: center;
                    gap: 5px;
                }

                .send-comment-btn:hover {
                    background: var(--accent-dark);
                }

                .comments-list {
                    max-height: 200px;
                    overflow-y: auto;
                }

                .comment-item {
                    padding: 10px;
                    border-bottom: 1px solid var(--border-color);
                }

                .comment-item:last-child {
                    border-bottom: none;
                }

                .comment-header {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    margin-bottom: 5px;
                }

                .comment-avatar {
                    width: 24px;
                    height: 24px;
                    border-radius: 50%;
                    object-fit: cover;
                }

                .comment-info {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }

                .comment-info strong {
                    font-size: 12px;
                    color: var(--text-dark);
                }

                .comment-time {
                    font-size: 10px;
                    color: var(--text-light);
                }

                .comment-text {
                    font-size: 12px;
                    color: var(--text-dark);
                    line-height: 1.4;
                }

                .no-comments {
                    text-align: center;
                    color: var(--text-light);
                    font-style: italic;
                    padding: 20px;
                }

                .error {
                    color: #e74c3c;
                    text-align: center;
                    padding: 15px;
                }

                .video-player-controls {
                    display: flex;
                    gap: 10px;
                    flex-shrink: 0;
                }
                
                .video-control-btn {
                    background: var(--bg-dark);
                    color: var(--text-light);
                    border: none;
                    padding: 10px 15px;
                    border-radius: 5px;
                    cursor: pointer;
                    font-size: 14px;
                    transition: all 0.3s ease;
                    display: flex;
                    align-items: center;
                    gap: 5px;
                    flex: 1;
                    justify-content: center;
                }
                
                .video-control-btn:hover {
                    background: var(--accent-color);
                    color: white;
                }

                .video-player-modal.fullscreen {
                    padding: 0;
                }
                
                .video-player-modal.fullscreen .video-player-container {
                    max-width: 100vw;
                    max-height: 100vh;
                    width: 100vw;
                    height: 100vh;
                    border-radius: 0;
                    padding: 20px;
                }
                
                .video-player-modal.fullscreen .cloudinary-video-container video {
                    max-height: 85vh;
                }
                
                @media (max-width: 768px) {
                    .video-player-modal {
                        padding: 10px;
                    }
                    
                    .video-player-container {
                        margin: 0;
                        padding: 15px;
                        width: 100%;
                    }
                    
                    .video-player-title {
                        font-size: 18px;
                    }
                    
                    .video-placeholder i {
                        font-size: 40px;
                    }
                    
                    .video-placeholder p {
                        font-size: 14px;
                    }

                    .video-preview-container {
                        height: 150px;
                    }

                    .preview-play-button {
                        width: 50px;
                        height: 50px;
                        font-size: 18px;
                    }
                    
                    .video-player-controls {
                        flex-direction: column;
                    }

                    .stream-actions {
                        flex-direction: column;
                        gap: 10px;
                    }

                    .comments-section {
                        padding: 12px;
                    }
                    
                    .cloudinary-video-container video {
                        max-height: 60vh;
                    }
                }
            `;
            document.head.appendChild(styles);
        }
    }

    setupEventListeners() {
        const closeBtn = document.getElementById('closeVideoPlayer');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                this.close();
            });
        }

        const reloadBtn = document.getElementById('reloadVideo');
        if (reloadBtn) {
            reloadBtn.addEventListener('click', () => {
                this.reloadCurrentVideo();
            });
        }

        const fullscreenBtn = document.getElementById('toggleFullscreen');
        if (fullscreenBtn) {
            fullscreenBtn.addEventListener('click', () => {
                this.toggleFullscreen();
            });
        }

        this.modal.addEventListener('click', (e) => {
            if (e.target === this.modal) {
                this.close();
            }
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.modal.style.display === 'flex') {
                if (this.modal.classList.contains('fullscreen')) {
                    this.toggleFullscreen();
                } else {
                    this.close();
                }
            }
        });
    }

    open(stream) {
        if (!stream) {
            return;
        }

        this.currentStreamId = stream.id;

        // Update modal content
        document.getElementById('videoPlayerTitle').textContent = stream.headline;
        document.getElementById('videoPlayerDescription').textContent = stream.description || 'No description available';
        document.getElementById('videoPlayerViewers').textContent = stream.currentViewers || 0;

        // Enhanced format info
        const formatInfo = document.getElementById('videoFormatInfo');
        let formatText = '';
        
        if (stream.videoType === 'cloudinary') {
            if (stream.isPhoneVideo) {
                formatText = `📱 Phone Video • ${stream.videoFileName || 'Uploaded video'}`;
            } else if (stream.needsConversion) {
                formatText = `📹 Uploaded Video • ${stream.videoFileName || 'Video file'}`;
            } else {
                formatText = `📹 Uploaded Video • ${stream.videoFileName || 'Video file'}`;
            }
        }
        
        formatInfo.textContent = formatText;

        // Load video with enhanced error handling
        const contentContainer = document.getElementById('videoPlayerContent');
        
        if (stream.videoType === 'cloudinary' && stream.videoUrl) {
            this.loadCloudinaryVideo(stream, contentContainer);
        } else {
            contentContainer.innerHTML = `
                <div class="video-placeholder">
                    <i class="fas fa-exclamation-circle"></i>
                    <p>Video format not supported</p>
                </div>
            `;
        }

        // Setup social actions
        this.setupSocialActions(stream);

        // Show modal
        this.modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';

        // Add viewer
        if (currentUser) {
            streamManager.addViewer(stream.id);
        }

        // Listen to viewer count
        this.viewerUnsubscribe = streamManager.listenToViewerCount(stream.id, (viewerCount) => {
            const viewersElement = document.getElementById('videoPlayerViewers');
            if (viewersElement) {
                viewersElement.textContent = viewerCount;
            }
        });
    }

    setupSocialActions(stream) {
        const isLiked = likedStreams.has(stream.id);
        
        // Update like button
        const likeBtn = document.getElementById('modalLikeBtn');
        const likeCount = likeBtn.querySelector('.like-count');
        const likeIcon = likeBtn.querySelector('i');
        
        likeCount.textContent = stream.likes || 0;
        if (isLiked) {
            likeBtn.classList.add('liked');
            likeIcon.className = 'fas fa-heart';
        } else {
            likeBtn.classList.remove('liked');
            likeIcon.className = 'far fa-heart';
        }

        // Update comment button
        const commentBtn = document.getElementById('modalCommentBtn');
        const commentCount = commentBtn.querySelector('.comment-count');
        commentCount.textContent = stream.commentsCount || 0;

        // Setup event listeners
        this.setupSocialActionListeners(stream.id);
    }

    setupSocialActionListeners(streamId) {
        const likeBtn = document.getElementById('modalLikeBtn');
        const commentBtn = document.getElementById('modalCommentBtn');
        const sendCommentBtn = document.getElementById('modalSendComment');
        const commentInput = document.getElementById('modalCommentInput');

        if (commentBtn) {
            commentBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggleComments(streamId);
            });
        }

        if (likeBtn) {
            likeBtn.addEventListener('click', () => {
                streamManager.handleLike(streamId, likeBtn);
            });
        }

        if (sendCommentBtn) {
            sendCommentBtn.addEventListener('click', () => {
                streamManager.handleAddComment(streamId);
            });
        }

        if (commentInput) {
            commentInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    streamManager.handleAddComment(streamId);
                }
            });
        }
    }

    toggleComments(streamId) {
        const commentsSection = document.getElementById('modalCommentsSection');
        if (commentsSection) {
            if (commentsSection.style.display === 'none') {
                commentsSection.style.display = 'block';
                streamManager.loadComments(streamId);
            } else {
                commentsSection.style.display = 'none';
            }
        }
    }

    loadCloudinaryVideo(stream, container) {
        container.innerHTML = `
            <div class="cloudinary-video-container">
                <div class="video-loading" id="videoLoading">
                    <i class="fas fa-spinner fa-spin"></i><br>
                    Loading video...
                    ${stream.needsConversion ? '<div style="margin-top: 10px; font-size: 12px; color: #ffa500;">Processing video for better compatibility...</div>' : ''}
                    ${stream.isPhoneVideo ? '<div style="margin-top: 10px; font-size: 12px;">Phone video - may take a moment to process</div>' : ''}
                </div>
                <div class="video-error" id="videoError" style="display: none;">
                    <i class="fas fa-exclamation-triangle"></i><br>
                    <div id="errorMessage">Failed to load video</div>
                    <div id="errorDetails" style="font-size: 12px; margin: 10px 0;"></div>
                    <button class="video-retry-button" onclick="videoPlayer.reloadCurrentVideo()">
                        <i class="fas fa-redo"></i> Try Again
                    </button>
                    <div style="margin-top: 10px; font-size: 12px;">
                        If this continues, try uploading the video again or use a different format.
                    </div>
                </div>
                <video controls playsinline id="cloudinaryVideoPlayer" 
                       style="width: 100%; height: 100%; display: none;"
                       preload="metadata"
                       crossorigin="anonymous">
                    <source src="${stream.videoUrl}" type="video/mp4">
                    <source src="${stream.videoUrl}" type="video/webm">
                    <source src="${stream.videoUrl}" type="video/ogg">
                    Your browser does not support the video tag.
                </video>
            </div>
        `;

        this.setupVideoPlayer(stream);
    }

    setupVideoPlayer(stream) {
        const videoElement = document.getElementById('cloudinaryVideoPlayer');
        const loadingElement = document.getElementById('videoLoading');
        const errorElement = document.getElementById('videoError');
        const errorMessage = document.getElementById('errorMessage');
        const errorDetails = document.getElementById('errorDetails');

        if (!videoElement) return;

        this.currentVideoElement = videoElement;

        // Show loading initially
        loadingElement.style.display = 'block';
        videoElement.style.display = 'none';
        errorElement.style.display = 'none';

        // Enhanced event listeners for video handling
        videoElement.addEventListener('loadeddata', () => {
            loadingElement.style.display = 'none';
            videoElement.style.display = 'block';
        });

        videoElement.addEventListener('canplay', () => {
            loadingElement.style.display = 'none';
            videoElement.style.display = 'block';
            
            // Auto-play when ready
            try {
                const playPromise = videoElement.play();
                if (playPromise !== undefined) {
                    playPromise.catch(e => {
                        // Auto-play prevented
                    });
                }
            } catch (e) {
                // Auto-play error
            }
        });

        videoElement.addEventListener('waiting', () => {
            loadingElement.style.display = 'block';
        });

        videoElement.addEventListener('playing', () => {
            loadingElement.style.display = 'none';
        });

        videoElement.addEventListener('error', (e) => {
            loadingElement.style.display = 'none';
            errorElement.style.display = 'block';
            videoElement.style.display = 'none';
            
            // Enhanced error messages for downloaded videos
            let errorMsg = 'Failed to load video';
            let detailsMsg = '';
            
            if (videoElement.error) {
                switch(videoElement.error.code) {
                    case videoElement.error.MEDIA_ERR_ABORTED:
                        errorMsg = 'Video loading was aborted';
                        break;
                    case videoElement.error.MEDIA_ERR_NETWORK:
                        errorMsg = 'Network error occurred while loading video';
                        break;
                    case videoElement.error.MEDIA_ERR_DECODE:
                        errorMsg = 'Video format is not supported by your browser';
                        detailsMsg = 'The video is being processed for better compatibility.';
                        break;
                    case videoElement.error.MEDIA_ERR_SRC_NOT_SUPPORTED:
                        errorMsg = 'Video format is not supported';
                        detailsMsg = 'The video format may not be compatible with your browser. Try using a different browser or device.';
                        break;
                }
            }
            
            // Special handling for downloaded videos
            if (stream.needsConversion) {
                detailsMsg = 'This video is being processed for better compatibility. If it still doesn\'t play, try uploading the original video file.';
            }
            
            errorMessage.textContent = errorMsg;
            if (detailsMsg) {
                errorDetails.textContent = detailsMsg;
                errorDetails.style.display = 'block';
            } else {
                errorDetails.style.display = 'none';
            }
        });

        videoElement.addEventListener('stalled', () => {
            loadingElement.style.display = 'block';
        });

        videoElement.addEventListener('canplaythrough', () => {
            loadingElement.style.display = 'none';
        });

        // Enhanced load with multiple retry strategies
        this.loadVideoWithRetry(videoElement, loadingElement, errorElement, stream, 0);
    }

    loadVideoWithRetry(videoElement, loadingElement, errorElement, stream, retryCount = 0) {
        const maxRetries = 2;
        
        videoElement.load();
        
        // Enhanced timeout with progressive delays
        const timeoutDuration = stream.needsConversion ? 45000 : 30000;
        
        const loadTimeout = setTimeout(() => {
            if (loadingElement.style.display !== 'none' && videoElement.readyState < 2) {
                if (retryCount < maxRetries) {
                    this.loadVideoWithRetry(videoElement, loadingElement, errorElement, stream, retryCount + 1);
                } else {
                    loadingElement.style.display = 'none';
                    errorElement.style.display = 'block';
                    const errorMessage = document.getElementById('errorMessage');
                    const errorDetails = document.getElementById('errorDetails');
                    
                    errorMessage.textContent = 'Video took too long to load';
                    errorDetails.textContent = 'The video server may be busy. Please try again later.';
                    errorDetails.style.display = 'block';
                }
            }
        }, timeoutDuration);

        // Clear timeout if video loads successfully
        videoElement.addEventListener('canplay', () => {
            clearTimeout(loadTimeout);
        });
    }

    reloadCurrentVideo() {
        if (this.currentVideoElement) {
            const videoElement = this.currentVideoElement;
            const loadingElement = document.getElementById('videoLoading');
            const errorElement = document.getElementById('videoError');
            
            loadingElement.style.display = 'block';
            errorElement.style.display = 'none';
            videoElement.style.display = 'none';
            
            // Clear source and re-add to force reload
            const currentTime = videoElement.currentTime;
            const src = videoElement.src;
            
            videoElement.src = '';
            videoElement.load();
            
            setTimeout(() => {
                videoElement.src = src;
                videoElement.currentTime = currentTime || 0;
                videoElement.load();
                
                // Try to play
                const playPromise = videoElement.play();
                if (playPromise !== undefined) {
                    playPromise.catch(e => {
                        // Play after reload prevented
                    });
                }
            }, 100);
        }
    }

    toggleFullscreen() {
        this.modal.classList.toggle('fullscreen');
        const fullscreenBtn = document.getElementById('toggleFullscreen');
        if (fullscreenBtn) {
            const icon = fullscreenBtn.querySelector('i');
            if (this.modal.classList.contains('fullscreen')) {
                icon.className = 'fas fa-compress';
                fullscreenBtn.innerHTML = '<i class="fas fa-compress"></i> Exit Fullscreen';
            } else {
                icon.className = 'fas fa-expand';
                fullscreenBtn.innerHTML = '<i class="fas fa-expand"></i> Fullscreen';
            }
        }
    }

    close() {
        this.modal.style.display = 'none';
        document.body.style.overflow = '';
        this.modal.classList.remove('fullscreen');

        // Clean up video element
        if (this.currentVideoElement) {
            this.currentVideoElement.pause();
            this.currentVideoElement.src = '';
            this.currentVideoElement.load();
            this.currentVideoElement = null;
        }

        if (this.currentStreamId && currentUser) {
            streamManager.removeViewer(this.currentStreamId);
        }

        if (this.viewerUnsubscribe) {
            this.viewerUnsubscribe();
            this.viewerUnsubscribe = null;
        }

        this.currentStreamId = null;
    }
}

// Initialize Video Player
const videoPlayer = new VideoPlayer();

// Social Features Management
function loadLikedStreams() {
    if (!currentUser) return;
    const stored = localStorage.getItem(`likedStreams_${currentUser.uid}`);
    if (stored) {
        likedStreams = new Set(JSON.parse(stored));
    }
}

function saveLikedStreams() {
    if (!currentUser) return;
    localStorage.setItem(`likedStreams_${currentUser.uid}`, JSON.stringify([...likedStreams]));
}

function loadViewedStreams() {
    if (!currentUser) return;
    const stored = localStorage.getItem(`viewedStreams_${currentUser.uid}`);
    if (stored) {
        viewedStreams = new Set(JSON.parse(stored));
    }
}

function saveViewedStreams() {
    if (!currentUser) return;
    localStorage.setItem(`viewedStreams_${currentUser.uid}`, JSON.stringify([...viewedStreams]));
}

function markStreamAsViewed(streamId) {
    viewedStreams.add(streamId);
    saveViewedStreams();
}

// Auth state management
function initializeAuth() {
    return new Promise((resolve) => {
        const unsubscribe = onAuthStateChanged(auth, (user) => {
            if (user) {
                currentUser = user;
                // Load social data
                loadLikedStreams();
                loadViewedStreams();
                unsubscribe();
                resolve(user);
            } else {
                currentUser = null;
                const currentPage = window.location.pathname.split('/').pop();
                if (currentPage === 'poststream.html' || currentPage === 'stream.html') {
                    window.location.href = 'login.html';
                }
                resolve(null);
            }
        });

        setTimeout(() => {
            unsubscribe();
            if (!currentUser) {
                resolve(null);
            }
        }, 5000);
    });
}

// Initialize stream functionality based on current page
async function initializeStreamPage() {
    const currentPage = window.location.pathname.split('/').pop().split('.')[0];
    
    await initializeAuth();
    
    if (!currentUser && (currentPage === 'poststream' || currentPage === 'stream')) {
        return;
    }

    switch(currentPage) {
        case 'poststream':
            initializePostStreamPage();
            break;
        case 'stream':
            initializeStreamsPage();
            break;
    }
}

// Initialize post stream page
function initializePostStreamPage() {
    const streamForm = document.getElementById('streamForm');
    const videoFileInput = document.getElementById('videoFile');
    const submitBtn = document.getElementById('submitBtn');
    const loadingSpinner = document.getElementById('loadingSpinner');
    const successMessage = document.getElementById('successMessage');
    const errorMessage = document.getElementById('errorMessage');
    const errorText = document.getElementById('errorText');

    if (!streamForm || !videoFileInput) {
        return;
    }

    // Remove URL upload option if it exists
    const urlSection = document.getElementById('urlSection');
    const urlOption = document.querySelector('.upload-option[data-method="url"]');
    if (urlSection) urlSection.remove();
    if (urlOption) urlOption.remove();

    // Enhanced file input validation for downloaded videos
    videoFileInput.addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (file) {
            const fileInfo = document.getElementById('fileInfo') || createFileInfoElement();
            
            // Enhanced file analysis
            const isDownloaded = streamManager.isDownloadedVideo(file);
            const needsConversion = streamManager.needsConversion(file);
            
            let statusMessage = `Selected: ${file.name} (${formatFileSize(file.size)})`;
            let statusColor = 'var(--success-color)';
            let statusIcon = 'fa-check';
            
            if (needsConversion) {
                statusMessage += ' - This video may need processing for better compatibility';
                statusColor = 'var(--warning-color)';
                statusIcon = 'fa-exclamation-triangle';
            }
            
            if (isDownloaded) {
                statusMessage += ' - Downloaded video detected';
            }
            
            fileInfo.style.color = statusColor;
            fileInfo.innerHTML = `<i class="fas ${statusIcon}"></i> ${statusMessage}`;
            
            // Validate file immediately
            try {
                streamManager.validateVideoFile(file).then(() => {
                    // Validation passed
                }).catch(error => {
                    fileInfo.style.color = 'var(--error-color)';
                    fileInfo.innerHTML = `<i class="fas fa-exclamation-triangle"></i> ${file.name} - ${error.message}`;
                });
            } catch (error) {
                fileInfo.style.color = 'var(--error-color)';
                fileInfo.innerHTML = `<i class="fas fa-exclamation-triangle"></i> ${file.name} - Error: ${error.message}`;
            }
        }
    });

    function createFileInfoElement() {
        const fileInfo = document.createElement('div');
        fileInfo.id = 'fileInfo';
        fileInfo.style.fontSize = '14px';
        fileInfo.style.marginTop = '8px';
        fileInfo.style.padding = '8px';
        fileInfo.style.borderRadius = '5px';
        fileInfo.style.backgroundColor = 'var(--bg-dark)';
        videoFileInput.parentNode.appendChild(fileInfo);
        return fileInfo;
    }

    function formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    streamForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const videoFile = videoFileInput?.files[0];
        const headline = document.getElementById('headline').value.trim();
        const description = document.getElementById('description').value.trim();
        const category = document.getElementById('category').value;

        // Validation
        if (!videoFile) {
            showError('Please select a video file to upload');
            return;
        }

        if (!headline) {
            showError('Please enter a headline');
            document.getElementById('headline').focus();
            return;
        }

        if (!category) {
            showError('Please select a category');
            document.getElementById('category').focus();
            return;
        }

        // Additional validation for file uploads
        if (videoFile) {
            try {
                await streamManager.validateVideoFile(videoFile);
            } catch (error) {
                showError(error.message);
                return;
            }
        }

        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating...';
        loadingSpinner.style.display = 'block';
        hideError();
        hideSuccess();

        try {
            showSuccess('Uploading video... This may take a moment for large files.');
            
            // Handle file upload to Cloudinary
            const streamId = await streamManager.createStream(videoFile, headline, description, category, true);
            
            showSuccess('Stream created successfully! Redirecting...');
            loadingSpinner.style.display = 'none';
            
            // Clear form
            streamForm.reset();
            const fileInfo = document.getElementById('fileInfo');
            if (fileInfo) fileInfo.textContent = '';
            
            setTimeout(() => {
                window.location.href = 'stream.html';
            }, 2000);

        } catch (error) {
            showError(error.message);
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="fas fa-upload"></i> Create Stream';
            loadingSpinner.style.display = 'none';
        }
    });

    function showError(message) {
        errorText.textContent = message;
        errorMessage.style.display = 'block';
        errorMessage.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    function hideError() {
        errorMessage.style.display = 'none';
    }

    function showSuccess(message) {
        if (message && successMessage) {
            const successText = successMessage.querySelector('span');
            if (successText) successText.textContent = message;
        }
        if (successMessage) {
            successMessage.style.display = 'block';
            successMessage.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }

    function hideSuccess() {
        if (successMessage) {
            successMessage.style.display = 'none';
        }
    }
}

// Initialize streams page
function initializeStreamsPage() {
    const streamsContainer = document.getElementById('streamsContainer');
    const filterButtons = document.querySelectorAll('.filter-btn');
    const totalViewersCounter = document.getElementById('totalViewersCounter');
    const totalViewersSpan = document.getElementById('totalViewers');
    let currentCategory = 'all';

    if (!streamsContainer) {
        return;
    }

    loadStreams(currentCategory);

    filterButtons.forEach(button => {
        button.addEventListener('click', () => {
            const category = button.dataset.category;
            
            filterButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            
            currentCategory = category;
            loadStreams(category);
        });
    });

    streamManager.listenToStreams((streams) => {
        renderStreams(streams);
        updateTotalViewers(streams);
    }, currentCategory);

    streamManager.initializeActivityTracking();
}

// Load streams function
function loadStreams(category) {
    const streamsContainer = document.getElementById('streamsContainer');
    if (!streamsContainer) return;

    streamsContainer.innerHTML = `
        <div class="loading-streams">
            <i class="fas fa-spinner fa-spin"></i><br>
            Loading streams...
        </div>
    `;

    streamManager.getStreams(category)
        .then(streams => {
            renderStreams(streams);
            updateTotalViewers(streams);
        })
        .catch(error => {
            streamsContainer.innerHTML = `
                <div class="no-streams">
                    <i class="fas fa-exclamation-circle"></i>
                    <h3>Error loading streams</h3>
                    <p>Please try refreshing the page</p>
                </div>
            `;
        });
}

// Get video thumbnail - ALWAYS returns default image
function getVideoThumbnail(stream) {
    return 'images-defaultse-profile.jpg';
}

// Render streams function with proper phone video handling
function renderStreams(streams) {
    const streamsContainer = document.getElementById('streamsContainer');
    if (!streamsContainer) return;

    if (streams.length === 0) {
        streamsContainer.innerHTML = `
            <div class="no-streams">
                <i class="fas fa-video-slash"></i>
                <h3>No streams available</h3>
                <p>Be the first to create an educational stream!</p>
                <a href="poststream.html" class="create-stream-btn" style="margin-top: 15px;">
                    <i class="fas fa-plus"></i> Create Stream
                </a>
            </div>
        `;
        return;
    }

    streamsContainer.innerHTML = streams.map(stream => {
        const isCloudinaryVideo = stream.videoType === 'cloudinary';
        const isPhoneVideo = stream.isPhoneVideo;
        const isPortraitVideo = stream.isPortraitVideo;
        const isLiked = likedStreams.has(stream.id);
        const needsConversion = stream.needsConversion;
        
        // Determine the appropriate CSS class for the video preview
        let videoPreviewClass = 'video-preview-container';
        if (isPhoneVideo && isPortraitVideo) {
            videoPreviewClass += ' phone-video portrait-video';
        } else if (isPhoneVideo) {
            videoPreviewClass += ' phone-video';
        }
        if (needsConversion) {
            videoPreviewClass += ' converted-video';
        }
        
        return `
        <div class="stream-card" data-stream-id="${stream.id}">
            <div class="${videoPreviewClass}" onclick="playStream('${stream.id}')">
                <img src="images-defaultse-profile.jpg" 
                     alt="${stream.headline}" 
                     class="video-preview">
                <div class="video-preview-overlay">
                    <button class="preview-play-button">
                        <i class="fas fa-play"></i>
                    </button>
                </div>
                <div class="video-duration">
                    <i class="fas fa-play-circle"></i> 
                    Watch Now
                </div>
            </div>
            <div class="stream-info">
                <div class="stream-meta">
                    <span class="stream-category">${formatCategory(stream.category)}</span>
                    <span class="stream-viewers">
                        <i class="fas fa-eye"></i> 
                        <span id="viewers-${stream.id}">${stream.currentViewers || 0}</span>
                    </span>
                </div>
                <h3 class="stream-title">${stream.headline}</h3>
                <p class="stream-description">${stream.description || 'No description provided'}</p>
                
                <!-- Social Actions -->
                <div class="stream-actions">
                    <button class="stream-action like-btn ${isLiked ? 'liked' : ''}" data-stream-id="${stream.id}">
                        <i class="${isLiked ? 'fas' : 'far'} fa-heart"></i> 
                        <span class="like-count">${stream.likes || 0}</span>
                    </button>
                    <button class="stream-action comment-btn" data-stream-id="${stream.id}" onclick="toggleStreamComments('${stream.id}')">
                        <i class="far fa-comment"></i> 
                        <span class="comment-count">${stream.commentsCount || 0}</span>
                    </button>
                </div>

                <!-- Comments Section - Hidden by default -->
                <div class="comments-section" id="comments-${stream.id}" style="display: none;">
                    <div class="add-comment">
                        <input type="text" class="comment-input" data-stream-id="${stream.id}" placeholder="Write a comment...">
                        <button class="send-comment-btn" data-stream-id="${stream.id}" onclick="handleAddComment('${stream.id}')">
                            <i class="fas fa-paper-plane"></i> Send
                        </button>
                    </div>
                    <div class="comments-list" id="comments-list-${stream.id}"></div>
                </div>

                <div class="stream-author">
                    <img src="${stream.authorImage || 'images-defaultse-profile.jpg'}" alt="${stream.authorName}" 
                         class="author-avatar"
                         style="width: 40px; height: 40px; border-radius: 50%; object-fit: cover;">
                    <div class="author-info">
                        <p class="author-name">${stream.authorName}</p>
                        <p class="stream-time">${formatTime(stream.createdAt)}</p>
                    </div>
                </div>
            </div>
        </div>
        `;
    }).join('');

    // Add event listeners for social actions on stream cards
    streams.forEach(stream => {
        const likeBtn = document.querySelector(`.like-btn[data-stream-id="${stream.id}"]`);
        const commentInput = document.querySelector(`.comment-input[data-stream-id="${stream.id}"]`);

        if (likeBtn) {
            likeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                streamManager.handleLike(stream.id, likeBtn);
            });
        }

        if (commentInput) {
            commentInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    handleAddComment(stream.id);
                }
            });
        }

        streamManager.listenToViewerCount(stream.id, (viewerCount) => {
            const viewersElement = document.getElementById(`viewers-${stream.id}`);
            if (viewersElement) {
                viewersElement.textContent = viewerCount;
            }
        });
    });
}

// Toggle comments function for stream cards
function toggleStreamComments(streamId) {
    const commentsSection = document.getElementById(`comments-${streamId}`);
    if (commentsSection) {
        if (commentsSection.style.display === 'none') {
            commentsSection.style.display = 'block';
            streamManager.loadComments(streamId);
        } else {
            commentsSection.style.display = 'none';
        }
    }
}

// Handle add comment for stream cards
function handleAddComment(streamId) {
    if (!currentUser) return;

    const commentInput = document.querySelector(`.comment-input[data-stream-id="${streamId}"]`);
    if (!commentInput) return;

    const commentText = commentInput.value.trim();
    if (!commentText) {
        alert('Please enter a comment');
        return;
    }

    streamManager.handleAddComment(streamId);
}

// Play stream function
function playStream(streamId) {
    streamManager.getStreams('all').then(streams => {
        const stream = streams.find(s => s.id === streamId);
        if (stream) {
            videoPlayer.open(stream);
            markStreamAsViewed(streamId);
        } else {
            alert('Stream not found. Please try again.');
        }
    }).catch(error => {
        alert('Error loading stream. Please try again.');
    });
}

// Update total viewers function
function updateTotalViewers(streams) {
    const totalViewersSpan = document.getElementById('totalViewers');
    if (totalViewersSpan) {
        const total = streams.reduce((sum, stream) => sum + (stream.currentViewers || 0), 0);
        totalViewersSpan.textContent = total;
    }
}

// Helper functions
function formatCategory(category) {
    if (!category) return 'Uncategorized';
    return category.split('-').map(word => 
        word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
}

function formatTime(timestamp) {
    if (!timestamp) return 'Recently';
    
    try {
        const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMins / 60);
        const diffDays = Math.floor(diffHours / 24);

        if (diffMins < 1) return 'just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        if (diffDays < 7) return `${diffDays}d ago`;
        return date.toLocaleDateString();
    } catch (error) {
        return 'Recently';
    }
}

// Handle logout
function setupLogout() {
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            try {
                await signOut(auth);
                window.location.href = 'login.html';
            } catch (error) {
                // Silently handle error
            }
        });
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', async () => {
    setupLogout();
    
    try {
        await initializeStreamPage();
    } catch (error) {
        // Silently handle error
    }
});

// Export for use in other files
window.streamManager = streamManager;
window.playStream = playStream;
window.videoPlayer = videoPlayer;
window.toggleStreamComments = toggleStreamComments;
window.handleAddComment = handleAddComment;