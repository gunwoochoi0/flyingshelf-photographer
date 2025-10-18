import { GlobalFonts } from '@napi-rs/canvas';
import * as fs from 'fs';
import * as path from 'path';

const registeredFonts = new Set<string>();
const unicodeFontsInitialized = new Set<string>();

/**
 * Register system fonts that are available in the container
 */
function registerSystemFont(fontFamily: string): boolean {
  try {
    // Map common font names to available system fonts
    const fontMap: Record<string, string[]> = {
      'Arial': ['DejaVu Sans', 'Liberation Sans'],
      'Helvetica': ['DejaVu Sans', 'Liberation Sans'],
      'Times New Roman': ['DejaVu Serif', 'Liberation Serif'],
      'Courier New': ['DejaVu Sans Mono', 'Liberation Mono'],
      'Georgia': ['DejaVu Serif'],
      'Verdana': ['DejaVu Sans'],
      'Roboto': ['DejaVu Sans'],
      'Open Sans': ['DejaVu Sans'],
    };

    // Get available fonts
    const availableFonts = GlobalFonts.families;
    
    // Check if the requested font is already available
    if (availableFonts.some(f => f.family.toLowerCase() === fontFamily.toLowerCase())) {
      registeredFonts.add(fontFamily);
      console.log(`✓ Font available: ${fontFamily}`);
      return true;
    }

    // Try fallback fonts
    const fallbacks = fontMap[fontFamily] || [];
    for (const fallback of fallbacks) {
      if (availableFonts.some(f => f.family.toLowerCase() === fallback.toLowerCase())) {
        registeredFonts.add(fontFamily);
        console.log(`✓ Using fallback for ${fontFamily}: ${fallback}`);
        return true;
      }
    }

    // Default to DejaVu Sans (installed in Alpine via fontconfig-dev)
    if (availableFonts.some(f => f.family.toLowerCase().includes('dejavu'))) {
      registeredFonts.add(fontFamily);
      console.log(`✓ Using DejaVu Sans for ${fontFamily}`);
      return true;
    }

    return false;
  } catch (error) {
    console.warn(`Failed to register font ${fontFamily}:`, error);
    return false;
  }
}

/**
 * Register Noto CJK fonts from system directories
 */
function registerNotoCJKFonts(): void {
  const notoFontPath = '/usr/share/fonts/noto';
  
  // Define explicit font mappings for CJK fonts
  const cjkFonts = [
    { file: 'NotoSansCJKkr-Regular.otf', family: 'Noto Sans CJK KR' },
    { file: 'NotoSansCJKkr-Bold.otf', family: 'Noto Sans CJK KR' },
    { file: 'NotoSansCJKjp-Regular.otf', family: 'Noto Sans CJK JP' },
    { file: 'NotoSansCJKjp-Bold.otf', family: 'Noto Sans CJK JP' },
    { file: 'NotoSansCJKsc-Regular.otf', family: 'Noto Sans CJK SC' },
    { file: 'NotoSansCJKsc-Bold.otf', family: 'Noto Sans CJK SC' },
  ];

  let registeredCount = 0;
  
  for (const font of cjkFonts) {
    const fullPath = path.join(notoFontPath, font.file);
    try {
      if (fs.existsSync(fullPath)) {
        GlobalFonts.registerFromPath(fullPath, font.family);
        unicodeFontsInitialized.add(font.family);
        registeredCount++;
      }
    } catch (error) {
      console.warn(`Failed to register ${font.file}:`, error);
    }
  }
  
  if (registeredCount > 0) {
    console.log(`✅ Registered ${registeredCount} Noto CJK font files`);
  }
}

/**
 * Initialize Unicode-capable fonts for multi-language support
 */
export function initializeUnicodeFonts(): void {
  console.log('🌏 Initializing multi-language font support...');
  
  // Register Noto CJK fonts for Korean, Japanese, Chinese
  registerNotoCJKFonts();
  
  // Register common system fonts
  registerSystemFont('DejaVu Sans');
  
  const availableFonts = GlobalFonts.families.map(f => f.family);
  
  console.log(`✅ Total font families available: ${availableFonts.length}`);
  
  // Log CJK font support with specific details
  const cjkFonts = availableFonts.filter(f => f.includes('CJK'));
  if (cjkFonts.length > 0) {
    console.log(`   🇰🇷 🇯🇵 🇨🇳 CJK Fonts: ${cjkFonts.join(', ')}`);
  } else {
    console.warn('   ⚠️  No CJK fonts found - Korean/Japanese/Chinese may not render correctly');
  }
  
  // Log other available fonts
  const otherFonts = availableFonts.filter(f => !f.includes('CJK')).slice(0, 5);
  if (otherFonts.length > 0) {
    console.log(`   📝 Other fonts: ${otherFonts.join(', ')}${availableFonts.length > 5 ? '...' : ''}`);
  }
}

/**
 * Register a font for canvas rendering
 */
export function registerFont(fontFamily: string): void {
  if (registeredFonts.has(fontFamily)) return;
  registerSystemFont(fontFamily);
}

/**
 * Get font string with fallback including Unicode support
 */
export function getFontWithFallback(fontFamily: string): string {
  // Multi-language fallback chain:
  // 1. Requested font
  // 2. Noto Sans CJK (Korean, Japanese, Chinese)
  // 3. DejaVu Sans (Latin, Cyrillic, Greek)
  // 4. System sans-serif
  return `"${fontFamily}", "Noto Sans CJK KR", "Noto Sans", "DejaVu Sans", sans-serif`;
}

