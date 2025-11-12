// nav.js - Universal Navigation Component (Growth Manager Pro)
// 6 Sections: Profile, Overview, Acquisition, Sales & Revenue, Marketing, Settings

const NavComponent = {
    // Menu structure with role permissions (matching nav.js)
    menuItems: {
        profile: [
            { name: 'Profile', url: 'profile.html', icon: '⚙️', roles: ['admin', 'advisor', 'consultant', 'client', 'saas'] }
        ],
        overview: [
            // Dashboard will be added dynamically based on role
            { name: 'Contacts', url: 'contacts.html', icon: '👥', roles: ['admin', 'advisor', 'saas'] },
            { name: 'Availability', url: 'availability.html', icon: '📅', roles: ['admin', 'advisor', 'consultant'] }
        ],
        acquisition: [
            { name: 'Pre-Qual Calls', url: 'prequal-calls.html', icon: '📞', roles: ['admin', 'advisor', 'saas'] },
            { name: 'Podcast Calls', url: 'podcast-calls.html', icon: '🎙️', roles: ['admin', 'advisor', 'saas'] },
            { name: 'Discovery Calls', url: 'discovery-calls.html', icon: '🔍', roles: ['admin', 'advisor', 'saas'] },
            { name: 'Strategy Calls', url: 'strategy-calls.html', icon: '💼', roles: ['admin', 'advisor', 'consultant', 'saas'] }
        ],
        sales: [
            { name: 'Pipeline', url: 'pipeline.html', icon: '📈', roles: ['admin', 'advisor', 'saas'] },
            { name: 'Deals', url: 'deals.html', icon: '🤝', roles: ['admin', 'advisor', 'consultant', 'saas'] },
            { name: 'Client Success', url: 'client-success.html', icon: '🎯', roles: ['admin', 'advisor', 'consultant', 'saas'] },
            { name: 'Cash Flow', url: 'cash-flow.html', icon: '💰', roles: ['admin', 'saas'] },
            { name: 'Expense Tracker', url: 'expense-tracker.html', icon: '💳', roles: ['admin', 'saas'] }
        ],
        marketing: [
            { name: 'Campaigns', url: 'campaigns.html', icon: '📧', roles: ['admin', 'advisor', 'saas'] },
            { name: 'Sprints', url: 'sprints.html', icon: '🚀', roles: ['admin', 'advisor', 'consultant', 'saas'] }
        ],
        settings: [
            { name: 'User Management', url: 'user-management.html', icon: '⚙️', roles: ['admin'] },
            { name: 'Settings', url: 'settings.html', icon: '🔧', roles: ['admin', 'advisor', 'consultant', 'client', 'saas'] }
        ]
    },

    // Get current user from localStorage
    getCurrentUser() {
        try {
            const user = JSON.parse(localStorage.getItem('user'));
            return user;
        } catch (e) {
            console.error('Error getting user:', e);
            return null;
        }
    },

    // Check if user has permission for menu item
    hasPermission(item, userRole) {
        return item.roles.includes(userRole);
    },

    // Get current page
    getCurrentPage() {
        return window.location.pathname.split('/').pop() || 'dashboard.html';
    },

    // Get dashboard URL based on user role
    getDashboardUrl(userRole) {
        if (userRole === 'advisor' || userRole === 'consultant') {
            return 'advisor-dashboard.html';
        } else if (userRole === 'client') {
            return 'client-dashboard.html';
        } else {
            // admin, saas
            return 'dashboard.html';
        }
    },

    // Load client list for advisors/consultants
    async loadClientList() {
        try {
            const API_BASE = 'https://app.growthmanagerpro.com';
            const response = await fetch(`${API_BASE}/api/advisor/clients`);
            const result = await response.json();
            
            if (result.success && result.clients) {
                const dropdown = document.getElementById('navClientDropdown');
                if (dropdown) {
                    dropdown.innerHTML = '<option value="">My Dashboard (All Clients)</option>';
                    result.clients.forEach(client => {
                        const option = document.createElement('option');
                        option.value = client.id;
                        option.textContent = client.company_name || client.name || 'Unnamed Client';
                        dropdown.appendChild(option);
                    });
                }
            }
        } catch (error) {
            console.error('[Nav] Error loading clients:', error);
        }
    },

    // Switch client view (for advisors/consultants)
    switchClient(clientId) {
        if (!clientId) {
            localStorage.removeItem('viewingClientId');
            window.location.reload();
            return;
        }
        localStorage.setItem('viewingClientId', clientId);
        window.location.reload();
    },

    // Render navigation
    render() {
        const user = this.getCurrentUser();
        if (!user) {
            console.log('[Nav] No user found, skipping nav render');
            return;
        }

        const userRole = user.role || user.user_type || 'client';
        const currentPage = this.getCurrentPage();
        
        // Get correct dashboard URL for this user's role
        const dashboardUrl = this.getDashboardUrl(userRole);
        
        // Add dashboard to overview section dynamically at the beginning
        this.menuItems.overview.unshift(
            { name: 'Dashboard', url: dashboardUrl, icon: '📊', roles: ['admin', 'advisor', 'consultant', 'client', 'saas'] }
        );

        // Get user display name with fallback chain
        const userName = user.full_name || user.name || (user.email ? user.email.split('@')[0] : 'User');
        const initials = userName.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
        
        // Role display names
        const roleNames = {
            'admin': '👑 ADMIN',
            'saas': '🚀 SAAS',
            'advisor': '🎯 ADVISOR',
            'consultant': '💼 CONSULTANT',
            'client': '👤 CLIENT'
        };
        const roleDisplay = roleNames[userRole] || userRole.toUpperCase();

        // Create nav container
        const nav = document.createElement('nav');
        nav.id = 'main-navigation';
        nav.style.cssText = `
            position: fixed;
            left: 0;
            top: 0;
            width: 280px;
            height: 100vh;
            background: white;
            border-right: 1px solid #e5e7eb;
            overflow-y: auto;
            z-index: 1000;
            display: flex;
            flex-direction: column;
            box-shadow: 2px 0 8px rgba(0,0,0,0.05);
        `;

        let navHTML = '';

        // Header section
        navHTML += `
            <div style="
                padding: 2rem 2rem 1rem 2rem;
                border-bottom: 2px solid #e1e5e9;
            ">
                <h1 style="
                    font-size: 1.5rem;
                    color: #2c3e50;
                    margin: 0 0 0.5rem 0;
                    font-weight: 700;
                ">Growth Manager Pro</h1>
                <p style="
                    font-size: 0.875rem;
                    color: #7f8c8d;
                    margin: 0;
                ">Business Growth Platform</p>
            </div>
        `;

        // User Profile section
        navHTML += `
            <div style="
                padding: 1.5rem 2rem;
                background: linear-gradient(135deg, #e8f4f8 0%, #d6eaf8 100%);
                margin: 1rem 1.5rem;
                border-radius: 12px;
            ">
                <div style="
                    display: flex;
                    align-items: center;
                    gap: 1rem;
                ">
                    <div style="
                        width: 48px;
                        height: 48px;
                        border-radius: 50%;
                        background: linear-gradient(135deg, #3498db, #2980b9);
                        color: white;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        font-weight: 700;
                        font-size: 1.25rem;
                        flex-shrink: 0;
                    ">${initials}</div>
                    <div style="flex: 1; min-width: 0;">
                        <div style="
                            font-size: 1rem;
                            font-weight: 600;
                            color: #2c3e50;
                            margin-bottom: 0.25rem;
                            white-space: nowrap;
                            overflow: hidden;
                            text-overflow: ellipsis;
                        ">${userName}</div>
                        <div style="
                            font-size: 0.75rem;
                            color: #5a6c7d;
                            font-weight: 500;
                            letter-spacing: 0.5px;
                        ">${roleDisplay}</div>
                    </div>
                </div>
            </div>
        `;

        // Client Selector (only for advisors/consultants)
        if (userRole === 'advisor' || userRole === 'consultant') {
            navHTML += `
                <div style="
                    padding: 0 2rem 1rem 2rem;
                ">
                    <label style="
                        display: block;
                        font-size: 0.85rem;
                        color: #5a6c7d;
                        margin-bottom: 0.5rem;
                        font-weight: 600;
                    ">📊 View Client:</label>
                    <select id="navClientDropdown" onchange="NavComponent.switchClient(this.value)" style="
                        width: 100%;
                        padding: 0.75rem;
                        border: 2px solid #e1e5e9;
                        border-radius: 8px;
                        font-size: 0.95rem;
                        color: #2c3e50;
                        background: white;
                        cursor: pointer;
                        transition: all 0.2s ease;
                    ">
                        <option value="">My Dashboard (All Clients)</option>
                    </select>
                </div>
            `;
        }

        // Navigation sections - scrollable area
        navHTML += '<div style="flex: 1; overflow-y: auto;">';

        // Section titles mapping
        const sectionTitles = {
            'profile': 'PROFILE',
            'overview': 'OVERVIEW',
            'acquisition': 'ACQUISITION',
            'sales': 'SALES & REVENUE',
            'marketing': 'MARKETING',
            'settings': 'SETTINGS'
        };

        // Render each section
        Object.keys(this.menuItems).forEach(section => {
            const items = this.menuItems[section];
            const filteredItems = items.filter(item => this.hasPermission(item, userRole));

            if (filteredItems.length > 0) {
                // Section header
                navHTML += `
                    <div style="
                        padding: 1rem 2rem 0.5rem;
                        font-size: 0.75rem;
                        font-weight: 600;
                        color: #95a5a6;
                        text-transform: uppercase;
                        letter-spacing: 1px;
                    ">${sectionTitles[section]}</div>
                `;

                // Menu items
                filteredItems.forEach(item => {
                    const isActive = currentPage === item.url;
                    navHTML += `
                        <a href="/${item.url}" style="
                            display: flex;
                            align-items: center;
                            gap: 0.8rem;
                            padding: 0.8rem 2rem;
                            color: ${isActive ? 'white' : '#5a6c7d'};
                            background: ${isActive ? 'linear-gradient(135deg, #3498db 0%, #2980b9 100%)' : 'transparent'};
                            text-decoration: none;
                            transition: all 0.2s ease;
                            position: relative;
                            font-weight: ${isActive ? '600' : '400'};
                        " 
                        onmouseover="if (!${isActive}) { this.style.background='#f8f9fa'; this.style.color='#2c3e50'; }" 
                        onmouseout="if (!${isActive}) { this.style.background='transparent'; this.style.color='#5a6c7d'; }">
                            ${isActive ? '<div style="position:absolute;left:0;top:0;bottom:0;width:4px;background:#2980b9;"></div>' : ''}
                            <span style="font-size: 1.2rem; width: 20px;">${item.icon}</span>
                            <span>${item.name}</span>
                        </a>
                    `;
                });
            }
        });

        navHTML += '</div>'; // End scrollable area

        // Logout button at very bottom
        navHTML += `
            <div style="
                padding: 1rem 2rem;
                background: white;
                border-top: 2px solid #e1e5e9;
            ">
                <button onclick="localStorage.clear(); window.location.href='/login.html';" style="
                    width: 100%;
                    padding: 0.75rem;
                    background: #e74c3c;
                    color: white;
                    border: none;
                    border-radius: 8px;
                    font-size: 0.95rem;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s ease;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 0.5rem;
                " onmouseover="this.style.background='#c0392b'" onmouseout="this.style.background='#e74c3c'">
                    <span>→</span>
                    <span>Logout</span>
                </button>
            </div>
        `;

        nav.innerHTML = navHTML;
        document.body.appendChild(nav);

        // Add left margin to main content
        const container = document.querySelector('.container') || document.querySelector('.main-content');
        if (container) {
            container.style.marginLeft = '300px';
            container.style.transition = 'margin-left 0.3s';
        }

        // Load client list for advisors/consultants
        if (userRole === 'advisor' || userRole === 'consultant') {
            this.loadClientList();
        }
    },

    // Initialize - call this on page load
    init() {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.render());
        } else {
            this.render();
        }
    }
};

// Auto-initialize when script loads
NavComponent.init();

console.log('[Nav] Navigation system initialized with 6 sections');
