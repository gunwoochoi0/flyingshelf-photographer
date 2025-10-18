/**
 * Dynamic Font Loader - Download and register fonts at runtime
 * Supports both Google Fonts (by name) and custom fonts (by URL)
 */

import { GlobalFonts } from '@napi-rs/canvas';
import { writeFile, mkdir, unlink, readdir, stat } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { readFileSync } from 'fs';
import dns from 'dns';
import { promisify } from 'util';

const FONTS_CACHE_DIR = path.join(process.cwd(), '.fonts-cache');
const PREBUILT_FONTS_DIR = '/usr/share/fonts/truetype/google-fonts'; // Fonts from Docker build
const downloadedFonts = new Map<string, string>(); // fontName -> filePath
const failedFonts = new Set<string>(); // Track fonts that failed to download
const downloadingFonts = new Map<string, Promise<boolean>>(); // Track in-progress downloads

// Use Google's DNS servers for better reliability in Docker
dns.setServers(['8.8.8.8', '8.8.4.4']);

// Debug: List pre-built fonts on startup
(async () => {
  if (existsSync(PREBUILT_FONTS_DIR)) {
    try {
      const files = await readdir(PREBUILT_FONTS_DIR);
      const ttfFiles = files.filter(f => f.endsWith('.ttf'));
      if (ttfFiles.length > 0) {
        console.log(`\n📦 Pre-built fonts directory contains ${ttfFiles.length} TTF files:`);
        // Group by font name
        const fontGroups = new Map<string, string[]>();
        ttfFiles.forEach(file => {
          const fontName = file.replace(/-[a-f0-9]{8}\.ttf$/i, '').replace(/-/g, ' ');
          if (!fontGroups.has(fontName)) {
            fontGroups.set(fontName, []);
          }
          fontGroups.get(fontName)!.push(file);
        });
        
        fontGroups.forEach((files, fontName) => {
          console.log(`   • ${fontName}: ${files.length} variants`);
        });
        console.log('');
      }
    } catch (error) {
      // Ignore errors
    }
  }
})();

// Custom fetch with retry and better error handling
async function fetchWithRetry(url: string, options: any = {}, retries = 3): Promise<Response> {
  for (let i = 0; i < retries; i++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000); // 30s timeout
      
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          ...options.headers,
          'User-Agent': 'Mozilla/5.0 (compatible; CanvasRenderer/1.0)',
        }
      });
      
      clearTimeout(timeout);
      return response;
    } catch (error: any) {
      console.warn(`  Fetch attempt ${i + 1} failed: ${error.message}`);
      
      if (i === retries - 1) {
        // Last attempt - try to diagnose the issue
        if (error.code === 'ENOTFOUND' || error.message.includes('getaddrinfo')) {
          console.error('  DNS resolution failed. Checking connectivity...');
          try {
            const lookup = promisify(dns.lookup);
            await lookup('fonts.googleapis.com');
          } catch (dnsError) {
            console.error('  Cannot resolve fonts.googleapis.com - DNS issue in container');
          }
        }
        throw error;
      }
      
      // Wait before retry
      await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
    }
  }
  throw new Error('All fetch attempts failed');
}

/**
 * Download Google Font by name using google-webfonts-helper API
 */
/**
 * Try to load font from pre-built directory (Docker build)
 */
async function tryLoadPrebuiltFont(fontName: string): Promise<boolean> {
  if (!existsSync(PREBUILT_FONTS_DIR)) {
    return false;
  }
  
  try {
    const safeFilename = fontName.replace(/\s+/g, '-');
    const files = await readdir(PREBUILT_FONTS_DIR);
    
    // Look for font files matching this font name
    // The Docker build creates files like: FontName-hash.ttf
    const fontFiles = files.filter(file => {
      const fileBasename = file.replace(/-[a-f0-9]{8}\.ttf$/i, '');
      return (
        fileBasename.toLowerCase() === safeFilename.toLowerCase() && 
        file.endsWith('.ttf')
      );
    });
    
    if (fontFiles.length === 0) {
      return false;
    }
    
    console.log(`📦 Found ${fontFiles.length} pre-built font files for "${fontName}"`);
    
    // Register all variants found
    let registered = 0;
    const weights = new Set<string>();
    
    for (const file of fontFiles) {
      const fontPath = path.join(PREBUILT_FONTS_DIR, file);
      try {
        GlobalFonts.registerFromPath(fontPath, fontName);
        registered++;
        
        // Try to detect weight from file size or name
        const stats = await stat(fontPath);
        const sizeKb = Math.round(stats.size / 1024);
        
        // Heuristic: smaller files are usually lighter weights
        if (sizeKb < 150) weights.add('300');
        else if (sizeKb > 180) weights.add('700');
        else weights.add('400');
        
      } catch (error: any) {
        console.warn(`  Failed to register pre-built font ${file}:`, error.message);
      }
    }
    
    if (registered > 0) {
      downloadedFonts.set(fontName, PREBUILT_FONTS_DIR);
      console.log(`✅ Loaded pre-built font "${fontName}" (${registered} files, weights: ${Array.from(weights).join(', ')})`);
      return true;
    }
  } catch (error: any) {
    // Silently fail - will try downloading
  }
  
  return false;
}

async function downloadGoogleFont(fontName: string): Promise<boolean> {
  try {
    const safeFilename = fontName.replace(/[^a-zA-Z0-9-_]/g, '-');
    
    // Check if we've already downloaded any variant of this font
    if (downloadedFonts.has(fontName)) {
      console.log(`✓ Google Font "${fontName}" already loaded`);
      return true;
    }

    // First try pre-built fonts from Docker build
    if (await tryLoadPrebuiltFont(fontName)) {
      return true;
    }
    
    // The Google Fonts CSS API is unreliable for getting TTF files.
    // Go straight to the GitHub repository for direct downloads.
    return await downloadGoogleFontDirect(fontName);
  } catch (error: any) {
    console.error(`Failed to download Google Font ${fontName}:`, error.message);
    return false;
  }
}

/**
 * Download from Google Fonts using CSS API (most reliable method)
 * Fetches CSS, extracts TTF URLs, downloads fonts
 */
async function downloadGoogleFontDirect(fontName: string): Promise<boolean> {
  try {
    const safeFilename = fontName.replace(/[^a-zA-Z0-9-_]/g, '-');
    
    console.log(`⬇️  Attempting to download Google Font: ${fontName}`);
    
    // Format font name for Google Fonts API (spaces to +)
    const fontFamily = fontName.replace(/\s+/g, '+');
    
    // Use Google Fonts CSS2 API to get font URLs
    // Request multiple weights: 300 (light), 400 (regular), 500 (medium), 700 (bold)
    const cssUrl = `https://fonts.googleapis.com/css2?family=${fontFamily}:wght@300;400;500;700&display=swap`;
    
    console.log(`  📡 Fetching font CSS from Google Fonts API...`);
    
    const cssResponse = await fetchWithRetry(cssUrl);
    
    if (!cssResponse.ok) {
      console.error(`  ❌ Failed to fetch CSS: HTTP ${cssResponse.status}`);
      return false;
    }
    
    const css = await cssResponse.text();
    
    // Extract TTF URLs from CSS using regex
    // Format: url(https://fonts.gstatic.com/s/roboto/v49/...ttf)
    const ttfUrls: Array<{ url: string; weight: string }> = [];
    const urlRegex = /font-weight:\s*(\d+);[\s\S]*?url\((https:\/\/fonts\.gstatic\.com\/[^)]+\.ttf)\)/g;
    
    let match;
    while ((match = urlRegex.exec(css)) !== null) {
      ttfUrls.push({
        weight: match[1],
        url: match[2]
      });
    }
    
    if (ttfUrls.length === 0) {
      console.error(`  ❌ No TTF URLs found in CSS response`);
      console.log(`  CSS preview: ${css.substring(0, 200)}...`);
      return false;
    }
    
    console.log(`  ℹ️  Found ${ttfUrls.length} font variants to download`);
    
    // Ensure cache directory exists
    await mkdir(FONTS_CACHE_DIR, { recursive: true });
    
    let successCount = 0;
    const downloadedWeights = new Map<string, string>(); // weight -> filepath
    
    for (const { url, weight } of ttfUrls) {
      const variantPath = path.join(FONTS_CACHE_DIR, `${safeFilename}-${weight}.ttf`);
      
      // Check if already cached
      if (existsSync(variantPath)) {
        try {
          GlobalFonts.registerFromPath(variantPath, fontName);
          downloadedWeights.set(weight, variantPath);
          successCount++;
          console.log(`  ✓ Loaded cached variant: ${weight}`);
          continue;
        } catch (error: any) {
          console.warn(`  ⚠️  Corrupted cache file for ${weight}, re-downloading...`);
          try { await unlink(variantPath); } catch {}
        }
      }
      
      try {
        console.log(`  📥 Downloading weight ${weight}...`);
        const fontResponse = await fetchWithRetry(url);
        
        if (!fontResponse.ok) {
          console.warn(`  ⚠️  HTTP ${fontResponse.status} for weight ${weight}`);
          continue;
        }
        
        const arrayBuffer = await fontResponse.arrayBuffer();
        
        if (arrayBuffer.byteLength < 10000) {
          console.warn(`  ⚠️  File too small (${arrayBuffer.byteLength} bytes) for weight ${weight}`);
          continue;
        }
        
        // Save to disk
        await writeFile(variantPath, Buffer.from(arrayBuffer));
        
        // Register with canvas
        GlobalFonts.registerFromPath(variantPath, fontName);
        downloadedWeights.set(weight, variantPath);
        successCount++;
        
        console.log(`  ✅ Downloaded and registered: weight ${weight} (${(arrayBuffer.byteLength / 1024).toFixed(1)}KB)`);
      } catch (error: any) {
        console.error(`  ❌ Failed to download weight ${weight}: ${error.message}`);
      }
    }
    
    if (successCount > 0) {
      downloadedFonts.set(fontName, path.join(FONTS_CACHE_DIR, `${safeFilename}-400.ttf`));
      const weights = Array.from(downloadedWeights.keys()).sort();
      console.log(`✅ Google Font "${fontName}" ready (${successCount} variants: ${weights.join(', ')})`);
      return true;
    }
    
    console.error(`  ❌ Failed to download any variants of ${fontName}`);
    return false;
  } catch (error: any) {
    console.error(`❌ Failed to download Google Font ${fontName}:`, error.message);
    return false;
  }
}

/**
 * Download and register a font from a custom URL
 */
async function downloadCustomFont(fontName: string, fontUrl: string): Promise<boolean> {
  try {
    // Extract extension from URL
    const urlExt = fontUrl.match(/\.(ttf|otf|woff|woff2)$/i);
    const ext = urlExt ? urlExt[1] : 'ttf';
    const safeFilename = fontName.replace(/[^a-zA-Z0-9-_]/g, '-');
    const fontPath = path.join(FONTS_CACHE_DIR, `${safeFilename}.${ext}`);

    // Skip if already exists
    if (existsSync(fontPath)) {
      GlobalFonts.registerFromPath(fontPath, fontName);
      downloadedFonts.set(fontName, fontPath);
      console.log(`✓ Custom font "${fontName}" loaded from cache`);
      return true;
    }

    console.log(`⬇️  Downloading custom font "${fontName}" from ${fontUrl}...`);

    // Download font
    const response = await fetchWithRetry(fontUrl);
    if (!response.ok) {
      console.error(`Failed to download font ${fontName}: HTTP ${response.status}`);
      return false;
    }

    const arrayBuffer = await response.arrayBuffer();
    await writeFile(fontPath, Buffer.from(arrayBuffer));

    // Register font
    GlobalFonts.registerFromPath(fontPath, fontName);
    downloadedFonts.set(fontName, fontPath);

    console.log(`✓ Custom font "${fontName}" downloaded and registered`);
    return true;
  } catch (error: any) {
    console.error(`Failed to download custom font ${fontName}:`, error.message);
    return false;
  }
}

/**
 * Download and register a font (auto-detects Google Font vs custom URL)
 * 
 * @param fontName - The name to register the font as
 * @param fontUrlOrName - Either a full URL or a Google Font name
 * 
 * Examples:
 *   downloadAndRegisterFont("Pacifico", "Pacifico") // Google Font
 *   downloadAndRegisterFont("My Font", "https://cdn.com/font.ttf") // Custom URL
 */
export async function downloadAndRegisterFont(
  fontName: string,
  fontUrlOrName: string,
): Promise<boolean> {
  // Check if already downloaded
  if (downloadedFonts.has(fontName)) {
    return true;
  }

  // Skip if already failed
  if (failedFonts.has(fontName)) {
    return false;
  }

  // Check if a download is already in progress
  if (downloadingFonts.has(fontName)) {
    return downloadingFonts.get(fontName)!;
  }

  const downloadPromise = (async () => {
    try {
      // Ensure cache directory exists
      await mkdir(FONTS_CACHE_DIR, { recursive: true });

      // Detect if it's a URL or Google Font name
      const isUrl =
        fontUrlOrName.startsWith('http://') ||
        fontUrlOrName.startsWith('https://');

      let result: boolean;
      if (isUrl) {
        // Custom font URL
        result = await downloadCustomFont(fontName, fontUrlOrName);
      } else {
        // Google Font by name
        result = await downloadGoogleFont(fontUrlOrName);
      }

      if (!result) {
        failedFonts.add(fontName);
      }
      return result;
    } catch (error: any) {
      console.error(
        `Failed to download/register font ${fontName}:`,
        error.message,
      );
      failedFonts.add(fontName);
      return false;
    } finally {
      downloadingFonts.delete(fontName);
    }
  })();

  downloadingFonts.set(fontName, downloadPromise);
  return downloadPromise;
}

/**
 * Download multiple fonts from a map of fontName -> URL or Google Font name
 */
export async function downloadFonts(
  fonts: Record<string, string>
): Promise<{ success: string[]; failed: string[] }> {
  const success: string[] = [];
  const failed: string[] = [];

  const promises = Object.entries(fonts).map(async ([fontName, fontUrlOrName]) => {
    const result = await downloadAndRegisterFont(fontName, fontUrlOrName);
    if (result) {
      success.push(fontName);
    } else {
      failed.push(fontName);
    }
  });

  await Promise.all(promises);

  return { success, failed };
}

/**
 * Check if a font is available (either system or downloaded)
 */
export function isFontAvailable(fontName: string): boolean {
  // Check if already downloaded at runtime
  if (downloadedFonts.has(fontName)) {
    return true;
  }

  // Check if it's a system font
  const availableFonts = GlobalFonts.families;
  return availableFonts.some(f => 
    f.family.toLowerCase() === fontName.toLowerCase()
  );
}

/**
 * Get all available fonts (system + downloaded)
 */
export function getAvailableFonts(): string[] {
  const systemFonts = GlobalFonts.families.map(f => f.family);
  const runtimeFonts = Array.from(downloadedFonts.keys());
  return [...new Set([...systemFonts, ...runtimeFonts])].sort();
}

