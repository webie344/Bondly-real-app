// creative.js - COMPLETELY STANDALONE - No app.js dependencies
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

// Your Firebase config
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

class CreativeManager {
    constructor() {
        this.currentUser = null;
        this.BANNERS = [
            { id: 'single', name: 'Single', class: 'banner-single' },
            { id: 'playboy', name: 'Playboy', class: 'bplayboy' },
            { id: 'serious', name: 'Serious', class: 'banner-serious' },
            { id: 'adventurous', name: 'Adventurous', class: 'banner-adventurous' },
            { id: 'romantic', name: 'Romantic', class: 'banner-romantic' },
            { id: 'funny', name: 'Funny', class: 'banner-funny' },
            { id: 'ambitious', name: 'Ambitious', class: 'banner-ambitious' },
            { id: 'chill', name: 'Chill', class: 'banner-chill' },
            { id: 'mysterious', name: 'Mysterious', class: 'banner-mysterious' },
            { id: 'creative', name: 'Creative', class: 'banner-creative' }
        ];
        
        this.init();
    }

    async init() {
        this.setupStyles();
        
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                this.setupAuthListener();
            });
        } else {
            this.setupAuthListener();
        }
    }

    setupAuthListener() {
        onAuthStateChanged(auth, (user) => {
            if (user) {
                this.currentUser = user;
                setTimeout(() => {
                    this.setupPageBasedOnPath();
                }, 100);
            }
        });
    }

    setupPageBasedOnPath() {
        const path = window.location.pathname.toLowerCase();
        
        if (path.includes('account')) {
            this.setupAccountPage();
        } else if (path.includes('profile')) {
            this.setupProfilePage();
        } else if (path.includes('mingle')) {
            this.setupMinglePage();
        }
    }

    setupStyles() {
        const styles = `
            .creative-banner-section {
                padding: 10px;
                background: #2f3136;
                border-radius: 10px;
                margin: 15px 0;
            }
            .creative-banner-section h3 {
                color: white;
                margin-bottom: 15px;
                font-size: 16px;
            }
            .creative-banner-grid {
                display: grid;
                grid-template-columns: repeat(1, 1fr);
                gap: 5px;
            }
            .creative-banner-item {
                background: #40444b;
                padding: 15px;
                border-radius: 8px;
                text-align: center;
                cursor: pointer;
                border: 2px solid transparent;
                color: white;
                font-weight: bold;
                transition: all 0.3s ease;
                font-size: 14px;
            }
            .creative-banner-item:hover {
                background: #4a8cff;
                transform: translateY(-2px);
            }
            .creative-banner-item.selected {
                border-color: #4a8cff;
                background: #4a8cff;
                box-shadow: 0 4px 12px rgba(74, 140, 255, 0.4);
            }
            .creative-profile-banner {
                color: white;
                padding: 15px;
                border-radius: 10px;
                text-align: center;
                margin: 15px 0;
                font-weight: bold;
                font-size: 18px;
                text-shadow: 1px 1px 2px rgba(0,0,0,0.5);
            }
            .creative-additional-photos {
                margin: 20px 0;
                padding: 20px;
                background: #2f3136;
                border-radius: 10px;
            }
            .creative-photo-upload {
                text-align: center;
                margin: 15px 0;
            }
            .creative-additional-photo {
                width: 120px;
                height: 120px;
                object-fit: cover;
                border-radius: 10px;
                border: 3px solid #40444b;
                margin: 10px;
            }
            .creative-upload-btn {
                background: #4a8cff;
                color: white;
                padding: 10px 15px;
                border: none;
                border-radius: 5px;
                cursor: pointer;
                margin: 5px;
                transition: background 0.3s ease;
                font-size: 14px;
            }
            .creative-upload-btn:hover {
                background: #3a7be0;
            }
            .creative-remove-btn {
                background: #ed4245;
                color: white;
                padding: 10px 15px;
                border: none;
                border-radius: 5px;
                cursor: pointer;
                margin: 5px;
                transition: background 0.3s ease;
                font-size: 14px;
            }
            .creative-remove-btn:hover {
                background: #d93639;
            }
            .creative-file-input {
                display: none;
            }
            
            /* Banner gradients */
            .banner-single { background: linear-gradient(135deg, #ff6b6b 0%, #ee5a24 100%); }
            .bplayboy { background: linear-gradient(135deg, #a8e6cf 0%, #3d5a80 100%); }
            .banner-serious { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); }
            .banner-adventurous { background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); }
            .banner-romantic { background: linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%); color: #333; }
            .banner-funny { background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%); }
            .banner-ambitious { background: linear-gradient(135deg, #43e97b 0%, #38f9d7 100%); color: #333; }
            .banner-chill { background: linear-gradient(135deg, #fa709a 0%, #fee140 100%); }
            .banner-mysterious { background: linear-gradient(135deg, #4c669f 0%, #192f6a 100%); }
            .banner-creative { background: linear-gradient(135deg, #d4fc79 0%, #96e6a1 100%); color: #333; }
        `;
        
        const styleEl = document.createElement('style');
        styleEl.textContent = styles;
        document.head.appendChild(styleEl);
    }

    setupAccountPage() {
        this.addCreativeSections();
        this.loadUserCreativeData();
    }

    addCreativeSections() {
        // Add additional photos section with multiple fallback selectors
        let profileSection = document.querySelector('.profile-picture-upload');
        if (!profileSection) {
            profileSection = document.querySelector('.profile-section');
        }
        if (!profileSection) {
            profileSection = document.querySelector('[class*="profile"]');
        }
        
        if (profileSection && !document.getElementById('creativePhotosSection')) {
            const additionalPhotosHTML = `
                <div class="creative-additional-photos" id="creativePhotosSection">
                    <h3><i class="fas fa-images"></i> Additional Profile Photo</h3>
                    <div class="creative-photo-upload">
                        <img src="/images-default-profile.jpg" class="creative-additional-photo" id="creativePhoto2" onerror="this.src='/default-profile.jpg'">
                        <br>
                        <button class="creative-upload-btn" onclick="window.creativeManager.triggerPhotoUpload(2)">
                            <i class="fas fa-camera"></i> Add Second Photo
                        </button>
                        <input type="file" id="creativeFile2" class="creative-file-input" accept="image/*">
                        <button class="creative-remove-btn" onclick="window.creativeManager.removePhoto(2)">
                            <i class="fas fa-trash"></i> Remove
                        </button>
                    </div>
                </div>
            `;
            profileSection.insertAdjacentHTML('afterend', additionalPhotosHTML);
            this.setupFileInput(2);
        }
        
        // Add banners section with multiple fallback selectors
        let accountMain = document.querySelector('.account-main');
        if (!accountMain) {
            accountMain = document.querySelector('.main-content');
        }
        if (!accountMain) {
            accountMain = document.querySelector('main');
        }
        if (!accountMain) {
            accountMain = document.querySelector('.container');
        }
        
        if (accountMain && !document.getElementById('creativeBannerSection')) {
            const bannersHTML = `
                <div class="creative-banner-section" id="creativeBannerSection">
                    <h3><i class="fas fa-flag"></i> Choose Your Profile Banner</h3>
                    <div class="creative-banner-grid" id="creativeBannerGrid">
                        ${this.BANNERS.map(banner => `
                            <div class="creative-banner-item" data-banner="${banner.id}">
                                ${banner.name}
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
            accountMain.insertAdjacentHTML('afterbegin', bannersHTML);
            this.setupBannerClicks();
        }
    }

    setupFileInput(photoNumber) {
        const fileInput = document.getElementById(`creativeFile${photoNumber}`);
        if (fileInput) {
            fileInput.addEventListener('change', (e) => {
                if (e.target.files && e.target.files[0]) {
                    this.uploadPhoto(photoNumber, e.target.files[0]);
                }
            });
        }
    }

    setupBannerClicks() {
        const bannerGrid = document.getElementById('creativeBannerGrid');
        if (bannerGrid) {
            bannerGrid.addEventListener('click', (e) => {
                if (e.target.classList.contains('creative-banner-item')) {
                    const banner = e.target.getAttribute('data-banner');
                    this.selectBanner(banner);
                }
            });
        }
    }

    triggerPhotoUpload(photoNumber) {
        const fileInput = document.getElementById(`creativeFile${photoNumber}`);
        if (fileInput) {
            fileInput.click();
        }
    }

    async uploadPhoto(photoNumber, file) {
        if (!file || !this.currentUser) {
            this.showNotification('Please sign in to upload photos', 'error');
            return;
        }
        
        if (!file.type.startsWith('image/')) {
            this.showNotification('Please select an image file', 'error');
            return;
        }

        try {
            const photoElement = document.getElementById(`creativePhoto${photoNumber}`);
            if (photoElement) {
                photoElement.style.opacity = '0.5';
            }

            const imageUrl = await this.uploadToCloudinary(file);
            await this.saveToFirebase(`photo${photoNumber}`, imageUrl);
            
            if (photoElement) {
                photoElement.src = imageUrl;
                photoElement.style.opacity = '1';
            }
            
            this.showNotification('Photo uploaded successfully!', 'success');
        } catch (error) {
            this.showNotification('Failed to upload photo. Please try again.', 'error');
        }
    }

    async removePhoto(photoNumber) {
        if (!this.currentUser) {
            this.showNotification('Please sign in to manage photos', 'error');
            return;
        }
        
        try {
            await this.saveToFirebase(`photo${photoNumber}`, null);
            
            const photoElement = document.getElementById(`creativePhoto${photoNumber}`);
            if (photoElement) {
                photoElement.src = '/images-default-profile.jpg';
            }
            
            const fileInput = document.getElementById(`creativeFile${photoNumber}`);
            if (fileInput) {
                fileInput.value = '';
            }
            
            this.showNotification('Photo removed successfully!', 'success');
        } catch (error) {
            this.showNotification('Failed to remove photo', 'error');
        }
    }

    async selectBanner(banner) {
        if (!this.currentUser) {
            this.showNotification('Please sign in to select a banner', 'error');
            return;
        }
        
        try {
            document.querySelectorAll('.creative-banner-item').forEach(item => {
                item.classList.remove('selected');
            });
            
            const selectedBanner = document.querySelector(`[data-banner="${banner}"]`);
            if (selectedBanner) {
                selectedBanner.classList.add('selected');
            }
            
            await this.saveToFirebase('selectedBanner', banner);
            this.showNotification(`Banner set to: ${this.getBannerName(banner)}`, 'success');
        } catch (error) {
            this.showNotification('Failed to update banner', 'error');
        }
    }

    getBannerName(bannerId) {
        const banner = this.BANNERS.find(b => b.id === bannerId);
        return banner ? banner.name : bannerId;
    }

    async loadUserCreativeData() {
        if (!this.currentUser) return;
        
        try {
            const userRef = doc(db, 'users', this.currentUser.uid);
            const userSnap = await getDoc(userRef);
            
            if (userSnap.exists()) {
                const userData = userSnap.data();
                
                // Load banner
                if (userData.selectedBanner) {
                    const bannerElement = document.querySelector(`[data-banner="${userData.selectedBanner}"]`);
                    if (bannerElement) {
                        bannerElement.classList.add('selected');
                    }
                }
                
                // Load additional photos
                if (userData.photo2) {
                    const photoElement = document.getElementById('creativePhoto2');
                    if (photoElement) {
                        photoElement.src = userData.photo2;
                    }
                }
            }
        } catch (error) {
            // Silent fail for production
        }
    }

    async saveToFirebase(field, value) {
        if (!this.currentUser) return;
        
        const userRef = doc(db, 'users', this.currentUser.uid);
        await updateDoc(userRef, {
            [field]: value,
            updatedAt: serverTimestamp()
        });
    }

    async uploadToCloudinary(file) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('upload_preset', 'profile-pictures');
        
        const response = await fetch(
            `https://api.cloudinary.com/v1_1/ddtdqrh1b/image/upload`,
            {
                method: 'POST',
                body: formData
            }
        );
        
        if (!response.ok) {
            throw new Error('Upload failed');
        }
        
        const data = await response.json();
        return data.secure_url;
    }

    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `creative-notification ${type}`;
        notification.innerHTML = `
            <div style="
                position: fixed;
                top: 20px;
                right: 20px;
                background: ${type === 'success' ? '#4CAF50' : type === 'error' ? '#f44336' : '#2196F3'};
                color: white;
                padding: 12px 20px;
                border-radius: 4px;
                z-index: 10000;
                animation: slideIn 0.3s ease;
                font-family: Arial, sans-serif;
                box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            ">
                ${message}
            </div>
        `;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 3000);
    }

    // Profile page functions
    setupProfilePage() {
        this.loadProfileCreativeData();
    }

    async loadProfileCreativeData() {
        const urlParams = new URLSearchParams(window.location.search);
        const profileId = urlParams.get('id');
        
        if (!profileId) return;
        
        try {
            const profileRef = doc(db, 'users', profileId);
            const profileSnap = await getDoc(profileRef);
            
            if (profileSnap.exists()) {
                const profileData = profileSnap.data();
                this.displayProfileCreativeData(profileData);
            }
        } catch (error) {
            // Silent fail for production
        }
    }

    displayProfileCreativeData(profileData) {
        // Display banner
        let profileBanner = document.getElementById('profileBanner');
        if (!profileBanner) {
            const profileMeta = document.querySelector('.profile-meta');
            if (profileMeta) {
                profileMeta.insertAdjacentHTML('afterend', `
                    <div class="creative-profile-banner" id="profileBanner" style="display: none;"></div>
                `);
                profileBanner = document.getElementById('profileBanner');
            }
        }
        
        if (profileBanner && profileData.selectedBanner) {
            const banner = this.BANNERS.find(b => b.id === profileData.selectedBanner);
            if (banner) {
                profileBanner.className = `creative-profile-banner ${banner.class}`;
                profileBanner.textContent = banner.name.toUpperCase();
                profileBanner.style.display = 'block';
            }
        }
        
        // Display additional photo
        const thumbnail2 = document.getElementById('thumbnail2');
        if (thumbnail2 && profileData.photo2) {
            thumbnail2.src = profileData.photo2;
        }
    }

    // Mingle page functions
    setupMinglePage() {
        // Mingle page updates can be added here
    }
}

// Initialize Creative Manager
let creativeManager;

document.addEventListener('DOMContentLoaded', () => {
    creativeManager = new CreativeManager();
    window.creativeManager = creativeManager;
});