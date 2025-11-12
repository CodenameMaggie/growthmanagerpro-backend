// auth-helper.js - Enhanced authentication helper with tenant context
// This integrates authentication, permissions, AND multi-tenant support

// Clear corrupted sessions
const storedUser = localStorage.getItem('user');
if (storedUser) {
  const user = JSON.parse(storedUser);
  if (!user.tenant_id) {
    console.log('[Auth] Clearing corrupted session without tenant_id');
    localStorage.removeItem('user');
    sessionStorage.clear();
    window.location.href = '/login.html';
  }
}

const AuthHelper = {
  // Supabase client
  supabaseClient: null,
  
  // Tenant context
  tenantId: null,
  subdomain: null,
  tenantName: null,
  subscriptionStatus: null,
  tenantLoaded: false,

  // Initialize Supabase client
  initSupabase: function(supabaseUrl, supabaseAnonKey) {
    if (typeof supabase !== 'undefined') {
      this.supabaseClient = supabase.createClient(supabaseUrl, supabaseAnonKey);
      
      // Check for existing session and restore it
      const storedSession = localStorage.getItem('supabase_session');
      if (storedSession) {
        try {
          const session = JSON.parse(storedSession);
          this.supabaseClient.auth.setSession(session);
        } catch (e) {
          console.error('Failed to restore Supabase session:', e);
        }
      }
    }
  },

  // ==================== TENANT CONTEXT ====================
  
  // Initialize tenant context from URL subdomain
  initTenant: async function() {
    if (this.tenantLoaded) return this;

    const hostname = window.location.hostname;
    const subdomain = hostname.split('.')[0];
    
    // Check if we're on a subdomain
    const isSubdomain = hostname.includes('.growthmanagerpro.com') &&
                        subdomain !== 'www' &&
                        subdomain !== 'app' &&
                        subdomain !== 'growthmanagerpro';
    
    if (!isSubdomain) {
      console.log('[Auth] Not on a tenant subdomain');
      this.tenantLoaded = true;
      return this;
    }

    this.subdomain = subdomain;
    console.log('[Auth] Detected tenant subdomain:', subdomain);

    // Try to get tenant info from localStorage first (fast)
    const cachedTenantId = localStorage.getItem('tenantId');
    const cachedSubdomain = localStorage.getItem('subdomain');
    
    if (cachedTenantId && cachedSubdomain === subdomain) {
      this.tenantId = cachedTenantId;
      this.tenantName = localStorage.getItem('tenantName');
      this.subscriptionStatus = localStorage.getItem('subscriptionStatus');
      console.log('[Auth] Loaded tenant from cache:', this.tenantId);
      this.tenantLoaded = true;
      return this;
    }

    // Otherwise fetch from API
    try {
      const response = await fetch(`https://app.growthmanagerpro.com/api/get-tenant?subdomain=${subdomain}`);
      const data = await response.json();
      
      if (data.success) {
        this.tenantId = data.tenant.id;
        this.tenantName = data.tenant.business_name;
        this.subscriptionStatus = data.tenant.subscription_status;
        
        // Cache in localStorage
        localStorage.setItem('tenantId', this.tenantId);
        localStorage.setItem('tenantName', this.tenantName);
        localStorage.setItem('subdomain', this.subdomain);
        localStorage.setItem('subscriptionStatus', this.subscriptionStatus);
        
        console.log('[Auth] Loaded tenant from API:', this.tenantName);
      } else {
        console.error('[Auth] Failed to load tenant:', data.error);
        // Redirect to signup if tenant doesn't exist
        if (data.error === 'Tenant not found') {
          window.location.href = 'https://growthmanagerpro.com/signup-saas.html';
          return;
        }
      }
    } catch (error) {
      console.error('[Auth] Error loading tenant:', error);
    }

    this.tenantLoaded = true;
    return this;
  },

  // Get tenant ID (used for filtering API calls)
  getTenantId: function() {
    return this.tenantId || localStorage.getItem('tenantId');
  },

  // Get subdomain
  getSubdomain: function() {
    return this.subdomain || localStorage.getItem('subdomain');
  },

  // Get tenant name
  getTenantName: function() {
    return this.tenantName || localStorage.getItem('tenantName');
  },

  // Check if on subdomain
  isOnSubdomain: function() {
    const hostname = window.location.hostname;
    const subdomain = hostname.split('.')[0];
    return hostname.includes('.growthmanagerpro.com') && 
           subdomain !== 'www' && 
           subdomain !== 'growthmanagerpro';
  },

  // Add tenant_id to API requests automatically
  addTenantToRequest: function(url, options = {}) {
    const tenantId = this.getTenantId();
    
    if (!tenantId) {
      console.warn('[Auth] No tenant ID available for request');
      return { url, options };
    }

    // Add tenant_id to URL params
    const urlObj = new URL(url, window.location.origin);
    urlObj.searchParams.set('tenant_id', tenantId);

    // Add to headers as well
    options.headers = options.headers || {};
    options.headers['X-Tenant-ID'] = tenantId;

    return { url: urlObj.toString(), options };
  },

  // ==================== AUTHENTICATION ====================

  // Get current user from localStorage
  getCurrentUser: function() {
    const userData = localStorage.getItem('user');
    if (!userData) return null;
    
    try {
      return JSON.parse(userData);
    } catch (e) {
      console.error('Invalid user data in localStorage');
      localStorage.removeItem('user');
      return null;
    }
  },

  // Get Supabase auth session
  getSupabaseSession: async function() {
    if (!this.supabaseClient) return null;
    
    try {
      const { data, error } = await this.supabaseClient.auth.getSession();
      if (error) {
        console.error('Error getting Supabase session:', error);
        return null;
      }
      return data.session;
    } catch (e) {
      console.error('Failed to get Supabase session:', e);
      return null;
    }
  },

  // Check if user is logged in
  isLoggedIn: function() {
    return this.getCurrentUser() !== null;
  },

  // Require authentication - redirect to login if not logged in
  requireAuth: function() {
    if (!this.isLoggedIn()) {
      // Preserve subdomain when redirecting to login
      if (this.isOnSubdomain()) {
        const subdomain = this.getSubdomain();
        window.location.href = `https://${subdomain}.growthmanagerpro.com/login.html`;
      } else {
        window.location.href = '/login.html';
      }
      return false;
    }
    return true;
  },

  // Check if user has a specific permission
  hasPermission: function(permission) {
    const user = this.getCurrentUser();
    if (!user) return false;
    
    const userPermissions = user.permissions;
    
    // Admin has all permissions
    if (userPermissions === 'all') return true;
    
    // Check if permission is in user's permission array
    if (Array.isArray(userPermissions)) {
      return userPermissions.includes(permission);
    }
    
    return false;
  },

  // Check if user can access current page
  canAccessPage: function(pageName) {
    const user = this.getCurrentUser();
    if (!user) return false;
    
    // Map pages to required permissions
    const pagePermissions = {
      'dashboard.html': 'dashboard.view',
      'advisor-dashboard.html': 'advisor-dashboard.view',
      'contacts.html': 'contacts.view',
      'podcast-calls.html': 'calls.view',
      'podcast-interviews.html': 'calls.view',
      'discovery-calls.html': 'calls.view',
      'strategy-calls.html': 'calls.view',
      'pipeline.html': 'pipeline.view',
      'deals.html': 'deals.view',
      'cash-flow.html': 'financials.view',
      'campaigns.html': 'campaigns.view',
      'sprints.html': 'sprints.view',
      'availability.html': 'sprints.view',
      'expense-tracker.html': 'financials.view',
      'user-management.html': 'users.view',
      'client-portal.html': 'dashboard.view',
      'analytics.html': 'dashboard.view',
      'reports.html': 'dashboard.view'
    };
    
    const requiredPermission = pagePermissions[pageName];
    
    // If no specific permission required, allow access
    if (!requiredPermission) return true;
    
    // Check if user has the required permission
    return this.hasPermission(requiredPermission);
  },

  // Protect a page - call this at the start of page load
  protectPage: async function(pageName) {
    console.log('[Auth] Protecting page:', pageName);
    
    // First initialize tenant context if on subdomain
    if (this.isOnSubdomain()) {
      await this.initTenant();
      console.log('[Auth] Tenant context loaded:', this.getTenantName());
    }
    
    // Then check if logged in
    if (!this.requireAuth()) {
      console.log('[Auth] Not logged in, redirecting to login');
      return false;
    }
    
    const user = this.getCurrentUser();
    console.log('[Auth] Current user:', user.email, 'Role:', user.role);
    
    // Verify user belongs to this tenant (if on subdomain)
    if (this.isOnSubdomain()) {
      const userTenantId = user.tenant_id;
      const currentTenantId = this.getTenantId();
      
      if (userTenantId && currentTenantId && userTenantId !== currentTenantId) {
        console.log('[Auth] User does not belong to this tenant');
        alert('You do not have access to this organization.');
        this.logout();
        return false;
      }
    }
    
    // Check if user can access this specific page
    if (!this.canAccessPage(pageName)) {
      console.log('[Auth] User does not have permission for:', pageName);
      alert('You do not have permission to access this page.');
      
      // Redirect based on user type
      if (user.type === 'client') {
        window.location.href = '/client-portal.html';
      } else if (user.role === 'advisor') {
        window.location.href = '/advisor-dashboard.html';
      } else {
        window.location.href = '/dashboard.html';
      }
      return false;
    }
    
    console.log('[Auth] Page access granted');
    return true;
  },

  // Logout user
  logout: async function() {
    // Sign out from Supabase
    if (this.supabaseClient) {
      try {
        await this.supabaseClient.auth.signOut();
      } catch (e) {
        console.error('Error signing out from Supabase:', e);
      }
    }
    
    // Clear all storage
    localStorage.removeItem('user');
    localStorage.removeItem('token');
    localStorage.removeItem('supabase_session');
    localStorage.removeItem('tenantId');
    localStorage.removeItem('tenantName');
    localStorage.removeItem('subdomain');
    localStorage.removeItem('subscriptionStatus');
    
    // Redirect to login (preserve subdomain if applicable)
    if (this.isOnSubdomain()) {
      const subdomain = this.getSubdomain();
      window.location.href = `https://${subdomain}.growthmanagerpro.com/login.html`;
    } else {
      window.location.href = '/login.html';
    }
  },

  // Get user's role
  getUserRole: function() {
    const user = this.getCurrentUser();
    return user ? user.role : null;
  },

  // Check if user is admin
  isAdmin: function() {
    const user = this.getCurrentUser();
    return user && user.role === 'admin';
  },

  // Check if user is client
  isClient: function() {
    const user = this.getCurrentUser();
    return user && user.type === 'client';
  },

  // Show/hide elements based on permissions
  applyPermissions: function() {
    const user = this.getCurrentUser();
    if (!user) return;

    console.log('[Auth] Applying permissions for:', user.role);

    // Hide elements that require specific permissions
    document.querySelectorAll('[data-requires-permission]').forEach(element => {
      const requiredPermission = element.getAttribute('data-requires-permission');
      if (!this.hasPermission(requiredPermission)) {
        element.style.display = 'none';
      }
    });

    // Hide elements that require admin access
    document.querySelectorAll('[data-admin-only]').forEach(element => {
      if (!this.isAdmin()) {
        element.style.display = 'none';
      }
    });

    // Hide elements from clients
    document.querySelectorAll('[data-hide-from-client]').forEach(element => {
      if (this.isClient()) {
        element.style.display = 'none';
      }
    });
  },

  // Get authenticated Supabase client for API calls
  getAuthenticatedClient: function() {
    return this.supabaseClient;
  },

  // Display tenant info in UI (helper for dashboards)
  displayTenantInfo: function(elementId) {
    const element = document.getElementById(elementId);
    if (!element) return;
    
    if (this.isOnSubdomain()) {
      const tenantName = this.getTenantName();
      const subscriptionStatus = this.subscriptionStatus || localStorage.getItem('subscriptionStatus');
      
      element.innerHTML = `
        <div style="padding: 0.5rem 1rem; background: #f8f9fa; border-radius: 8px; font-size: 0.9rem;">
          <strong>${tenantName || 'Loading...'}</strong>
          ${subscriptionStatus ? `<span style="margin-left: 0.5rem; color: #7f8c8d;">(${subscriptionStatus})</span>` : ''}
        </div>
      `;
    }
  }
};

// Auto-initialize tenant context on page load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    AuthHelper.initTenant();
  });
} else {
  AuthHelper.initTenant();
}

// Example usage in your HTML pages:
/*

<!-- Load auth-helper -->
<script src="auth-helper.js"></script>

<script>
  // Protect this page - automatically handles both auth AND tenant context
  AuthHelper.protectPage('dashboard.html').then(granted => {
    if (granted) {
      // Page access granted, load page content
      loadDashboard();
      
      // Apply permissions to UI elements
      AuthHelper.applyPermissions();
      
      // Display tenant info (optional, for SaaS tenants)
      AuthHelper.displayTenantInfo('tenant-info-container');
    }
  });
  
  // When making API calls, include tenant context
  async function loadContacts() {
    const { url, options } = AuthHelper.addTenantToRequest(
      'https://app.growthmanagerpro.com/api/contacts',
      { method: 'GET' }
    );
    
    const response = await fetch(url, options);
    const data = await response.json();
    // ... handle data
  }
</script>

*/
