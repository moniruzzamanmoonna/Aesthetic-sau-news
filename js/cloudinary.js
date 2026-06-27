// js/cloudinary.js
(function() {

const CLOUDINARY_CONFIG = {
  cloudName:    'dcie21nug',
  uploadPreset: 'sau-news',
  folder:       'sau-news',
};

async function uploadToCloudinary(file, options = {}, onProgress = null) {
  const { cloudName, uploadPreset, folder } = { ...CLOUDINARY_CONFIG, ...options };
  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', uploadPreset);
  formData.append('folder', folder);

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    if (onProgress) {
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
      });
    }
    xhr.addEventListener('load', () => {
      if (xhr.status === 200) {
        const data = JSON.parse(xhr.responseText);
        resolve({ url: data.secure_url, publicId: data.public_id, width: data.width, height: data.height, format: data.format, bytes: data.bytes });
      } else {
        reject(new Error('Cloudinary upload failed: ' + xhr.status));
      }
    });
    xhr.addEventListener('error', () => reject(new Error('Cloudinary upload network error')));
    xhr.open('POST', 'https://api.cloudinary.com/v1_1/' + cloudName + '/image/upload');
    xhr.send(formData);
  });
}

function getImageUrl(publicId, transforms = {}) {
  const { width = 'auto', height = '', crop = 'fill', quality = 'auto', format = 'auto' } = transforms;
  const parts = ['q_' + quality, 'f_' + format, 'c_' + crop,
    width !== 'auto' ? 'w_' + width : '', height ? 'h_' + height : ''].filter(Boolean).join(',');
  return 'https://res.cloudinary.com/' + CLOUDINARY_CONFIG.cloudName + '/image/upload/' + parts + '/' + publicId;
}

window.SAU = window.SAU || {};
window.SAU.cloudinary = {
  config: CLOUDINARY_CONFIG,
  upload: uploadToCloudinary,
  getImageUrl,
  delete: function(publicId) { console.warn('[Cloudinary] Browser deletion needs Cloud Function.'); return Promise.resolve(); }
};

console.log('[SAU] Cloudinary initialized ✓ cloud:', CLOUDINARY_CONFIG.cloudName);

})(); // end IIFE
