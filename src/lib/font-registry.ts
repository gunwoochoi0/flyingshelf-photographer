import { GlobalFonts } from '@napi-rs/canvas';

const registeredFonts = new Set<string>();

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
 * Initialize Unicode-capable fonts
 */
export function initializeUnicodeFonts(): void {
  // Register common system fonts
  registerSystemFont('DejaVu Sans');
  console.log('Available fonts:', GlobalFonts.families.map(f => f.family).join(', '));
}

/**
 * Register a font for canvas rendering
 */
export function registerFont(fontFamily: string): void {
  if (registeredFonts.has(fontFamily)) return;
  registerSystemFont(fontFamily);
}

/**
 * Get font string with fallback
 */
export function getFontWithFallback(fontFamily: string): string {
  // Use DejaVu Sans as fallback (available in Alpine)
  return `"${fontFamily}", "DejaVu Sans", sans-serif`;
}

