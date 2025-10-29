import { JSDOM } from 'jsdom';
import * as d3 from 'd3';
import { SKRSContext2D, loadImage, createCanvas } from '@napi-rs/canvas';
import { Resvg } from '@resvg/resvg-js';
import { ChartObjectData, renderChartWithD3 } from '@gunwoochoi0/flyingshelf-types';

/**
 * Check if a chart can be rendered server-side
 */
export function canRenderChartServerSide(chart: ChartObjectData['chart']): boolean {
  if (!chart) return false;
  
  const supportedTypes = [
    'bar',
    'pie',
    'donut',
    'line',
    'area',
    'scatter',
    'bubble',
    'heatmap',
    'waterfall',
    'boxplot',
    'funnel',
    'treemap',
    'combo',
  ];

  return supportedTypes.includes(chart.chartType);
}

/**
 * Render a chart to SVG using D3
 */
export async function renderChartToSVG(
  chart: ChartObjectData['chart'],
  width: number,
  height: number
): Promise<string> {
  if (!chart) {
    throw new Error('Chart data is undefined');
  }

  // Create a virtual DOM environment for D3
  const dom = new JSDOM(`<!DOCTYPE html><body><div id="chart-container"></div></body>`, {
    pretendToBeVisual: true,
    resources: 'usable'
  });
  
  const document = dom.window.document;
  const window = dom.window;

  // Create a canvas context for accurate text measurement
  const canvas = createCanvas(1, 1);
  const ctx = canvas.getContext('2d');

  // Polyfill missing SVG methods that jsdom doesn't implement
  // These are critical for D3 chart rendering
  
  if ((window as any).SVGElement) {
    // Add getBBox polyfill to SVGElement prototype
    if (!(window as any).SVGElement.prototype.getBBox) {
      (window as any).SVGElement.prototype.getBBox = function() {
        const tagName = (this.tagName || '').toLowerCase();
        
        if (tagName === 'text' || tagName === 'tspan') {
          // Get text content - for text elements with tspan children, concatenate all tspan content
          let textContent = this.textContent || '';
          
          // Get computed or inline styles
          const style = window.getComputedStyle ? window.getComputedStyle(this) : this.style;
          
          // Parse font size - handle both px and numeric values
          let fontSizeStr = this.getAttribute('font-size') || 
                           style.getPropertyValue?.('font-size') || 
                           style.fontSize || 
                           '12px';
          const fontSizeMatch = String(fontSizeStr).match(/(\d+(?:\.\d+)?)/);
          const fontSizeNum = fontSizeMatch ? parseFloat(fontSizeMatch[1]) : 12;
          
          let fontFamily = this.getAttribute('font-family') || 
                           style.getPropertyValue?.('font-family') || 
                           style.fontFamily || 
                           'sans-serif';
          
          // Normalize to Arial (Liberation Sans on server)
          if (fontFamily.includes('system-ui') || fontFamily.includes('-apple-system') || fontFamily.includes('Helvetica')) {
            fontFamily = 'Arial';
          }
          const fontWeight = this.getAttribute('font-weight') || 
                           style.getPropertyValue?.('font-weight') || 
                           style.fontWeight || 
                           'normal';
          const fontStyleVal = this.getAttribute('font-style') || 
                             style.getPropertyValue?.('font-style') || 
                             style.fontStyle || 
                             'normal';
          
          // Set canvas font with proper format: [style] [weight] size family
          ctx.font = `${fontStyleVal} ${fontWeight} ${fontSizeNum}px ${fontFamily}`;
          
          const metrics = ctx.measureText(textContent);
          
          // Calculate height from font size if actualBoundingBox not available
          const ascent = metrics.actualBoundingBoxAscent ?? (fontSizeNum * 0.8);
          const descent = metrics.actualBoundingBoxDescent ?? (fontSizeNum * 0.2);
          const height = ascent + descent;

          return {
            x: 0,
            y: -ascent,
            width: metrics.width,
            height: height,
          };
        }
        
        // For other SVG elements, try to get dimensions from attributes
        const widthAttr = this.getAttribute('width');
        const heightAttr = this.getAttribute('height');
        
        if (widthAttr && heightAttr) {
          return {
            x: 0,
            y: 0,
            width: parseFloat(widthAttr),
            height: parseFloat(heightAttr),
          };
        }
        
        // Fallback to zero dimensions
        return { x: 0, y: 0, width: 0, height: 0 };
      };
    }
    
    // Add getCTM (Current Transformation Matrix)
    if (!(window as any).SVGElement.prototype.getCTM) {
      (window as any).SVGElement.prototype.getCTM = function() {
        return {
          a: 1, b: 0, c: 0, d: 1, e: 0, f: 0,
          inverse: function() { return this; },
          multiply: function() { return this; },
          translate: function() { return this; },
        };
      };
    }
  }

  if ((window as any).SVGTextContentElement) {
    // Add getComputedTextLength polyfill
    if (!(window as any).SVGTextContentElement.prototype.getComputedTextLength) {
      (window as any).SVGTextContentElement.prototype.getComputedTextLength = function() {
        const style = window.getComputedStyle ? window.getComputedStyle(this) : this.style;
        
        // Parse font size properly
        let fontSizeStr = this.getAttribute('font-size') || 
                         style.getPropertyValue?.('font-size') || 
                         style.fontSize || 
                         '12px';
        const fontSizeMatch = String(fontSizeStr).match(/(\d+(?:\.\d+)?)/);
        const fontSizeNum = fontSizeMatch ? parseFloat(fontSizeMatch[1]) : 12;
        
        let fontFamily = this.getAttribute('font-family') || 
                         style.getPropertyValue?.('font-family') || 
                         style.fontFamily || 
                         'sans-serif';
        
        // Normalize to Arial (Liberation Sans on server)
        if (fontFamily.includes('system-ui') || fontFamily.includes('-apple-system') || fontFamily.includes('Helvetica')) {
          fontFamily = 'Arial';
        }
        const fontWeight = this.getAttribute('font-weight') || 
                         style.getPropertyValue?.('font-weight') || 
                         style.fontWeight || 
                         'normal';
        const fontStyleVal = this.getAttribute('font-style') || 
                           style.getPropertyValue?.('font-style') || 
                           style.fontStyle || 
                           'normal';
        
        ctx.font = `${fontStyleVal} ${fontWeight} ${fontSizeNum}px ${fontFamily}`;
        return ctx.measureText(this.textContent || '').width;
      };
    }
    
    // Add getNumberOfChars
    if (!(window as any).SVGTextContentElement.prototype.getNumberOfChars) {
      (window as any).SVGTextContentElement.prototype.getNumberOfChars = function() {
        return (this.textContent || '').length;
      };
    }
  }
  
  // Add createSVGPoint
  if ((window as any).SVGSVGElement && !(window as any).SVGSVGElement.prototype.createSVGPoint) {
    (window as any).SVGSVGElement.prototype.createSVGPoint = function() {
      return { x: 0, y: 0, matrixTransform: function() { return this; } };
    };
  }

  // Inject jsdom window and document into global scope for D3
  const originalWindow = global.window;
  const originalDocument = global.document;
  
  try {
    (global as any).window = window;
    (global as any).document = document;

    // Create SVG element at the exact target size
    const container = document.getElementById('chart-container');
    if (!container) {
      throw new Error('Failed to create container');
    }

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', width.toString());
    svg.setAttribute('height', height.toString());
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');

    // Add a default background color to the SVG root for consistency
    const backgroundColor = (chart as any).background || 'white';
    svg.style.backgroundColor = backgroundColor;
    
    container.appendChild(svg);

    // Render chart using the exact dimensions, not scaled ones
    renderChartWithD3(d3 as any, chart, svg as unknown as SVGSVGElement, {
      width: width,
      height: height,
      // Provide sensible default margins that match d3-adapter
      margin: { top: 24, right: 24, bottom: 56, left: 56 },
    });

    // CRITICAL FIX: Force all D3 transitions to execute immediately
    // In server-side JSDOM, D3 transitions (even with duration 0) are queued but never execute
    // before SVG serialization. We need to force them to complete synchronously.
    // This makes elements appear immediately as they should in server-side rendering.
    
    // D3 v7+ uses a timer queue that needs to be flushed in non-browser environments
    if (typeof (d3 as any).timerFlush === 'function') {
      (d3 as any).timerFlush();
    }
    
    // Fallback: Manually set opacity for any elements that still have opacity="0"
    // This catches any transitions that didn't flush properly
    const elementsWithZeroOpacity = svg.querySelectorAll('*[opacity="0"]');
    elementsWithZeroOpacity.forEach(el => {
      // Only fix elements that are likely chart elements (not intentionally hidden)
      const className = el.getAttribute('class') || '';
      if (className && !className.includes('hidden')) {
        el.setAttribute('opacity', '1');
      }
    });

    // Post-processing: Force Arial as the primary font for all text
    // Arial maps to Liberation Sans on the server (clean sans-serif font)
    const allText = svg.querySelectorAll('text');
    allText.forEach(textEl => {
      const currentFont = textEl.getAttribute('font-family');
      
      if (!currentFont || currentFont === 'sans-serif') {
        // No font specified - use Arial (Liberation Sans on server)
        textEl.setAttribute('font-family', 'Arial, Liberation Sans, sans-serif');
      } else if (!currentFont.includes('Arial')) {
        // Font specified but doesn't include Arial - add it as primary
        // Remove system fonts and Helvetica (which don't exist on server)
        let cleanFont = currentFont
          .replace(/system-ui,?\s*/g, '')
          .replace(/-apple-system,?\s*/g, '')
          .replace(/Helvetica,?\s*/g, '')
          .trim();
        
        // Remove leading comma if present
        cleanFont = cleanFont.replace(/^,\s*/, '');
        
        // Add Arial as the primary font
        if (cleanFont) {
          textEl.setAttribute('font-family', `Arial, ${cleanFont}`);
        } else {
          textEl.setAttribute('font-family', 'Arial, Liberation Sans, sans-serif');
        }
      }
      
      // Ensure text is visible
      if (!textEl.getAttribute('fill')) {
        textEl.setAttribute('fill', '#000');
      }
    });

    // Ensure axis lines are visible
    const axisPaths = svg.querySelectorAll('.domain, .tick line');
    axisPaths.forEach(el => {
      if (!el.getAttribute('stroke')) {
        el.setAttribute('stroke', '#000');
      }
    });

    const svgString = svg.outerHTML;
    
    // Debug: Log first text element to verify font is being set
    const firstText = svg.querySelector('text');
    if (firstText) {
      console.log('📝 Chart text font-family:', firstText.getAttribute('font-family'));
    }
    
    return svgString;
  } catch (error) {
    console.error('Failed to render chart with D3:', error);
    throw error;
  } finally {
    // Restore original global state
    if (originalWindow) {
      (global as any).window = originalWindow;
    } else {
      delete (global as any).window;
    }
    if (originalDocument) {
      (global as any).document = originalDocument;
    } else {
      delete (global as any).document;
    }
  }
}

/**
 * Render chart object on canvas context
 */
export async function renderChartServerSide(
  ctx: SKRSContext2D,
  obj: ChartObjectData
): Promise<void> {
  const { chart, width, height, opacity } = obj;

  if (!chart || !canRenderChartServerSide(chart)) {
    console.warn('Chart cannot be rendered server-side');
    // Draw placeholder
    ctx.fillStyle = '#f5f5f5';
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = '#666';
    ctx.font = '14px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('Chart', width / 2, height / 2);
    return;
  }

  try {
    // Ensure fonts are available for rendering
    const { GlobalFonts } = await import('@napi-rs/canvas');
    const availableFonts = GlobalFonts.families;
    
    // Debug: Log available fonts
    console.log('🔤 Available fonts:', availableFonts.map(f => f.family).slice(0, 10).join(', '));
    
    const hasLiberation = availableFonts.some(f => 
      f.family.toLowerCase().includes('liberation')
    );
    
    if (!hasLiberation) {
      console.warn('⚠️  Liberation Sans font not available, charts may render with fallback fonts');
    }
    
    // Render SVG at original size to maintain font sizing
    const svgString = await renderChartToSVG(chart, width, height);

    // Render at higher resolution for crisp text, then downsample
    const scaleFactor = 3;
    const renderWidth = width * scaleFactor;
    
    // Use resvg-js to convert SVG to PNG at higher resolution for sharper text
    // Configure font loading to use system fonts and specific directories
    const resvg = new Resvg(svgString, {
      fitTo: {
        mode: 'width',
        value: renderWidth,
      },
      font: {
        loadSystemFonts: true,
        // Add common font directories for better font discovery
        fontDirs: [
          '/usr/share/fonts',
          '/usr/share/fonts/truetype',
          '/usr/share/fonts/liberation',
        ],
        // Default font family when specified font is not found
        defaultFontFamily: 'Liberation Sans',
      },
      shapeRendering: 2, // geometricPrecision
      textRendering: 2, // optimizeLegibility
      imageRendering: 0, // optimizeQuality
    });
    
    const pngData = resvg.render();
    const pngBuffer = pngData.asPng();

    // Load PNG as image and draw on canvas
    const img = await loadImage(pngBuffer);

    ctx.save();
    ctx.globalAlpha = opacity;
    // Use high-quality smoothing when downsampling for crisp text
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img as any, 0, 0, width, height);
    ctx.restore();
  } catch (error) {
    console.error('Failed to render chart:', error);
    // Draw error placeholder
    ctx.fillStyle = '#ffebee';
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = '#c62828';
    ctx.font = '12px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('Chart Render Error', width / 2, height / 2);
  }
}

