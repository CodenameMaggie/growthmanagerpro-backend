// ADD THIS JAVASCRIPT TO YOUR client-portal.html FILE
// Place it at the beginning of your existing <script> section

const API_URL = 'https://growthmanagerpro-backend.vercel.app';

// Check if user is logged in
const userData = localStorage.getItem('user');
if (!userData) {
    // Not logged in - redirect to login page
    window.location.href = '/login.html';
    throw new Error('Not authenticated');
}

// Parse user data
const user = JSON.parse(userData);

// Check if this is a client (not admin)
if (user.type !== 'client') {
    // This is an admin/advisor - redirect to admin dashboard
    window.location.href = '/dashboard.html';
    throw new Error('Not a client account');
}

// Get the client's UUID
const clientId = user.id;

console.log('Client Portal: Logged in as', user.name, 'with ID', clientId);

// Now fetch the client portal data using their UUID
async function loadClientPortalData() {
    try {
        const response = await fetch(`${API_URL}/api/client-portal?client_id=${clientId}`);
        
        if (!response.ok) {
            throw new Error('Failed to load portal data');
        }
        
        const result = await response.json();
        
        if (!result.success) {
            throw new Error(result.error || 'Failed to load data');
        }
        
        // Update the UI with the client's data
        updateClientPortalUI(result.data);
        
    } catch (error) {
        console.error('Error loading client portal:', error);
        document.getElementById('connection-status').textContent = 'Connection Error';
        document.getElementById('connection-status').classList.add('error');
    }
}

function updateClientPortalUI(data) {
    // Update client name
    document.getElementById('client-name').textContent = data.client.name;
    document.getElementById('client-company').textContent = data.client.company;
    
    // Update stats
    document.getElementById('program-completion').textContent = data.stats.programCompletion + '%';
    document.getElementById('revenue-generated').textContent = '$' + data.stats.revenueGenerated.toLocaleString();
    document.getElementById('roi-multiplier').textContent = data.stats.roiMultiplier + 'x';
    document.getElementById('days-remaining').textContent = data.stats.daysRemaining;
    
    // Update progress bar
    document.getElementById('progress-bar').style.width = data.stats.programCompletion + '%';
    
    // Update milestones
    renderMilestones(data.milestones);
    
    // Update messages
    renderMessages(data.messages);
    
    // Update upcoming calls
    renderUpcomingCalls(data.upcomingCalls);
    
    // Update resources
    renderResources(data.resources);
    
    // Update connection status
    document.getElementById('connection-status').textContent = 'Live Connected';
    document.getElementById('connection-status').classList.add('connected');
}

function renderMilestones(milestones) {
    const container = document.getElementById('milestones-container');
    container.innerHTML = milestones.map(milestone => `
        <div class="milestone ${milestone.status}">
            <div class="milestone-icon">
                ${milestone.status === 'completed' ? '✓' : 
                  milestone.status === 'in-progress' ? '⏳' : '⭕'}
            </div>
            <div class="milestone-content">
                <div class="milestone-title">${milestone.phase}</div>
                ${milestone.date ? `<div class="milestone-date">Completed: ${new Date(milestone.date).toLocaleDateString()}</div>` : ''}
            </div>
        </div>
    `).join('');
}

function renderMessages(messages) {
    const container = document.getElementById('messages-container');
    container.innerHTML = messages.map(msg => `
        <div class="message ${msg.sender === user.name ? 'from-client' : 'from-maggie'}">
            <div class="message-sender">${msg.sender}</div>
            <div class="message-content">${msg.content}</div>
            <div class="message-time">${new Date(msg.timestamp).toLocaleString()}</div>
        </div>
    `).join('');
}

function renderUpcomingCalls(calls) {
    const container = document.getElementById('calls-container');
    if (calls.length === 0) {
        container.innerHTML = '<p>No upcoming calls scheduled</p>';
        return;
    }
    
    container.innerHTML = calls.map(call => `
        <div class="call-item">
            <div class="call-title">${call.title}</div>
            <div class="call-datetime">
                ${new Date(call.date).toLocaleDateString()} at ${call.time}
            </div>
            <a href="${call.zoomLink}" class="zoom-link" target="_blank">Join Zoom Call</a>
        </div>
    `).join('');
}

function renderResources(resources) {
    const container = document.getElementById('resources-container');
    container.innerHTML = resources.map(resource => `
        <div class="resource-item">
            <div class="resource-icon">📄</div>
            <div class="resource-info">
                <div class="resource-title">${resource.title}</div>
                <div class="resource-meta">${resource.type} • ${resource.size}</div>
            </div>
            <a href="${resource.downloadUrl}" class="download-btn" download>Download</a>
        </div>
    `).join('');
}

// Send a new message
async function sendMessage() {
    const messageInput = document.getElementById('message-input');
    const message = messageInput.value.trim();
    
    if (!message) {
        alert('Please enter a message');
        return;
    }
    
    try {
        const response = await fetch(`${API_URL}/api/client-portal`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ clientId: clientId, message: message })
        });
        
        const result = await response.json();
        
        if (result.success) {
            messageInput.value = '';
            // Reload messages
            loadClientPortalData();
        }
        
    } catch (error) {
        console.error('Error sending message:', error);
        alert('Failed to send message');
    }
}

// Logout function
function logout() {
    localStorage.removeItem('user');
    window.location.href = '/login.html';
}

// Load data on page load
loadClientPortalData();

// Refresh data every 2 minutes
setInterval(loadClientPortalData, 120000);
