<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Upload Transcript - Growth Manager Pro</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            background: linear-gradient(135deg, #0f2027 0%, #203a43 50%, #2c5364 100%);
            color: #333;
            min-height: 100vh;
            padding: 2rem;
        }
        .container {
            max-width: 900px;
            margin: 0 auto;
        }
        .header-card {
            background: white;
            padding: 2rem;
            border-radius: 12px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            margin-bottom: 2rem;
        }
        .header-card h1 {
            font-size: 28px;
            background: linear-gradient(135deg, #0891b2 0%, #0e7490 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            font-weight: 700;
            margin-bottom: 0.5rem;
        }
        .header-card p {
            color: #64748b;
            font-size: 14px;
        }
        .content-card {
            background: white;
            padding: 30px;
            border-radius: 12px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        .form-group {
            margin-bottom: 1.5rem;
        }
        .form-group label {
            display: block;
            margin-bottom: 0.5rem;
            color: #334155;
            font-weight: 600;
            font-size: 14px;
        }
        .form-group input,
        .form-group select {
            width: 100%;
            padding: 10px 12px;
            border: 2px solid #e2e8f0;
            border-radius: 6px;
            font-size: 14px;
            transition: all 0.3s;
        }
        .form-group input:focus,
        .form-group select:focus {
            outline: none;
            border-color: #0891b2;
            box-shadow: 0 0 0 3px rgba(8, 145, 178, 0.1);
        }
        .upload-area {
            border: 2px dashed #0891b2;
            border-radius: 8px;
            padding: 40px;
            text-align: center;
            cursor: pointer;
            transition: all 0.3s;
            background: #f8fafc;
        }
        .upload-area:hover {
            background: #e0f2fe;
            border-color: #0e7490;
        }
        .upload-area.dragover {
            background: #bae6fd;
            border-color: #0891b2;
        }
        .upload-icon {
            font-size: 48px;
            margin-bottom: 1rem;
        }
        .file-info {
            display: none;
            padding: 1rem;
            background: #f0fdf4;
            border: 1px solid #86efac;
            border-radius: 8px;
            margin-top: 1rem;
        }
        .file-info.show {
            display: block;
        }
        .btn {
            padding: 12px 24px;
            border: none;
            border-radius: 6px;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s;
        }
        .btn-primary {
            background: linear-gradient(135deg, #0891b2 0%, #0e7490 100%);
            color: white;
        }
        .btn-primary:hover:not(:disabled) {
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(8, 145, 178, 0.3);
        }
        .btn-primary:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }
        .btn-secondary {
            background: #f1f5f9;
            color: #475569;
        }
        .btn-secondary:hover {
            background: #e2e8f0;
        }
        .button-group {
            display: flex;
            gap: 1rem;
            margin-top: 2rem;
        }
        .alert {
            padding: 1rem;
            border-radius: 8px;
            margin-bottom: 1rem;
            display: none;
        }
        .alert.show {
            display: block;
        }
        .alert-success {
            background: #d1fae5;
            color: #065f46;
            border: 1px solid #86efac;
        }
        .alert-error {
            background: #fee2e2;
            color: #991b1b;
            border: 1px solid #fca5a5;
        }
        .alert-info {
            background: #dbeafe;
            color: #1e40af;
            border: 1px solid #93c5fd;
        }
        textarea {
            width: 100%;
            min-height: 200px;
            padding: 12px;
            border: 2px solid #e2e8f0;
            border-radius: 6px;
            font-family: 'Courier New', monospace;
            font-size: 13px;
            resize: vertical;
        }
        .preview-section {
            display: none;
            margin-top: 2rem;
            padding-top: 2rem;
            border-top: 2px solid #e2e8f0;
        }
        .preview-section.show {
            display: block;
        }
        .preview-section h3 {
            color: #1e293b;
            margin-bottom: 1rem;
        }
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
            gap: 1rem;
            margin: 1rem 0;
        }
        .stat-box {
            background: #f8fafc;
            padding: 1rem;
            border-radius: 6px;
            text-align: center;
        }
        .stat-value {
            font-size: 24px;
            font-weight: 700;
            color: #0891b2;
        }
        .stat-label {
            font-size: 12px;
            color: #64748b;
            margin-top: 0.25rem;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header-card">
            <h1>📁 Upload Call Transcript</h1>
            <p>Upload Zoom VTT transcript files to pre-qualification calls database</p>
            <button class="btn btn-secondary" onclick="window.location.href='prequal-calls.html'" style="margin-top: 1rem;">
                ← Back to Pre-Qual Calls
            </button>
        </div>

        <div class="content-card">
            <div class="alert alert-info show">
                ℹ️ This tool automatically cleans VTT transcripts and saves them to your database. Apostrophes and special characters are removed to prevent import errors.
            </div>

            <div class="alert" id="success-alert"></div>
            <div class="alert" id="error-alert"></div>

            <form id="upload-form">
                <!-- Call Selection -->
                <div class="form-group">
                    <label for="call-select">Select Pre-Qualification Call *</label>
                    <select id="call-select" required>
                        <option value="">Loading calls...</option>
                    </select>
                </div>

                <!-- File Upload -->
                <div class="form-group">
                    <label>Upload Transcript File *</label>
                    <div class="upload-area" id="upload-area">
                        <div class="upload-icon">📄</div>
                        <p><strong>Drag & drop your .vtt file here</strong></p>
                        <p style="color: #64748b; margin-top: 0.5rem;">or</p>
                        <input type="file" id="file-input" accept=".vtt" style="display: none;" required>
                        <button type="button" class="btn btn-secondary" onclick="document.getElementById('file-input').click()" style="margin-top: 1rem;">
                            Choose File
                        </button>
                    </div>
                    <div class="file-info" id="file-info">
                        <strong id="file-name"></strong>
                        <div style="font-size: 12px; color: #64748b; margin-top: 0.25rem;" id="file-size"></div>
                    </div>
                </div>

                <!-- Preview Section -->
                <div class="preview-section" id="preview-section">
                    <h3>Transcript Preview</h3>
                    <div class="stats-grid">
                        <div class="stat-box">
                            <div class="stat-value" id="stat-lines">0</div>
                            <div class="stat-label">Lines</div>
                        </div>
                        <div class="stat-box">
                            <div class="stat-value" id="stat-speakers">0</div>
                            <div class="stat-label">Speakers</div>
                        </div>
                        <div class="stat-box">
                            <div class="stat-value" id="stat-chars">0</div>
                            <div class="stat-label">Characters Removed</div>
                        </div>
                    </div>
                    <textarea id="transcript-preview" readonly></textarea>
                </div>

                <!-- Buttons -->
                <div class="button-group">
                    <button type="submit" class="btn btn-primary" id="upload-btn" disabled>
                        ✅ Upload to Database
                    </button>
                    <button type="button" class="btn btn-secondary" onclick="resetForm()">
                        🔄 Reset
                    </button>
                </div>
            </form>
        </div>
    </div>

    <script>
        const API_BASE = 'https://growthmanagerpro-backend.vercel.app';
        let currentFile = null;
        let cleanedTranscript = '';
        let selectedCallId = null;

        // Initialize
        document.addEventListener('DOMContentLoaded', () => {
            loadCalls();
            setupFileHandlers();
        });

        // Load pre-qual calls for selection
        async function loadCalls() {
            try {
                const response = await fetch(`${API_BASE}/api/pre-qualification-calls`);
                const result = await response.json();

                if (result.success && result.data.calls) {
                    const select = document.getElementById('call-select');
                    select.innerHTML = '<option value="">-- Select a call --</option>';
                    
                    result.data.calls.forEach(call => {
                        const option = document.createElement('option');
                        option.value = call.id;
                        option.textContent = `${call.guestName} - ${call.company || 'No company'} - ${new Date(call.scheduledDate).toLocaleDateString()}`;
                        select.appendChild(option);
                    });
                }
            } catch (error) {
                console.error('Error loading calls:', error);
                showAlert('error', 'Failed to load calls: ' + error.message);
            }
        }

        // Setup file drag & drop handlers
        function setupFileHandlers() {
            const uploadArea = document.getElementById('upload-area');
            const fileInput = document.getElementById('file-input');

            uploadArea.addEventListener('dragover', (e) => {
                e.preventDefault();
                uploadArea.classList.add('dragover');
            });

            uploadArea.addEventListener('dragleave', () => {
                uploadArea.classList.remove('dragover');
            });

            uploadArea.addEventListener('drop', (e) => {
                e.preventDefault();
                uploadArea.classList.remove('dragover');
                const file = e.dataTransfer.files[0];
                if (file && file.name.endsWith('.vtt')) {
                    handleFile(file);
                } else {
                    showAlert('error', 'Please upload a .vtt file');
                }
            });

            fileInput.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (file) {
                    handleFile(file);
                }
            });

            document.getElementById('call-select').addEventListener('change', (e) => {
                selectedCallId = e.target.value;
                checkFormReady();
            });
        }

        // Handle file upload
        async function handleFile(file) {
            currentFile = file;

            // Show file info
            document.getElementById('file-name').textContent = `📄 ${file.name}`;
            document.getElementById('file-size').textContent = `Size: ${(file.size / 1024).toFixed(2)} KB`;
            document.getElementById('file-info').classList.add('show');

            // Read and clean the file
            try {
                const text = await file.text();
                const result = cleanVTTTranscript(text);
                
                cleanedTranscript = result.text;
                
                // Show preview
                document.getElementById('transcript-preview').value = cleanedTranscript;
                document.getElementById('stat-lines').textContent = result.lineCount;
                document.getElementById('stat-speakers').textContent = result.speakerCount;
                document.getElementById('stat-chars').textContent = result.apostrophesRemoved;
                document.getElementById('preview-section').classList.add('show');
                
                checkFormReady();
            } catch (error) {
                showAlert('error', 'Error reading file: ' + error.message);
            }
        }

        // Clean VTT transcript
        function cleanVTTTranscript(vttContent) {
            const lines = vttContent.split('\n');
            let cleanedLines = [];
            let speakers = new Set();
            let apostrophesRemoved = 0;

            for (let line of lines) {
                line = line.trim();

                // Skip VTT metadata
                if (
                    line === 'WEBVTT' ||
                    line === '' ||
                    line.match(/^\d+$/) ||
                    line.match(/\d{2}:\d{2}:\d{2}\.\d{3} --> \d{2}:\d{2}:\d{2}\.\d{3}/) ||
                    line.startsWith('NOTE') ||
                    line.startsWith('Kind:') ||
                    line.startsWith('Language:')
                ) {
                    continue;
                }

                // Count apostrophes
                apostrophesRemoved += (line.match(/'/g) || []).length;
                apostrophesRemoved += (line.match(/'/g) || []).length;

                // Extract speakers
                const speakerMatch = line.match(/^([^:]+):/);
                if (speakerMatch) {
                    speakers.add(speakerMatch[1].trim());
                }

                // Remove problematic characters
                let cleanLine = line
                    .replace(/'/g, '')
                    .replace(/'/g, '')
                    .replace(/`/g, '')
                    .replace(/"/g, '"')
                    .replace(/"/g, '"');

                if (cleanLine) {
                    cleanedLines.push(cleanLine);
                }
            }

            return {
                text: cleanedLines.join('\n'),
                lineCount: cleanedLines.length,
                speakerCount: speakers.size,
                apostrophesRemoved: apostrophesRemoved
            };
        }

        // Check if form is ready to submit
        function checkFormReady() {
            const uploadBtn = document.getElementById('upload-btn');
            uploadBtn.disabled = !(selectedCallId && cleanedTranscript);
        }

        // Handle form submission
        document.getElementById('upload-form').addEventListener('submit', async (e) => {
            e.preventDefault();

            if (!selectedCallId || !cleanedTranscript) {
                showAlert('error', 'Please select a call and upload a transcript');
                return;
            }

            const uploadBtn = document.getElementById('upload-btn');
            uploadBtn.disabled = true;
            uploadBtn.textContent = '⏳ Uploading...';

            try {
                const response = await fetch(`${API_BASE}/api/upload-transcript`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        callId: selectedCallId,
                        transcript: cleanedTranscript
                    })
                });

                const result = await response.json();

                if (result.success) {
                    showAlert('success', '✅ Transcript uploaded successfully!');
                    setTimeout(() => {
                        window.location.href = 'prequal-calls.html';
                    }, 2000);
                } else {
                    throw new Error(result.error || 'Upload failed');
                }
            } catch (error) {
                console.error('Upload error:', error);
                showAlert('error', '❌ Upload failed: ' + error.message);
                uploadBtn.disabled = false;
                uploadBtn.textContent = '✅ Upload to Database';
            }
        });

        // Show alert message
        function showAlert(type, message) {
            const alertId = type === 'error' ? 'error-alert' : 'success-alert';
            const alert = document.getElementById(alertId);
            const otherAlert = document.getElementById(type === 'error' ? 'success-alert' : 'error-alert');
            
            alert.textContent = message;
            alert.className = `alert alert-${type} show`;
            otherAlert.classList.remove('show');
        }

        // Reset form
        function resetForm() {
            document.getElementById('upload-form').reset();
            document.getElementById('file-info').classList.remove('show');
            document.getElementById('preview-section').classList.remove('show');
            document.getElementById('success-alert').classList.remove('show');
            document.getElementById('error-alert').classList.remove('show');
            currentFile = null;
            cleanedTranscript = '';
            selectedCallId = null;
            checkFormReady();
        }
    </script>
</body>
</html>
