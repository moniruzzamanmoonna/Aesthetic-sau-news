// js/cloudinary.js
// Cloudinary upload helper — unsigned upload via REST API
// No SDK needed, works directly from browser

const CLOUDINARY_CONFIG = {
  cloudName:    'dcie21nug',
  uploadPreset: 'sau-news',
  folder:       'sau-news',
};

/**
 * Upload a file to Cloudinary
 * @param {File} file - The file object from <input type="file">
 * @param {object} options - Optional overrides
 * @param {function} onProgress - Progress callback (0-100)
 * @returns {Promise<{url: string, publicId: string, width: number, height: number}>}
 */
async function uploadToCloudinary(file, options = {}, onProgress = null) {
  const { cloudName, uploadPreset, folder } = { ...CLOUDINARY_CONFIG, ...options };

  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', uploadPreset);
  formData.append('folder', folder);

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    // Progress tracking
    if (onProgress) {
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          onProgress(Math.round((e.loaded / e.total) * 100));
        }
      });
    }

    xhr.addEventListener('load', () => {
      if (xhr.status === 200) {
        const data = JSON.parse(xhr.responseText);
        resolve({
          url:       data.secure_url,
          publicId:  data.public_id,
          width:     data.width,
          height:    data.height,
          format:    data.format,
          bytes:     data.bytes,
        });
      } else {
        reject(new Error(`Cloudinary upload failed: ${xhr.status} ${xhr.responseText}`));
      }
    });

    xhr.addEventListener('error', () => reject(new Error('Cloudinary upload network error')));
    xhr.addEventListener('abort', () => reject(new Error('Cloudinary upload aborted')));

    xhr.open('POST', `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`);
    xhr.send(formData);
  });
}

/**
 * Get optimized image URL with transformations
 * @param {string} publicId - Cloudinary public ID
 * @param {object} transforms - Transformation options
 * @returns {string} Optimized image URL
 */
function getImageUrl(publicId, transforms = {}) {
  const {
    width   = 'auto',
    height  = '',
    crop    = 'fill',
    quality = 'auto',
    format  = 'auto',
    gravity = 'auto',
  } = transforms;

  const parts = [
    `q_${quality}`,
    `f_${format}`,
    `c_${crop}`,
    width  !== 'auto' ? `w_${width}`   : '',
    height             ? `h_${height}`  : '',
    gravity !== 'auto' ? `g_${gravity}` : '',
  ].filter(Boolean).join(',');

  return `https://res.cloudinary.com/${CLOUDINARY_CONFIG.cloudName}/image/upload/${parts}/${publicId}`;
}

/**
 * Delete an image from Cloudinary
 * Note: Deletion from browser requires signed requests.
 * This is a placeholder — implement via Cloud Function for production.
 * @param {string} publicId
 */
function deleteFromCloudinary(publicId) {
  console.warn('[Cloudinary] Browser-side deletion requires signed requests. Use a Cloud Function.');
  return Promise.resolve();
}

// ── Exports ──────────────────────────────────────────────────────────────────
window.SAU = window.SAU || {};
window.SAU.cloudinary = {
  config: CLOUDINARY_CONFIG,
  upload: uploadToCloudinary,
  getImageUrl,
  delete: deleteFromCloudinary,
};

console.log('[SAU] Cloudinary initialized ✓ cloud:', CLOUDINARY_CONFIG.cloudName);
