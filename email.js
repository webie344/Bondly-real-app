// Firebase configuration
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { 
    getFirestore, 
    collection, 
    getDocs,
    query,
    orderBy,
    where
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// Use the same Firebase config from your app.js
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

// Global variables
let allUsers = [];
let filteredUsers = [];
let currentPage = 1;
const usersPerPage = 20;
let currentSort = { field: 'created', direction: 'desc' };

// DOM Elements
const emailTableBody = document.getElementById('emailTableBody');
const totalUsersEl = document.getElementById('totalUsers');
const verifiedUsersEl = document.getElementById('verifiedUsers');
const profilesCompleteEl = document.getElementById('profilesComplete');
const activeTodayEl = document.getElementById('activeToday');
const searchInput = document.getElementById('searchInput');
const exportBtn = document.getElementById('exportBtn');
const copyAllBtn = document.getElementById('copyAllBtn');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
const pageInfo = document.getElementById('pageInfo');

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    loadAllUsers();
    setupEventListeners();
});

async function loadAllUsers() {
    try {
        showLoading();
        
        const usersRef = collection(db, 'users');
        const usersQuery = query(usersRef, orderBy('createdAt', 'desc'));
        const querySnapshot = await getDocs(usersQuery);
        
        allUsers = [];
        querySnapshot.forEach((doc) => {
            const userData = doc.data();
            allUsers.push({
                id: doc.id,
                email: userData.email || 'No email',
                name: userData.name || 'Unknown',
                createdAt: userData.createdAt?.toDate() || new Date(),
                profileComplete: userData.profileComplete || false,
                emailVerified: userData.emailVerified || false,
                lastActive: userData.lastActive?.toDate() || userData.createdAt?.toDate() || new Date()
            });
        });

        filteredUsers = [...allUsers];
        updateStats();
        renderTable();
        setupSorting();
        
    } catch (error) {
        console.error('Error loading users:', error);
        showError('Failed to load user data. Please check the console for details.');
    }
}

function updateStats() {
    const total = allUsers.length;
    const verified = allUsers.filter(user => user.emailVerified).length;
    const completeProfiles = allUsers.filter(user => user.profileComplete).length;
    
    // Calculate active today (users who were active in the last 24 hours)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const activeToday = allUsers.filter(user => user.lastActive >= today).length;
    
    totalUsersEl.textContent = total.toLocaleString();
    verifiedUsersEl.textContent = verified.toLocaleString();
    profilesCompleteEl.textContent = completeProfiles.toLocaleString();
    activeTodayEl.textContent = activeToday.toLocaleString();
}

function renderTable() {
    if (filteredUsers.length === 0) {
        emailTableBody.innerHTML = `
            <tr>
                <td colspan="5" class="no-emails">
                    <i class="fas fa-inbox" style="font-size: 3em; margin-bottom: 20px; opacity: 0.5;"></i>
                    <div>No users found</div>
                </td>
            </tr>
        `;
        return;
    }

    // Calculate pagination
    const totalPages = Math.ceil(filteredUsers.length / usersPerPage);
    const startIndex = (currentPage - 1) * usersPerPage;
    const endIndex = startIndex + usersPerPage;
    const usersToShow = filteredUsers.slice(startIndex, endIndex);

    emailTableBody.innerHTML = usersToShow.map(user => `
        <tr>
            <td>
                <div style="display: flex; align-items: center; gap: 10px;">
                    <i class="fas fa-envelope" style="color: #7f8c8d;"></i>
                    <span>${escapeHtml(user.email)}</span>
                </div>
            </td>
            <td>${escapeHtml(user.name)}</td>
            <td>
                <div style="display: flex; align-items: center; gap: 8px;">
                    <i class="far fa-calendar" style="color: #7f8c8d;"></i>
                    <span>${formatDate(user.createdAt)}</span>
                </div>
            </td>
            <td>
                <span class="status-badge ${user.emailVerified ? 'verified' : 'unverified'}">
                    ${user.emailVerified ? 
                        '<i class="fas fa-check-circle"></i> Verified' : 
                        '<i class="fas fa-times-circle"></i> Unverified'
                    }
                </span>
                ${user.profileComplete ? 
                    '<span class="status-badge complete" style="margin-left: 5px;"><i class="fas fa-user-check"></i> Complete</span>' : 
                    '<span class="status-badge incomplete" style="margin-left: 5px;"><i class="fas fa-user-edit"></i> Incomplete</span>'
                }
            </td>
            <td>
                <button class="action-btn copy-email" data-email="${user.email}" title="Copy email">
                    <i class="fas fa-copy"></i>
                </button>
            </td>
        </tr>
    `).join('');

    // Update pagination controls
    updatePagination(totalPages);
    
    // Add copy functionality to individual email buttons
    document.querySelectorAll('.copy-email').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const email = e.target.closest('.copy-email').dataset.email;
            copyToClipboard(email);
        });
    });
}

function setupSorting() {
    document.querySelectorAll('th[data-sort]').forEach(th => {
        th.addEventListener('click', () => {
            const field = th.dataset.sort;
            
            if (currentSort.field === field) {
                currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
            } else {
                currentSort.field = field;
                currentSort.direction = 'asc';
            }
            
            sortUsers();
            renderTable();
            updateSortIcons();
        });
    });
}

function sortUsers() {
    filteredUsers.sort((a, b) => {
        let aValue = a[currentSort.field];
        let bValue = b[currentSort.field];
        
        // Handle different data types
        if (currentSort.field === 'created') {
            aValue = a.createdAt;
            bValue = b.createdAt;
        } else if (currentSort.field === 'verified') {
            aValue = a.emailVerified;
            bValue = b.emailVerified;
        }
        
        if (typeof aValue === 'string') {
            aValue = aValue.toLowerCase();
            bValue = bValue.toLowerCase();
        }
        
        if (aValue < bValue) return currentSort.direction === 'asc' ? -1 : 1;
        if (aValue > bValue) return currentSort.direction === 'asc' ? 1 : -1;
        return 0;
    });
}

function updateSortIcons() {
    document.querySelectorAll('th[data-sort]').forEach(th => {
        const icon = th.querySelector('i');
        if (th.dataset.sort === currentSort.field) {
            icon.className = currentSort.direction === 'asc' ? 
                'fas fa-sort-up' : 'fas fa-sort-down';
        } else {
            icon.className = 'fas fa-sort';
        }
    });
}

function setupEventListeners() {
    // Search functionality
    searchInput.addEventListener('input', (e) => {
        const searchTerm = e.target.value.toLowerCase().trim();
        
        if (searchTerm === '') {
            filteredUsers = [...allUsers];
        } else {
            filteredUsers = allUsers.filter(user => 
                user.email.toLowerCase().includes(searchTerm) ||
                user.name.toLowerCase().includes(searchTerm)
            );
        }
        
        currentPage = 1;
        sortUsers();
        renderTable();
    });

    // Export functionality
    exportBtn.addEventListener('click', exportToCSV);

    // Copy all emails
    copyAllBtn.addEventListener('click', copyAllEmails);

    // Pagination
    prevBtn.addEventListener('click', () => {
        if (currentPage > 1) {
            currentPage--;
            renderTable();
        }
    });

    nextBtn.addEventListener('click', () => {
        const totalPages = Math.ceil(filteredUsers.length / usersPerPage);
        if (currentPage < totalPages) {
            currentPage++;
            renderTable();
        }
    });
}

function updatePagination(totalPages) {
    prevBtn.disabled = currentPage === 1;
    nextBtn.disabled = currentPage === totalPages || totalPages === 0;
    pageInfo.textContent = `Page ${currentPage} of ${totalPages || 1}`;
}

function exportToCSV() {
    if (filteredUsers.length === 0) {
        showNotification('No data to export', 'error');
        return;
    }

    const headers = ['Email', 'Name', 'Join Date', 'Verified', 'Profile Complete'];
    const csvData = filteredUsers.map(user => [
        user.email,
        user.name,
        formatDate(user.createdAt),
        user.emailVerified ? 'Yes' : 'No',
        user.profileComplete ? 'Yes' : 'No'
    ]);

    const csvContent = [
        headers.join(','),
        ...csvData.map(row => row.map(field => `"${field}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `user-emails-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
    
    showNotification('CSV exported successfully!', 'success');
}

function copyAllEmails() {
    if (filteredUsers.length === 0) {
        showNotification('No emails to copy', 'error');
        return;
    }

    const emails = filteredUsers.map(user => user.email).join(', ');
    copyToClipboard(emails);
}

function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        showNotification('Copied to clipboard!', 'success');
    }).catch(err => {
        console.error('Failed to copy: ', err);
        showNotification('Failed to copy to clipboard', 'error');
    });
}

// Utility functions
function showLoading() {
    emailTableBody.innerHTML = `
        <tr>
            <td colspan="5" class="loading">
                <div class="spinner"></div>
                <div>Loading user data...</div>
            </td>
        </tr>
    `;
}

function showError(message) {
    emailTableBody.innerHTML = `
        <tr>
            <td colspan="5" class="no-emails">
                <i class="fas fa-exclamation-triangle" style="font-size: 3em; margin-bottom: 20px; color: #e74c3c;"></i>
                <div>${message}</div>
                <button onclick="loadAllUsers()" style="margin-top: 15px; padding: 10px 20px; background: #3498db; color: white; border: none; border-radius: 5px; cursor: pointer;">
                    <i class="fas fa-redo"></i> Retry
                </button>
            </td>
        </tr>
    `;
}

function formatDate(date) {
    return new Date(date).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
}

function escapeHtml(unsafe) {
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `copy-notification`;
    notification.style.background = type === 'success' ? '#27ae60' : type === 'error' ? '#e74c3c' : '#3498db';
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.remove();
    }, 3000);
}

// Add CSS for status badges and action buttons
const style = document.createElement('style');
style.textContent = `
    .status-badge {
        padding: 4px 8px;
        border-radius: 12px;
        font-size: 12px;
        font-weight: 600;
        display: inline-flex;
        align-items: center;
        gap: 4px;
    }
    .status-badge.verified {
        background: #d4edda;
        color: #155724;
    }
    .status-badge.unverified {
        background: #f8d7da;
        color: #721c24;
    }
    .status-badge.complete {
        background: #d1ecf1;
        color: #0c5460;
    }
    .status-badge.incomplete {
        background: #fff3cd;
        color: #856404;
    }
    .action-btn {
        background: #3498db;
        color: white;
        border: none;
        border-radius: 5px;
        padding: 8px 12px;
        cursor: pointer;
        transition: all 0.3s ease;
    }
    .action-btn:hover {
        background: #2980b9;
        transform: scale(1.05);
    }
`;
document.head.appendChild(style);

