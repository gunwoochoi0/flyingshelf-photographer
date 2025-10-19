import { createCanvas, loadImage, GlobalFonts, SKRSContext2D, Image } from '@napi-rs/canvas';
import { Resvg } from '@resvg/resvg-js';
import {
  CanvasVersionSnapshot,
  CanvasObjectData,
  TextObjectData,
  ImageObjectData,
  ShapeObjectData,
  IconObjectData,
  LineObjectData,
  CurveObjectData,
  ChartObjectData,
  TableObjectData,
} from '@gunwoochoi0/flyingshelf-types';
import { renderChartServerSide } from './chart-server-renderer';
import { renderTableServerSide } from './table-server-renderer';

// Track registered fonts to avoid re-registering
const registeredFonts = new Set<string>();

// Store font fallback mappings
const fontFallbackMap = new Map<string, string>();

/**
 * Get fallback font for a given font family
 */
function getFallbackFont(fontFamily: string): string {
  // Map of Google Fonts to system font fallbacks available in Alpine Linux
  const fallbackMap: Record<string, string> = {
    'Roboto': 'Liberation Sans',
    'Montserrat': 'Liberation Sans',
    'Inter': 'Liberation Sans',
    'Open Sans': 'Liberation Sans',
    'Lato': 'Liberation Sans',
    'Poppins': 'Liberation Sans',
    'Raleway': 'Liberation Sans',
    'Playfair Display': 'Liberation Serif',
    'Merriweather': 'Liberation Serif',
    'Roboto Mono': 'Liberation Mono',
    'Source Code Pro': 'Liberation Mono'
  };
  
  return fallbackMap[fontFamily] || 'Liberation Sans';
}

// Register Liberation fonts as exact metric equivalents for system fonts
// Liberation fonts are metrically identical to Microsoft core fonts
let systemFontsRegistered = false;
function ensureSystemFontsRegistered() {
  if (systemFontsRegistered) return;
  
  const fs = require('fs');
  
  try {
    // Liberation Sans = Metrically identical to Arial and Helvetica
    const liberationPaths = {
      regular: '/usr/share/fonts/liberation/LiberationSans-Regular.ttf',
      bold: '/usr/share/fonts/liberation/LiberationSans-Bold.ttf',
      italic: '/usr/share/fonts/liberation/LiberationSans-Italic.ttf',
      boldItalic: '/usr/share/fonts/liberation/LiberationSans-BoldItalic.ttf',
    };
    
    // Register Liberation Sans as Arial, Helvetica, and itself
    if (fs.existsSync(liberationPaths.regular)) {
      GlobalFonts.registerFromPath(liberationPaths.regular, 'Liberation Sans');
      GlobalFonts.registerFromPath(liberationPaths.regular, 'Arial');
      GlobalFonts.registerFromPath(liberationPaths.regular, 'Helvetica');
      GlobalFonts.registerFromPath(liberationPaths.regular, 'Helvetica Neue');
      console.log(`✓ Registered Liberation Sans as Arial/Helvetica (metrically identical)`);
    }
    
    if (fs.existsSync(liberationPaths.bold)) {
      GlobalFonts.registerFromPath(liberationPaths.bold, 'Liberation Sans');
      GlobalFonts.registerFromPath(liberationPaths.bold, 'Arial');
      GlobalFonts.registerFromPath(liberationPaths.bold, 'Helvetica');
    }
    
    if (fs.existsSync(liberationPaths.italic)) {
      GlobalFonts.registerFromPath(liberationPaths.italic, 'Liberation Sans');
      GlobalFonts.registerFromPath(liberationPaths.italic, 'Arial');
      GlobalFonts.registerFromPath(liberationPaths.italic, 'Helvetica');
    }
    
    if (fs.existsSync(liberationPaths.boldItalic)) {
      GlobalFonts.registerFromPath(liberationPaths.boldItalic, 'Liberation Sans');
      GlobalFonts.registerFromPath(liberationPaths.boldItalic, 'Arial');
      GlobalFonts.registerFromPath(liberationPaths.boldItalic, 'Helvetica');
    }
    
    // Liberation Serif = Metrically identical to Times New Roman
    const serifPaths = {
      regular: '/usr/share/fonts/liberation/LiberationSerif-Regular.ttf',
      bold: '/usr/share/fonts/liberation/LiberationSerif-Bold.ttf',
    };
    
    if (fs.existsSync(serifPaths.regular)) {
      GlobalFonts.registerFromPath(serifPaths.regular, 'Liberation Serif');
      GlobalFonts.registerFromPath(serifPaths.regular, 'Times');
      GlobalFonts.registerFromPath(serifPaths.regular, 'Times New Roman');
      console.log(`✓ Registered Liberation Serif as Times New Roman (metrically identical)`);
    }
    
    if (fs.existsSync(serifPaths.bold)) {
      GlobalFonts.registerFromPath(serifPaths.bold, 'Liberation Serif');
      GlobalFonts.registerFromPath(serifPaths.bold, 'Times');
      GlobalFonts.registerFromPath(serifPaths.bold, 'Times New Roman');
    }
    
    // Liberation Mono = Metrically identical to Courier New
    const monoPaths = {
      regular: '/usr/share/fonts/liberation/LiberationMono-Regular.ttf',
      bold: '/usr/share/fonts/liberation/LiberationMono-Bold.ttf',
    };
    
    if (fs.existsSync(monoPaths.regular)) {
      GlobalFonts.registerFromPath(monoPaths.regular, 'Liberation Mono');
      GlobalFonts.registerFromPath(monoPaths.regular, 'Courier');
      GlobalFonts.registerFromPath(monoPaths.regular, 'Courier New');
      console.log(`✓ Registered Liberation Mono as Courier New (metrically identical)`);
    }
    
    if (fs.existsSync(monoPaths.bold)) {
      GlobalFonts.registerFromPath(monoPaths.bold, 'Liberation Mono');
      GlobalFonts.registerFromPath(monoPaths.bold, 'Courier');
      GlobalFonts.registerFromPath(monoPaths.bold, 'Courier New');
    }
  } catch (error) {
    console.warn('Could not register Liberation fonts:', error);
  }
  
  systemFontsRegistered = true;
}

/**
 * Register a font for use in canvas rendering
 */
async function registerFont(fontFamily: string, fontUrl?: string): Promise<boolean> {
  if (registeredFonts.has(fontFamily)) return true;

  try {
    // Ensure system fonts (Arial, Helvetica) are registered with aliases
    ensureSystemFontsRegistered();
    
    // Check if font is already available (system font, pre-built, or already downloaded)
    const availableFonts = GlobalFonts.families;
    if (availableFonts.some(f => f.family === fontFamily)) {
      registeredFonts.add(fontFamily);
      return true;
    }
    
    // Download and register custom font dynamically
    const { downloadAndRegisterFont } = await import('./dynamic-font-loader');
    
    // Not available - try to download it as a Google Font
    console.log(`  Dynamically loading font: ${fontFamily}`);
    const success = await downloadAndRegisterFont(fontFamily, fontUrl || fontFamily);
    if (!success) {
      console.error(`  ❌ Failed to load font: ${fontFamily}`);
      
      // Use fallback font
      const fallback = getFallbackFont(fontFamily);
      console.log(`  Using fallback font: ${fallback} for ${fontFamily}`);
      fontFallbackMap.set(fontFamily, fallback);
      
      return false;
    }
    
    registeredFonts.add(fontFamily);
    console.log(`  ✓ Font ready: ${fontFamily}`);
    return true;
  } catch (error) {
    console.error(`Failed to register font ${fontFamily}:`, error);
    
    // Use fallback font
    const fallback = getFallbackFont(fontFamily);
    console.log(`  Using fallback font: ${fallback} for ${fontFamily}`);
    fontFallbackMap.set(fontFamily, fallback);
    
    return false;
  }
}

/**
 * Determine if a canvas can be rendered server-side
 */
export function canRenderServerSide(components: CanvasObjectData[]): boolean {
  return components.every((c) => {
    // Skip videos and placeholders
    if (c.type === 'video') return false;
    if (c.type.startsWith('placeholder-')) return false;
    
    // Everything else is supported
    return true;
  });
}

/**
 * Wrap text into lines that fit within max width
 */
function wrapText(ctx: SKRSContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const metrics = ctx.measureText(testLine);
    
    if (metrics.width > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }
  
  if (currentLine) {
    lines.push(currentLine);
  }
  
  return lines.length > 0 ? lines : [''];
}

/**
 * Render text object with complex styling and word wrapping
 */
async function renderTextObject(
  ctx: SKRSContext2D,
  obj: TextObjectData
): Promise<void> {
  const { text, width, height, opacity } = obj;

  ctx.save();
  ctx.globalAlpha = opacity;

  let currentY = 0;

  // Render each block (paragraph)
  for (const block of text.blocks) {
    const align = block.align || 'left';
    const lineHeight = parseFloat(block.lineHeight || '1.5');
    
    // Skip empty paragraphs
    if (!block.spans || block.spans.length === 0) {
      // Empty paragraph - add line height spacing
      const fontSize = 16; // Default font size for empty paragraphs
      currentY += fontSize * lineHeight;
      continue;
    }

    // Build segments with their styling info
    interface TextSegment {
      text: string;
      fontSize: number;
      fontFamily: string;
      fontWeight: string;
      fontStyle: string;
      color: string;
      backgroundColor: string | null;
      marks: string[];
      letterSpacing: string | null;
    }

    const segments: TextSegment[] = [];
    
    for (const span of block.spans) {
      const fontSize = parseFloat(span.fontSize || '16px');
      let fontFamily = span.fontFamily || 'Inter';
      
      await registerFont(fontFamily);
      
      // Use fallback font if the original failed to load
      if (fontFallbackMap.has(fontFamily)) {
        fontFamily = fontFallbackMap.get(fontFamily)!;
      }

      // Map font weights properly for canvas
      let fontWeight = '400'; // default normal weight
      let fontStyle = 'normal';
      
      if (span.marks?.includes('bold')) {
        fontWeight = '700'; // Use numeric weight for bold
      }
      if (span.marks?.includes('italic')) {
        fontStyle = 'italic';
      }

      segments.push({
        text: span.text,
        fontSize,
        fontFamily,
        fontWeight,
        fontStyle,
        color: span.color || '#000000',
        backgroundColor: span.backgroundColor || null,
        marks: span.marks || [],
        letterSpacing: span.letterSpacing || null
      });
    }

    // Wrap the paragraph as a whole, preserving span boundaries
    interface WrappedSegment extends TextSegment {
      width: number;
    }
    
    const lines: WrappedSegment[][] = [[]];
    let currentLineWidth = 0;
    const maxLineHeight = Math.max(...segments.map(s => s.fontSize));

    for (const segment of segments) {
      // Use font with Unicode fallback chain for multi-language support
      const fontFallback = `"${segment.fontFamily}", "Noto Sans CJK KR", "Noto Sans", "DejaVu Sans", sans-serif`;
      ctx.font = `${segment.fontStyle} ${segment.fontWeight} ${segment.fontSize}px ${fontFallback}`;
      
      if (segment.letterSpacing) {
        (ctx as any).letterSpacing = segment.letterSpacing;
      }

      // Split segment by words
      const words = segment.text.split(' ');
      
      for (let i = 0; i < words.length; i++) {
        const word = words[i];
        const isLastWord = i === words.length - 1;
        const spaceAfter = isLastWord ? '' : ' ';
        const wordWidth = ctx.measureText(word).width;

        // If word is too long to fit on one line, break it character by character
        if (wordWidth > width) {
          let remainingWord = word;
          
          while (remainingWord.length > 0) {
            let charCount = 0;
            
            // Find how many characters fit on the current line
            while (charCount < remainingWord.length) {
              const testText = remainingWord.substring(0, charCount + 1);
              const testWidth = ctx.measureText(testText).width;
              
              // Check if adding this character would exceed the width
              if (currentLineWidth + testWidth > width) {
                // If we have content on the line, stop here
                if (currentLineWidth > 0) {
                  break;
                }
                // If line is empty but this text alone exceeds width, we still need to stop
                // (we'll force 1 char later if charCount is 0)
                if (charCount > 0) {
                  break;
                }
              }
              charCount++;
            }
            
            // If we couldn't fit any characters and the line is not empty, start a new line
            if (charCount === 0 && currentLineWidth > 0) {
              lines.push([]);
              currentLineWidth = 0;
              continue;
            }
            
            // If we still can't fit any characters (line is empty), force at least one character
            if (charCount === 0) charCount = 1;
            
            // Add the portion that fits
            const portion = remainingWord.substring(0, charCount);
            const portionWidth = ctx.measureText(portion).width;
            
            lines[lines.length - 1].push({
              ...segment,
              text: portion,
              width: portionWidth
            });
            currentLineWidth += portionWidth;
            
            remainingWord = remainingWord.substring(charCount);
            
            // If there's more to render, start a new line
            if (remainingWord.length > 0) {
              lines.push([]);
              currentLineWidth = 0;
            }
          }
          
          // Add space after the word if needed
          if (spaceAfter) {
            const spaceWidth = ctx.measureText(spaceAfter).width;
            if (currentLineWidth + spaceWidth > width) {
              lines.push([]);
              currentLineWidth = 0;
            } else {
              lines[lines.length - 1].push({
                ...segment,
                text: spaceAfter,
                width: spaceWidth
              });
              currentLineWidth += spaceWidth;
            }
          }
        } else {
          // Word fits normally
          const textToMeasure = word + spaceAfter;
          const totalWidth = ctx.measureText(textToMeasure).width;

          if (currentLineWidth + totalWidth > width && currentLineWidth > 0) {
            lines.push([]);
            currentLineWidth = 0;
          }

          lines[lines.length - 1].push({
            ...segment,
            text: textToMeasure,
            width: totalWidth
          });
          currentLineWidth += totalWidth;
        }
      }

      if (segment.letterSpacing) {
        (ctx as any).letterSpacing = '0px';
      }
    }

    // Render each line
    for (const line of lines) {
      const lineWidth = line.reduce((sum, seg) => sum + seg.width, 0);
      let textX = 0;

      // Handle text alignment
      if (align === 'center') {
        textX = (width - lineWidth) / 2;
      } else if (align === 'right') {
        textX = width - lineWidth;
      }

      ctx.textBaseline = 'alphabetic';
      const textY = currentY + maxLineHeight;

      // Render each segment in the line
      for (const segment of line) {
        // Use font with Unicode fallback chain for multi-language support
        const fontFallback = `"${segment.fontFamily}", "Noto Sans CJK KR", "Noto Sans", "DejaVu Sans", sans-serif`;
        ctx.font = `${segment.fontStyle} ${segment.fontWeight} ${segment.fontSize}px ${fontFallback}`;
        ctx.fillStyle = segment.color;

        if (segment.letterSpacing) {
          (ctx as any).letterSpacing = segment.letterSpacing;
        }

        // Draw background color if specified
        if (segment.backgroundColor) {
          ctx.fillStyle = segment.backgroundColor;
          ctx.fillRect(textX, textY - segment.fontSize, segment.width, segment.fontSize * 1.2);
          ctx.fillStyle = segment.color;
        }

        // Draw text
        ctx.fillText(segment.text, textX, textY);

        // Handle underline
        if (segment.marks.includes('underline')) {
          ctx.beginPath();
          ctx.moveTo(textX, textY + 2);
          ctx.lineTo(textX + segment.width, textY + 2);
          ctx.strokeStyle = segment.color;
          ctx.lineWidth = 1;
          ctx.stroke();
        }

        // Handle strikethrough
        if (segment.marks.includes('strikethrough')) {
          ctx.beginPath();
          ctx.moveTo(textX, textY - segment.fontSize / 3);
          ctx.lineTo(textX + segment.width, textY - segment.fontSize / 3);
          ctx.strokeStyle = segment.color;
          ctx.lineWidth = 1;
          ctx.stroke();
        }

        textX += segment.width;

        if (segment.letterSpacing) {
          (ctx as any).letterSpacing = '0px';
        }
      }

      // Move to next line
      currentY += maxLineHeight * lineHeight;
    }
  }

  ctx.restore();
}

/**
 * Helper function to create a rounded rectangle path
 */
function createRoundedRectPath(
  ctx: SKRSContext2D,
  width: number,
  height: number,
  borderRadius: number
): void {
  if (borderRadius >= Math.min(width, height) / 2) {
    // Full circle/ellipse
    const centerX = width / 2;
    const centerY = height / 2;
    const radiusX = width / 2;
    const radiusY = height / 2;
    ctx.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, Math.PI * 2);
  } else {
    // Rounded rectangle
    const r = borderRadius;
    ctx.moveTo(r, 0);
    ctx.lineTo(width - r, 0);
    ctx.quadraticCurveTo(width, 0, width, r);
    ctx.lineTo(width, height - r);
    ctx.quadraticCurveTo(width, height, width - r, height);
    ctx.lineTo(r, height);
    ctx.quadraticCurveTo(0, height, 0, height - r);
    ctx.lineTo(0, r);
    ctx.quadraticCurveTo(0, 0, r, 0);
    ctx.closePath();
  }
}

/**
 * Render image object with optional cropping
 */
async function renderImageObject(
  ctx: SKRSContext2D,
  obj: ImageObjectData
): Promise<void> {
  const { image, width, height, opacity, basicStyles } = obj;

  if (!image.src) return;

  try {
    // Convert relative paths to full URLs
    let imageUrl = image.src;
    if (!imageUrl.startsWith('http://') && !imageUrl.startsWith('https://') && !imageUrl.startsWith('data:')) {
      // This is a relative path from Google Cloud Storage
      imageUrl = `https://storage.googleapis.com/${imageUrl}`;
    }
    
    const img = await loadImage(imageUrl);

    ctx.save();
    ctx.globalAlpha = opacity;

    const borderRadius = image.borderRadius || 0;
    const hasShadow = basicStyles?.shadow && Array.isArray(basicStyles.shadow) && basicStyles.shadow.length > 0;

    // If there's a shadow with border radius, we need to use an offscreen canvas
    // to avoid the shadow being clipped
    if (hasShadow && borderRadius > 0) {
      const shadow = basicStyles.shadow[0];
      
      // Create offscreen canvas for the clipped image
      const offscreenCanvas = createCanvas(width, height);
      const offscreenCtx = offscreenCanvas.getContext('2d');
      
      // Apply border radius clipping on the offscreen canvas
      offscreenCtx.beginPath();
      createRoundedRectPath(offscreenCtx, width, height, borderRadius);
      offscreenCtx.clip();
      
      // Draw image to offscreen canvas with clipping applied
      if (image.crop?.sourceRect) {
        const { sourceRect } = image.crop;
        offscreenCtx.drawImage(
          img as unknown as Image,
          sourceRect.x,
          sourceRect.y,
          sourceRect.width,
          sourceRect.height,
          0,
          0,
          width,
          height
        );
      } else {
        // Use "cover" behavior
        const imgWidth = img.width;
        const imgHeight = img.height;
        const containerRatio = width / height;
        const imageRatio = imgWidth / imgHeight;

        let sx = 0, sy = 0, sWidth = imgWidth, sHeight = imgHeight;

        if (containerRatio > imageRatio) {
          sWidth = imgWidth;
          sHeight = imgWidth / containerRatio;
          sx = 0;
          sy = (imgHeight - sHeight) / 2;
        } else {
          sHeight = imgHeight;
          sWidth = imgHeight * containerRatio;
          sy = 0;
          sx = (imgWidth - sWidth) / 2;
        }

        offscreenCtx.drawImage(
          img as unknown as Image,
          sx,
          sy,
          sWidth,
          sHeight,
          0,
          0,
          width,
          height
        );
      }
      
      // Now draw the offscreen canvas to the main canvas with shadow
      // Canvas shadows are typically lighter than CSS box-shadows
      // Apply a multiplier to blur and enhance intensity to match browser appearance
      const blurMultiplier = 1.5; // Canvas blur needs to be stronger to match CSS
      const spread = shadow.spread || 0;
      
      // Parse the shadow color to potentially increase opacity
      let shadowColor = shadow.color || 'rgba(0, 0, 0, 0.1)';
      
      // If there's a spread value, we need to simulate it by drawing the shadow multiple times
      // or by using a slightly larger shape (canvas doesn't natively support spread)
      if (spread > 0) {
        // Draw shadow multiple times with slight offsets to simulate spread
        for (let i = 0; i <= spread; i++) {
          ctx.shadowColor = shadowColor;
          ctx.shadowBlur = (shadow.blur || 0) * blurMultiplier;
          ctx.shadowOffsetX = (shadow.offsetX || 0);
          ctx.shadowOffsetY = (shadow.offsetY || 0);
          ctx.drawImage(offscreenCanvas as any, 0, 0);
        }
      } else {
        // Standard shadow rendering with enhanced blur
        ctx.shadowColor = shadowColor;
        ctx.shadowBlur = (shadow.blur || 0) * blurMultiplier;
        ctx.shadowOffsetX = shadow.offsetX || 0;
        ctx.shadowOffsetY = shadow.offsetY || 0;
        ctx.drawImage(offscreenCanvas as any, 0, 0);
      }
      
      // Reset shadow for border drawing
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
      
      console.log(`  Applied shadow: blur=${shadow.blur}*${blurMultiplier}=${(shadow.blur || 0) * blurMultiplier}, offset=(${shadow.offsetX}, ${shadow.offsetY}), spread=${spread}, color=${shadowColor}`);
    } else {
      // No shadow or no border radius - use standard approach
      
      // Apply shadow if present (without border radius, standard clipping works)
      if (hasShadow) {
        const shadow = basicStyles.shadow[0];
        const blurMultiplier = 1.5; // Canvas blur needs to be stronger to match CSS
        
        ctx.shadowColor = shadow.color || 'rgba(0, 0, 0, 0.1)';
        ctx.shadowBlur = (shadow.blur || 0) * blurMultiplier;
        ctx.shadowOffsetX = shadow.offsetX || 0;
        ctx.shadowOffsetY = shadow.offsetY || 0;
        console.log(`  Applied shadow: blur=${shadow.blur}*${blurMultiplier}=${(shadow.blur || 0) * blurMultiplier}, offset=(${shadow.offsetX}, ${shadow.offsetY}), color=${shadow.color}`);
      }
      
      // Apply border radius clipping if specified
      if (borderRadius > 0) {
        ctx.beginPath();
        createRoundedRectPath(ctx, width, height, borderRadius);
        ctx.clip();
      }

      if (image.crop?.sourceRect) {
        // Handle cropping
        const { sourceRect } = image.crop;
        ctx.drawImage(
          img as unknown as Image,
          sourceRect.x,
          sourceRect.y,
          sourceRect.width,
          sourceRect.height,
          0,
          0,
          width,
          height
        );
      } else {
        // Use "cover" behavior: scale image to cover the entire container
        // Calculate scale to cover (larger of the two ratios)
        const imgWidth = img.width;
        const imgHeight = img.height;
        const containerRatio = width / height;
        const imageRatio = imgWidth / imgHeight;

        let sx = 0, sy = 0, sWidth = imgWidth, sHeight = imgHeight;

        if (containerRatio > imageRatio) {
          // Container is wider - fit to width, crop height
          sWidth = imgWidth;
          sHeight = imgWidth / containerRatio;
          sx = 0;
          sy = (imgHeight - sHeight) / 2; // Center vertically
        } else {
          // Container is taller - fit to height, crop width
          sHeight = imgHeight;
          sWidth = imgHeight * containerRatio;
          sy = 0;
          sx = (imgWidth - sWidth) / 2; // Center horizontally
        }

        ctx.drawImage(
          img as unknown as Image,
          sx,
          sy,
          sWidth,
          sHeight,
          0,
          0,
          width,
          height
        );
      }
      
      // Reset shadow properties after drawing
      if (hasShadow) {
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
      }
    }

    // Draw border if specified in basicStyles
    if (basicStyles?.border && basicStyles.border.width > 0) {
      const border = basicStyles.border;
      ctx.strokeStyle = border.color || '#000000';
      ctx.lineWidth = border.width;
      
      // Get border radius - could be in border.radius or image.borderRadius
      let borderRadiusValue = borderRadius;
      if (border.radius) {
        // Use the largest radius value if they're different
        const radii = [
          border.radius.topLeft,
          border.radius.topRight,
          border.radius.bottomLeft,
          border.radius.bottomRight
        ];
        borderRadiusValue = Math.max(...radii.filter(r => typeof r === 'number'));
      }
      
      ctx.beginPath();
      if (borderRadiusValue > 0) {
        createRoundedRectPath(ctx, width, height, borderRadiusValue);
      } else {
        ctx.rect(0, 0, width, height);
      }
      ctx.stroke();
    }

    ctx.restore();
  } catch (error) {
    console.error(`Failed to load image ${image.src}:`, error);
    // Draw placeholder
    ctx.fillStyle = '#f0f0f0';
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = '#999';
    ctx.font = '14px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('Image failed to load', width / 2, height / 2);
  }
}

/**
 * Render shape object
 */
async function renderShapeObject(
  ctx: SKRSContext2D,
  obj: ShapeObjectData
): Promise<void> {
  const { shape, width, height, opacity } = obj;

  if (!shape) {
    console.warn('Shape data missing');
    return;
  }

  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.fillStyle = shape.fillColor;
  ctx.strokeStyle = shape.borderColor;
  ctx.lineWidth = shape.borderWidth;

  switch (shape.shapeType) {
    case 'rectangle':
      if (shape.borderRadius) {
        // Rounded rectangle
        const r = shape.borderRadius;
        ctx.beginPath();
        ctx.moveTo(r, 0);
        ctx.lineTo(width - r, 0);
        ctx.quadraticCurveTo(width, 0, width, r);
        ctx.lineTo(width, height - r);
        ctx.quadraticCurveTo(width, height, width - r, height);
        ctx.lineTo(r, height);
        ctx.quadraticCurveTo(0, height, 0, height - r);
        ctx.lineTo(0, r);
        ctx.quadraticCurveTo(0, 0, r, 0);
        ctx.closePath();
        ctx.fill();
        if (shape.borderWidth > 0) ctx.stroke();
      } else {
        ctx.fillRect(0, 0, width, height);
        if (shape.borderWidth > 0) ctx.strokeRect(0, 0, width, height);
      }
      break;

    case 'circle':
      const centerX = width / 2;
      const centerY = height / 2;
      const radius = Math.min(width, height) / 2;
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
      ctx.fill();
      if (shape.borderWidth > 0) ctx.stroke();
      break;

    case 'triangle':
      ctx.beginPath();
      ctx.moveTo(width / 2, 0);
      ctx.lineTo(width, height);
      ctx.lineTo(0, height);
      ctx.closePath();
      ctx.fill();
      if (shape.borderWidth > 0) ctx.stroke();
      break;

    case 'svg':
      if (shape.svgData) {
        try {
          // Handle raw path data by wrapping it in a <path> element
          let processedSvgData = shape.svgData.trim();
          if (!processedSvgData.startsWith('<')) {
            processedSvgData = `<path d="${processedSvgData}" />`;
          }

          // Create SVG
          const svg = `
            <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${shape.svgViewBox || '0 0 24 24'}" preserveAspectRatio="xMidYMid meet">
              <g fill="${shape.fillColor}" stroke="${shape.borderColor}" stroke-width="${shape.borderWidth}">
                ${processedSvgData}
              </g>
            </svg>
          `;

          // Use resvg-js for better SVG rendering
          const resvg = new Resvg(svg, {
            fitTo: { mode: 'width', value: width },
            font: { loadSystemFonts: true },
          });
          const pngBuffer = resvg.render().asPng();
          const img = await loadImage(pngBuffer);
          ctx.drawImage(img as any, 0, 0, width, height);
        } catch (error) {
          console.error('Failed to render SVG shape:', error);
          ctx.fillRect(0, 0, width, height);
        }
      }
      break;
  }

  ctx.restore();
}

/**
 * Render icon object (SVG content)
 */
async function renderIconObject(
  ctx: SKRSContext2D,
  obj: IconObjectData
): Promise<void> {
  const { icon, width, height, opacity } = obj;

  if (!icon || !icon.data) {
    console.warn('Icon data missing');
    return;
  }

  try {
    // Create SVG for the icon
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" 
           width="${width}" 
           height="${height}" 
           viewBox="${icon.viewBox || '0 0 24 24'}" 
           fill="none"
           stroke="${icon.color || '#000000'}"
           stroke-width="${icon.strokeWidth || 2}"
           stroke-linecap="${icon.strokeLinecap || 'round'}"
           stroke-linejoin="${icon.strokeLinejoin || 'round'}">
        ${icon.data}
      </svg>
    `;

    // Use resvg-js for better SVG rendering
    const resvg = new Resvg(svg, {
      fitTo: { mode: 'width', value: width },
      font: { loadSystemFonts: true },
    });
    const pngBuffer = resvg.render().asPng();
    const img = await loadImage(pngBuffer);
    
    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.drawImage(img as any, 0, 0, width, height);
    ctx.restore();
  } catch (error) {
    console.error('Failed to render icon:', error);
    // Fallback placeholder
    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.fillStyle = '#cccccc';
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  }
}

/**
 * Render line object
 */
async function renderLineObject(
  ctx: SKRSContext2D,
  obj: LineObjectData
): Promise<void> {
  const { line, opacity, x, y } = obj;

  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.strokeStyle = line.strokeColor;
  ctx.lineWidth = line.strokeWidth;
  ctx.lineCap = line.strokeLinecap || 'round';

  ctx.beginPath();
  ctx.moveTo(line.x1 - x, line.y1 - y);
  ctx.lineTo(line.x2 - x, line.y2 - y);
  ctx.stroke();

  ctx.restore();
}

/**
 * Render curve object
 */
async function renderCurveObject(
  ctx: SKRSContext2D,
  obj: CurveObjectData
): Promise<void> {
  const { curve, opacity, x, y } = obj;

  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.strokeStyle = curve.strokeColor;
  ctx.lineWidth = curve.strokeWidth;
  ctx.lineCap = curve.strokeLinecap || 'round';

  ctx.beginPath();
  ctx.moveTo(curve.x1 - x, curve.y1 - y);
  ctx.quadraticCurveTo(
    curve.controlX - x,
    curve.controlY - y,
    curve.x2 - x,
    curve.y2 - y
  );
  ctx.stroke();

  ctx.restore();
}

/**
 * Main server-side rendering function
 */
export async function renderCanvasServerSide(
  versionData: CanvasVersionSnapshot,
  dimensions: { width: number; height: number },
  fonts?: Record<string, string> | any[],
  pixelDensity: number = 2, // Default to 2x for better quality
  format: 'png' | 'jpeg' = 'png', // Output format
  quality: number = 90 // JPEG quality (0-100)
): Promise<Buffer> {
  // Render at higher resolution for better quality
  const scaledWidth = dimensions.width * pixelDensity;
  const scaledHeight = dimensions.height * pixelDensity;
  
  const canvas = createCanvas(scaledWidth, scaledHeight);
  const ctx = canvas.getContext('2d');
  
  // Scale the context to match pixel density
  ctx.scale(pixelDensity, pixelDensity);
  
  // Pre-load all fonts used in text components and from the fonts object
  console.log('🔤 Pre-loading fonts...');
  const fontFamilies = new Set<string>();

  // Extract fonts from components
  for (const component of versionData.components) {
    if (component.type === 'text') {
      const textObj = component as TextObjectData;
      for (const block of textObj.text.blocks) {
        for (const span of block.spans || []) {
          if (span.fontFamily) {
            fontFamilies.add(span.fontFamily);
          }
        }
      }
    }
  }

  // Extract fonts from the top-level fonts object
  if (fonts) {
    if (Array.isArray(fonts)) {
      for (const font of fonts) {
        if (font.family) {
          fontFamilies.add(font.family);
        }
      }
    } else if (typeof fonts === 'object') {
      for (const fontFamily in fonts) {
        fontFamilies.add(fontFamily);
      }
    }
  }
  
  // Load all unique fonts in parallel
  if (fontFamilies.size > 0) {
    console.log(`  Loading ${fontFamilies.size} unique fonts: ${Array.from(fontFamilies).join(', ')}`);
    
    // Track which fonts failed to load
    const fontLoadResults = await Promise.all(
      Array.from(fontFamilies).map(async fontFamily => {
        const success = await registerFont(fontFamily);
        return { fontFamily, success };
      })
    );
    
    const failedFonts = fontLoadResults.filter(r => !r.success).map(r => r.fontFamily);
    if (failedFonts.length > 0) {
      console.warn(`  ⚠️  Failed to load fonts: ${failedFonts.join(', ')}`);
      console.log('  Using system font fallbacks for failed fonts');
    } else {
      console.log('  ✓ All fonts loaded');
    }
  }

  // Render background - default to white
  const bgColor = versionData.background?.color || '#FFFFFF';
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, dimensions.width, dimensions.height);

  if (versionData.background?.url) {
    try {
      // Convert relative paths to full URLs
      let bgUrl = versionData.background.url;
      if (!bgUrl.startsWith('http://') && !bgUrl.startsWith('https://') && !bgUrl.startsWith('data:')) {
        bgUrl = `https://storage.googleapis.com/${bgUrl}`;
      }
      
      const bgImage = await loadImage(bgUrl);
      ctx.globalAlpha = versionData.background.opacity || 1;
      ctx.drawImage(bgImage as unknown as Image, 0, 0, dimensions.width, dimensions.height);
      ctx.globalAlpha = 1;
    } catch (error) {
      console.error('Failed to load background image:', error);
    }
  }

  // Sort components by z-index
  const sorted = [...versionData.components].sort((a, b) => a.zIndex - b.zIndex);

  // Render each component
  for (const obj of sorted) {
    ctx.save();

    // Apply transform (position, rotation, flip)
    const centerX = obj.x + obj.width / 2;
    const centerY = obj.y + obj.height / 2;
    ctx.translate(centerX, centerY);
    ctx.rotate((obj.rotation * Math.PI) / 180);
    if (obj.basicStyles?.flipHorizontal) {
      ctx.scale(-1, 1);
    }
    ctx.translate(-centerX, -centerY);
    ctx.translate(obj.x, obj.y);

    // Apply box shadow if specified (except for images - they handle shadows internally)
    if (obj.type !== 'image' && obj.basicStyles?.shadow && Array.isArray(obj.basicStyles.shadow)) {
      // Apply the first shadow (canvas supports one shadow at a time)
      const shadow = obj.basicStyles.shadow[0];
      if (shadow) {
        // Canvas shadows are typically lighter than CSS box-shadows
        // Apply a multiplier to blur to better match browser appearance
        const blurMultiplier = 1.5;
        
        ctx.shadowColor = shadow.color || 'rgba(0, 0, 0, 0.1)';
        ctx.shadowBlur = (shadow.blur || 0) * blurMultiplier;
        ctx.shadowOffsetX = shadow.offsetX || 0;
        ctx.shadowOffsetY = shadow.offsetY || 0;
        
        // Note: Canvas doesn't support shadow spread directly
        // We would need to draw a larger shape for spread effect
        // For now, we'll just use blur, offsetX, and offsetY with enhanced blur
      }
    }

    // Render based on type
    try {
      switch (obj.type) {
        case 'text':
          await renderTextObject(ctx, obj as TextObjectData);
          break;
        case 'image':
          await renderImageObject(ctx, obj as ImageObjectData);
          break;
        case 'shape':
          await renderShapeObject(ctx, obj as ShapeObjectData);
          break;
        case 'icon':
          await renderIconObject(ctx, obj as IconObjectData);
          break;
        case 'line':
          await renderLineObject(ctx, obj as LineObjectData);
          break;
        case 'curve':
          await renderCurveObject(ctx, obj as CurveObjectData);
          break;
        case 'chart':
          await renderChartServerSide(ctx, obj as ChartObjectData);
          break;
        case 'table':
          await renderTableServerSide(ctx, obj as TableObjectData);
          break;
        default:
          console.warn(`Unsupported component type: ${obj.type}`);
      }
    } catch (error) {
      console.error(`Failed to render component ${obj.id}:`, error);
      // Draw error placeholder
      ctx.fillStyle = '#ffebee';
      ctx.fillRect(0, 0, obj.width, obj.height);
      ctx.fillStyle = '#c62828';
      ctx.font = '12px Arial';
      ctx.fillText('Render Error', 5, 20);
    }

    ctx.restore();
  }

  // Return buffer in requested format
  if (format === 'jpeg') {
    return canvas.toBuffer('image/jpeg', quality);
  } else {
    return canvas.toBuffer('image/png');
  }
}

