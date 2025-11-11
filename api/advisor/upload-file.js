// /api/advisor/upload-file.js
// Handles file uploads from advisors to share with clients

import { createClient } from '@supabase/supabase-js';
import formidable from 'formidable';
import fs from 'fs';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Disable default body parser to handle multipart/form-data
export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ 
      success: false, 
      error: 'Method not allowed' 
    });
  }

  try {
    console.log('[Upload File] Processing file upload...');

    // Parse the multipart form data
    const form = formidable({
      maxFileSize: 10 * 1024 * 1024, // 10MB limit
      keepExtensions: true,
    });

    const [fields, files] = await new Promise((resolve, reject) => {
      form.parse(req, (err, fields, files) => {
        if (err) reject(err);
        resolve([fields, files]);
      });
    });

    // Extract data
    const advisorId = fields.advisorId?.[0];
    const clientId = fields.clientId?.[0] || null;
    const uploadedFile = files.file?.[0];

    if (!advisorId || !uploadedFile) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required fields: advisorId and file' 
      });
    }

    console.log('[Upload File] File details:', {
      name: uploadedFile.originalFilename,
      size: uploadedFile.size,
      type: uploadedFile.mimetype
    });

    // Read file content as base64 (for storage or further processing)
    const fileContent = fs.readFileSync(uploadedFile.filepath);
    const base64Content = fileContent.toString('base64');

    // Store file metadata in database
    // NOTE: For production, upload actual file to S3/R2/similar storage
    // and store the URL here. For now, storing metadata only.
    const { data: fileRecord, error: dbError } = await supabase
      .from('advisor_files')
      .insert([{
        advisor_id: advisorId,
        client_id: clientId,
        filename: uploadedFile.originalFilename,
        file_size: uploadedFile.size,
        mime_type: uploadedFile.mimetype,
        file_path: null, // Would be S3 URL in production
        uploaded_at: new Date().toISOString(),
        // For demo: storing small files as base64
        // Remove this in production and use proper file storage
        file_data: uploadedFile.size < 1024 * 1024 ? base64Content : null
      }])
      .select()
      .single();

    if (dbError) {
      console.error('[Upload File] Database error:', dbError);
      throw dbError;
    }

    // Clean up temp file
    fs.unlinkSync(uploadedFile.filepath);

    console.log('[Upload File] ✅ File uploaded successfully:', fileRecord.id);

    return res.status(200).json({ 
      success: true, 
      file: {
        id: fileRecord.id,
        filename: fileRecord.filename,
        size: fileRecord.file_size,
        uploaded_at: fileRecord.uploaded_at
      }
    });

  } catch (error) {
    console.error('[Upload File] Error:', error);
    return res.status(500).json({ 
      success: false, 
      error: error.message || 'File upload failed' 
    });
  }
}
