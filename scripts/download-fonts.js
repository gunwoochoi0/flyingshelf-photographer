#!/usr/bin/env node

/**
 * Pre-download common Google Fonts for Docker builds
 * This ensures fonts are available even in restricted network environments
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const FONTS_DIR = path.join(__dirname, '..', '.fonts-cache');

// Common fonts to pre-download
const FONTS_TO_DOWNLOAD = [
  {
    name: 'Roboto',
    urls: [
      { weight: '300', url: 'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/roboto/Roboto-Light.ttf' },
      { weight: '400', url: 'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/roboto/Roboto-Regular.ttf' },
      { weight: '700', url: 'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/roboto/Roboto-Bold.ttf' },
    ]
  },
  {
    name: 'Montserrat',
    urls: [
      { weight: '300', url: 'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/montserrat/Montserrat-Light.ttf' },
      { weight: '400', url: 'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/montserrat/Montserrat-Regular.ttf' },
      { weight: '700', url: 'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/montserrat/Montserrat-Bold.ttf' },
    ]
  },
  {
    name: 'Inter',
    urls: [
      { weight: '300', url: 'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/inter/Inter[slnt,wght].ttf' },
      { weight: '400', url: 'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/inter/Inter[slnt,wght].ttf' },
      { weight: '700', url: 'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/inter/Inter[slnt,wght].ttf' },
    ]
  },
  {
    name: 'Open Sans',
    urls: [
      { weight: '300', url: 'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/opensans/OpenSans[wdth,wght].ttf' },
      { weight: '400', url: 'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/opensans/OpenSans[wdth,wght].ttf' },
      { weight: '700', url: 'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/opensans/OpenSans[wdth,wght].ttf' },
    ]
  }
];

// Ensure fonts directory exists
if (!fs.existsSync(FONTS_DIR)) {
  fs.mkdirSync(FONTS_DIR, { recursive: true });
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    
    https.get(url, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        // Handle redirect
        downloadFile(response.headers.location, dest).then(resolve).catch(reject);
        return;
      }
      
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download: ${response.statusCode}`));
        return;
      }
      
      response.pipe(file);
      
      file.on('finish', () => {
        file.close();
        resolve();
      });
      
      file.on('error', (err) => {
        fs.unlink(dest, () => {}); // Delete the file async
        reject(err);
      });
    }).on('error', (err) => {
      fs.unlink(dest, () => {}); // Delete the file async
      reject(err);
    });
  });
}

async function downloadFonts() {
  console.log('📦 Pre-downloading fonts for Docker build...\n');
  
  for (const font of FONTS_TO_DOWNLOAD) {
    console.log(`⬇️  Downloading ${font.name}...`);
    
    for (const variant of font.urls) {
      const filename = `${font.name.replace(/\s+/g, '-')}-${variant.weight}.ttf`;
      const filepath = path.join(FONTS_DIR, filename);
      
      if (fs.existsSync(filepath)) {
        console.log(`  ✓ ${variant.weight} already exists`);
        continue;
      }
      
      try {
        await downloadFile(variant.url, filepath);
        const stats = fs.statSync(filepath);
        console.log(`  ✓ Downloaded ${variant.weight} (${(stats.size / 1024).toFixed(1)}KB)`);
      } catch (error) {
        console.error(`  ❌ Failed to download ${variant.weight}: ${error.message}`);
      }
    }
  }
  
  console.log('\n✅ Font pre-download complete!');
  console.log(`📁 Fonts saved to: ${FONTS_DIR}`);
}

// Run the download
downloadFonts().catch(console.error);
