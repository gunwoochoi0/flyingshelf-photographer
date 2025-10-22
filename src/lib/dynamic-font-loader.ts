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

// In-memory cache for network responses to avoid repeated fetches
const cssCache = new Map<string, string>(); // cssUrl -> css text
const fontMetadataCache = new Map<string, { urls: Array<{ url: string; weight: string }>; timestamp: number }>(); // fontName -> metadata
const CACHE_TTL = 1000 * 60 * 60 * 24; // 24 hours

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
      
      // Use a server-side User-Agent to get TTF files instead of WOFF2 from Google Fonts
      const defaultUserAgent = url.includes('fonts.googleapis.com') 
        ? 'curl/7.64.1' // Server-like UA returns TTF files
        : 'Mozilla/5.0 (compatible; CanvasRenderer/1.0)';
      
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          'User-Agent': defaultUserAgent,
          ...options.headers,
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
    // Clean font name: Strip CSS fallbacks (e.g., "Montserrat, sans-serif" → "Montserrat")
    const cleanFontName = fontName.split(',')[0].trim();
    
    const safeFilename = cleanFontName.replace(/[^a-zA-Z0-9-_]/g, '-');
    
    // Check if we've already downloaded any variant of this font (use original name for cache key)
    if (downloadedFonts.has(fontName) || downloadedFonts.has(cleanFontName)) {
      console.log(`✓ Google Font "${cleanFontName}" already loaded`);
      return true;
    }

    // First try pre-built fonts from Docker build
    if (await tryLoadPrebuiltFont(cleanFontName)) {
      // Register under both names
      downloadedFonts.set(fontName, downloadedFonts.get(cleanFontName) || '');
      return true;
    }
    
    // The Google Fonts CSS API is unreliable for getting TTF files.
    // Go straight to the GitHub repository for direct downloads.
    const result = await downloadGoogleFontDirect(cleanFontName);
    
    // If successful, register font files with the ORIGINAL name too (for @napi-rs/canvas)
    if (result && downloadedFonts.has(cleanFontName)) {
      const fontPath = downloadedFonts.get(cleanFontName);
      downloadedFonts.set(fontName, fontPath || '');
      
      // Also register all font files with the original name (e.g., "Playfair Display, serif")
      // This is critical because ctx.font will use the original name
      if (fontPath) {
        try {
          // Find all variants for this font
          const safeFilename = cleanFontName.replace(/[^a-zA-Z0-9-_]/g, '-');
          const cacheDir = path.join(process.cwd(), '.fonts-cache');
          
          if (existsSync(cacheDir)) {
            const files = await readdir(cacheDir);
            const fontFiles = files.filter(f => f.startsWith(safeFilename) && f.endsWith('.ttf'));
            
            // Register each variant with BOTH the clean name and original name
            for (const file of fontFiles) {
              const filePath = path.join(cacheDir, file);
              try {
                // Register with original name so ctx.font can find it
                GlobalFonts.registerFromPath(filePath, fontName);
              } catch (e) {
                // Already registered, ignore
              }
            }
            
            console.log(`  ✓ Font also registered as "${fontName}" for canvas rendering`);
          }
        } catch (error) {
          // Non-critical, just log
          console.warn(`  ⚠️  Could not register variants with original name:`, error);
        }
      }
    }
    
    return result;
  } catch (error: any) {
    console.error(`Failed to download Google Font ${fontName}:`, error.message);
    return false;
  }
}

/**
 * Fetch Google Fonts CSS with caching and fallback support
 * Tries both css2 and css formats
 * Uses server-like User-Agent to get TTF files instead of WOFF2
 */
async function fetchGoogleFontCSS(fontFamily: string, weights: string[] = ['300', '400', '500', '700']): Promise<string | null> {
  const cacheKey = `${fontFamily}:${weights.join(',')}`;
  
  // Check in-memory cache first
  if (cssCache.has(cacheKey)) {
    console.log(`  💾 Using cached CSS for ${fontFamily}`);
    return cssCache.get(cacheKey)!;
  }
  
  const urls = [
    // CSS2 API (newer, better format)
    `https://fonts.googleapis.com/css2?family=${fontFamily}:wght@${weights.join(';')}&display=swap`,
    // CSS API (older format, fallback)
    `https://fonts.googleapis.com/css?family=${fontFamily}:${weights.join(',')}&display=swap`,
    // Fallback for variable fonts or single-weight fonts (no specific weights)
    `https://fonts.googleapis.com/css2?family=${fontFamily}&display=swap`,
  ];
  
  for (const url of urls) {
    try {
      console.log(`  📡 Fetching CSS from: ${url}`);
      // fetchWithRetry will automatically use server-like User-Agent for fonts.googleapis.com
      const response = await fetchWithRetry(url);
      
      if (response.ok) {
        const css = await response.text();
        if (css.includes('font-face') || css.includes('@font-face')) {
          // Check if we got TTF or WOFF2 format
          const hasTtf = css.includes('.ttf');
          const hasWoff2 = css.includes('.woff2');
          
          console.log(`  ✅ Successfully fetched CSS (${css.length} bytes, format: ${hasTtf ? 'TTF' : hasWoff2 ? 'WOFF2' : 'unknown'})`);
          
          // Cache the successful response
          cssCache.set(cacheKey, css);
          return css;
        }
      }
    } catch (error: any) {
      console.warn(`  ⚠️  Failed to fetch from ${url}: ${error.message}`);
    }
  }
  
  return null;
}

/**
 * Parse font URLs from Google Fonts CSS
 * Works with both css and css2 format responses
 * Supports TTF, WOFF2, and other formats
 */
function parseTTFUrlsFromCSS(css: string): Array<{ url: string; weight: string }> {
  const fontUrls: Array<{ url: string; weight: string }> = [];
  const seenWeights = new Set<string>();
  
  // Pattern 1: CSS2 format with font-weight property (TTF)
  // @font-face { font-family: 'X'; font-weight: 400; src: url(https://...ttf) }
  const css2TtfRegex = /font-weight:\s*(\d+);[\s\S]*?src:\s*url\((https:\/\/fonts\.gstatic\.com\/[^)]+\.ttf)\)/g;
  let match;
  
  while ((match = css2TtfRegex.exec(css)) !== null) {
    const weight = match[1];
    if (!seenWeights.has(weight)) {
      fontUrls.push({ weight, url: match[2] });
      seenWeights.add(weight);
    }
  }
  
  // Pattern 2: Standard CSS format with src: url() and format('truetype')
  // @font-face { font-family: 'X'; src: url(https://...ttf) format('truetype'); }
  if (fontUrls.length === 0) {
    const truetypeRegex = /src:\s*url\((https:\/\/fonts\.gstatic\.com\/[^)]+\.ttf)\)\s*format\(['"]truetype['"]\)/g;
    const weights = ['300', '400', '700'];
    let index = 0;
    
    while ((match = truetypeRegex.exec(css)) !== null) {
      const weight = weights[index] || '400';
      if (!seenWeights.has(weight)) {
        fontUrls.push({ weight, url: match[1] });
        seenWeights.add(weight);
      }
      index++;
    }
  }
  
  // Pattern 3: WOFF2 format (fallback - need to extract from CSS)
  // We'll use only latin subset to avoid duplicates
  if (fontUrls.length === 0) {
    // Match font-weight and corresponding woff2 URL, but only for latin subset
    const sections = css.split('@font-face');
    
    for (const section of sections) {
      // Only process latin subset (avoid duplicates from cyrillic, vietnamese, etc.)
      if (!section.includes('unicode-range') || section.includes('U+0000-00FF')) {
        const weightMatch = section.match(/font-weight:\s*(\d+)/);
        const urlMatch = section.match(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+\.woff2)\)/);
        
        if (weightMatch && urlMatch) {
          const weight = weightMatch[1];
          const woff2Url = urlMatch[1];
          
          // Convert woff2 URL to ttf URL by replacing extension
          // Note: This might not always work, but we'll try
          const ttfUrl = woff2Url.replace(/\.woff2$/, '.ttf');
          
          if (!seenWeights.has(weight)) {
            fontUrls.push({ weight, url: ttfUrl });
            seenWeights.add(weight);
          }
        }
      }
    }
  }
  
  return fontUrls;
}

/**
 * Download from Google Fonts using CSS API (most reliable method)
 * Fetches CSS, extracts TTF URLs, downloads fonts
 * Now supports both css and css2 formats with caching
 */
async function downloadGoogleFontDirect(fontName: string): Promise<boolean> {
  try {
    // Clean the font name to remove quotes for API calls and filenames,
    // but keep the original `fontName` for registration.
    const cleanNameForApi = fontName.replace(/['"]/g, '');
    const safeFilename = cleanNameForApi.replace(/[^a-zA-Z0-9-_]/g, '-');
    
    console.log(`⬇️  Attempting to download Google Font: "${fontName}" (using name for API: "${cleanNameForApi}")`);
    
    // Format font name for Google Fonts API (spaces to +)
    const fontFamily = cleanNameForApi.replace(/\s+/g, '+');
    
    // Check metadata cache first
    const metadataCacheKey = fontName; // Use original name for cache
    let ttfUrls: Array<{ url: string; weight: string }> = [];
    
    if (fontMetadataCache.has(metadataCacheKey)) {
      const cached = fontMetadataCache.get(metadataCacheKey)!;
      const age = Date.now() - cached.timestamp;
      
      if (age < CACHE_TTL) {
        console.log(`  💾 Using cached font metadata (age: ${Math.round(age / 1000 / 60)}min)`);
        ttfUrls = cached.urls;
      } else {
        // Expired cache
        fontMetadataCache.delete(metadataCacheKey);
      }
    }
    
    // If no cached metadata, fetch CSS and parse
    if (ttfUrls.length === 0) {
      const css = await fetchGoogleFontCSS(fontFamily);
      
      if (!css) {
        console.error(`  ❌ Failed to fetch CSS from Google Fonts`);
        return false;
      }
      
      ttfUrls = parseTTFUrlsFromCSS(css);
      
      if (ttfUrls.length === 0) {
        console.error(`  ❌ No TTF URLs found in CSS response`);
        console.log(`  CSS preview: ${css.substring(0, 200)}...`);
        return false;
      }
      
      // Cache the metadata
      fontMetadataCache.set(metadataCacheKey, {
        urls: ttfUrls,
        timestamp: Date.now()
      });
    }
    
    console.log(`  ℹ️  Found ${ttfUrls.length} font variants to download`);
    
    // Ensure cache directory exists
    await mkdir(FONTS_CACHE_DIR, { recursive: true });
    
    let successCount = 0;
    const downloadedWeights = new Map<string, string>(); // weight -> filepath
    
    // Download all variants in parallel for better performance
    const downloadResults = await Promise.allSettled(
      ttfUrls.map(async ({ url, weight }) => {
        const variantPath = path.join(FONTS_CACHE_DIR, `${safeFilename}-${weight}.ttf`);
        
        // Check if already cached
        if (existsSync(variantPath)) {
          try {
            // Register with clean font name for @napi-rs/canvas
            GlobalFonts.registerFromPath(variantPath, fontName);
            downloadedWeights.set(weight, variantPath);
            console.log(`  ✓ Loaded cached variant: ${weight}`);
            return { weight, success: true, path: variantPath };
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
            return { weight, success: false };
          }
          
          const arrayBuffer = await fontResponse.arrayBuffer();
          
          if (arrayBuffer.byteLength < 10000) {
            console.warn(`  ⚠️  File too small (${arrayBuffer.byteLength} bytes) for weight ${weight}`);
            return { weight, success: false };
          }
          
          // Save to disk
          await writeFile(variantPath, Buffer.from(arrayBuffer));
          
          // Register with canvas using clean font name
          GlobalFonts.registerFromPath(variantPath, fontName);
          downloadedWeights.set(weight, variantPath);
          
          console.log(`  ✅ Downloaded and registered: weight ${weight} (${(arrayBuffer.byteLength / 1024).toFixed(1)}KB)`);
          return { weight, success: true, path: variantPath };
        } catch (error: any) {
          console.error(`  ❌ Failed to download weight ${weight}: ${error.message}`);
          return { weight, success: false };
        }
      })
    );
    
    // Count successful downloads
    successCount = downloadResults.filter(
      r => r.status === 'fulfilled' && r.value.success
    ).length;
    
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
 * Supports direct font files (.ttf, .otf, .woff, .woff2) and CSS URLs
 */
async function downloadCustomFont(fontName: string, fontUrl: string): Promise<boolean> {
  try {
    // Clean font name: Strip CSS fallbacks (e.g., "Montserrat, sans-serif" → "Montserrat")
    const cleanFontName = fontName.split(',')[0].trim();
    
    // Check if it's a CSS URL (Google Fonts or similar)
    if (fontUrl.includes('fonts.googleapis.com/css') || fontUrl.includes('.css')) {
      return await downloadFontFromCSSUrl(cleanFontName, fontUrl);
    }
    
    // Extract extension from URL
    const urlExt = fontUrl.match(/\.(ttf|otf|woff|woff2)$/i);
    const ext = urlExt ? urlExt[1] : 'ttf';
    const safeFilename = cleanFontName.replace(/[^a-zA-Z0-9-_]/g, '-');
    const fontPath = path.join(FONTS_CACHE_DIR, `${safeFilename}.${ext}`);

    // Skip if already exists
    if (existsSync(fontPath)) {
      GlobalFonts.registerFromPath(fontPath, cleanFontName);
      downloadedFonts.set(fontName, fontPath);
      downloadedFonts.set(cleanFontName, fontPath);
      console.log(`✓ Custom font "${cleanFontName}" loaded from cache`);
      return true;
    }

    console.log(`⬇️  Downloading custom font "${cleanFontName}" from ${fontUrl}...`);

    // Download font
    const response = await fetchWithRetry(fontUrl);
    if (!response.ok) {
      console.error(`Failed to download font ${cleanFontName}: HTTP ${response.status}`);
      return false;
    }

    const arrayBuffer = await response.arrayBuffer();
    
    if (arrayBuffer.byteLength < 1000) {
      console.error(`Font file too small (${arrayBuffer.byteLength} bytes), likely invalid`);
      return false;
    }
    
    await writeFile(fontPath, Buffer.from(arrayBuffer));

    // Register font with clean name
    GlobalFonts.registerFromPath(fontPath, cleanFontName);
    downloadedFonts.set(fontName, fontPath);
    downloadedFonts.set(cleanFontName, fontPath);

    console.log(`✓ Custom font "${cleanFontName}" downloaded and registered (${(arrayBuffer.byteLength / 1024).toFixed(1)}KB)`);
    return true;
  } catch (error: any) {
    console.error(`Failed to download custom font ${fontName}:`, error.message);
    return false;
  }
}

/**
 * Download font from a CSS URL (e.g., https://fonts.googleapis.com/css?family=Montserrat:300,400,700)
 * Parses the CSS to extract font file URLs and downloads them
 */
async function downloadFontFromCSSUrl(fontName: string, cssUrl: string): Promise<boolean> {
  try {
    console.log(`⬇️  Downloading font from CSS URL: ${cssUrl}`);
    
    // Check CSS cache
    if (cssCache.has(cssUrl)) {
      console.log(`  💾 Using cached CSS response`);
    }
    
    // Fetch CSS if not cached
    let css: string;
    if (cssCache.has(cssUrl)) {
      css = cssCache.get(cssUrl)!;
    } else {
      const response = await fetchWithRetry(cssUrl);
      if (!response.ok) {
        console.error(`  ❌ Failed to fetch CSS: HTTP ${response.status}`);
        return false;
      }
      css = await response.text();
      cssCache.set(cssUrl, css);
    }
    
    // Parse TTF/font URLs from CSS
    const ttfUrls = parseTTFUrlsFromCSS(css);
    
    if (ttfUrls.length === 0) {
      console.error(`  ❌ No font URLs found in CSS`);
      return false;
    }
    
    console.log(`  ℹ️  Found ${ttfUrls.length} font variants`);
    
    // Ensure cache directory exists
    await mkdir(FONTS_CACHE_DIR, { recursive: true });
    
    const safeFilename = fontName.replace(/[^a-zA-Z0-9-_]/g, '-');
    let successCount = 0;
    
    // Download all variants in parallel
    await Promise.all(
      ttfUrls.map(async ({ url, weight }) => {
        const variantPath = path.join(FONTS_CACHE_DIR, `${safeFilename}-${weight}.ttf`);
        
        // Check if already cached
        if (existsSync(variantPath)) {
          try {
            GlobalFonts.registerFromPath(variantPath, fontName);
            successCount++;
            return;
          } catch (error: any) {
            console.warn(`  ⚠️  Corrupted cache for weight ${weight}, re-downloading...`);
            try { await unlink(variantPath); } catch {}
          }
        }
        
        try {
          const response = await fetchWithRetry(url);
          if (!response.ok) return;
          
          const arrayBuffer = await response.arrayBuffer();
          if (arrayBuffer.byteLength < 1000) return;
          
          await writeFile(variantPath, Buffer.from(arrayBuffer));
          GlobalFonts.registerFromPath(variantPath, fontName);
          successCount++;
          
          console.log(`  ✅ Downloaded weight ${weight} (${(arrayBuffer.byteLength / 1024).toFixed(1)}KB)`);
        } catch (error: any) {
          console.warn(`  ⚠️  Failed to download weight ${weight}: ${error.message}`);
        }
      })
    );
    
    if (successCount > 0) {
      downloadedFonts.set(fontName, path.join(FONTS_CACHE_DIR, `${safeFilename}-400.ttf`));
      console.log(`✅ Font "${fontName}" ready (${successCount} variants)`);
      return true;
    }
    
    return false;
  } catch (error: any) {
    console.error(`Failed to download font from CSS URL:`, error.message);
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
  // Add a set of generic font families to skip downloading
  const genericFontFamilies = new Set([
    'serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui',
    'ui-serif', 'ui-sans-serif', 'ui-monospace', 'ui-rounded',
    'emoji', 'math', 'fangsong',
    // Common system fonts that shouldn't be fetched
    'arial', 'helvetica', 'times new roman', 'times', 'courier new', 'courier',
    'verdana', 'georgia', 'tahoma', 'garamond', 'impact', 'sans'
  ]);

  const cleanFontNameToTest = fontUrlOrName.split(',')[0].trim();
  if (genericFontFamilies.has(cleanFontNameToTest.toLowerCase())) {
    console.log(`✓ Skipping download for generic/system font: "${fontUrlOrName}"`);
    return true; // Assume system fallback will handle it
  }

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
  // Clean font name: Strip CSS fallbacks
  const cleanFontName = fontName.split(',')[0].trim();
  
  // Check if already downloaded at runtime (check both original and clean names)
  if (downloadedFonts.has(fontName) || downloadedFonts.has(cleanFontName)) {
    return true;
  }

  // Check if it's a system font
  const availableFonts = GlobalFonts.families;
  return availableFonts.some(f => 
    f.family.toLowerCase() === cleanFontName.toLowerCase()
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

/**
 * Get cache statistics for monitoring and debugging
 */
export function getCacheStats() {
  return {
    downloadedFonts: downloadedFonts.size,
    failedFonts: failedFonts.size,
    cachedCSSResponses: cssCache.size,
    cachedFontMetadata: fontMetadataCache.size,
    inProgressDownloads: downloadingFonts.size,
    fonts: Array.from(downloadedFonts.keys()),
  };
}

/**
 * Check if a font name is registered with @napi-rs/canvas
 */
export function isRegisteredWithCanvas(fontName: string): boolean {
  const families = GlobalFonts.families;
  return families.some(f => f.family === fontName);
}

/**
 * Get all fonts registered with @napi-rs/canvas
 */
export function getRegisteredFonts(): string[] {
  return GlobalFonts.families.map(f => f.family);
}

/**
 * Clear in-memory caches (does not delete font files)
 * Useful for testing or if you want to force re-fetch
 */
export function clearMemoryCache() {
  cssCache.clear();
  fontMetadataCache.clear();
  console.log('✓ Cleared in-memory CSS and metadata caches');
}

/**
 * Clear failed fonts set to allow retry
 */
export function clearFailedFonts() {
  const count = failedFonts.size;
  failedFonts.clear();
  console.log(`✓ Cleared ${count} failed font(s) - will retry on next request`);
}

