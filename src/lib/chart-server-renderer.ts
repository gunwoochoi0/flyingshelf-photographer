import { JSDOM } from 'jsdom';
import * as d3 from 'd3';
import { SKRSContext2D, loadImage } from '@napi-rs/canvas';
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

  // Polyfill missing SVG methods that jsdom doesn't implement
  // These are critical for D3 chart rendering
  
  if ((window as any).SVGElement) {
    // Add getBBox polyfill to SVGElement prototype
    if (!(window as any).SVGElement.prototype.getBBox) {
      (window as any).SVGElement.prototype.getBBox = function() {
        // Estimate bounding box based on text content and font size
        const textContent = this.textContent || '';
        const fontSize = parseFloat(this.getAttribute('font-size') || '12');
        const width = this.getAttribute('width');
        const height = this.getAttribute('height');
        
        if (width && height) {
          return {
            x: 0,
            y: 0,
            width: parseFloat(width),
            height: parseFloat(height),
          };
        }
        
        return {
          x: 0,
          y: -fontSize * 0.8,
          width: Math.max(textContent.length * fontSize * 0.6, 10),
          height: fontSize * 1.2,
        };
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
        const textContent = this.textContent || '';
        const fontSize = parseFloat(this.getAttribute('font-size') || '12');
        return Math.max(textContent.length * fontSize * 0.6, 10);
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

    // Create SVG element
    const container = document.getElementById('chart-container');
    if (!container) {
      throw new Error('Failed to create container');
    }

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', width.toString());
    svg.setAttribute('height', height.toString());
    svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    container.appendChild(svg);

    // Render chart using your existing D3 adapter
    // Note: renderChartWithD3 signature is (d3, chart, svg, opts)
    renderChartWithD3(d3 as any, chart, svg as unknown as SVGSVGElement, {
      width,
      height,
      margin: {
        top: 20,
        right: 20,
        bottom: 40,
        left: 40,
      },
    });

    // Post-process: Ensure all text elements are visible with default styles
    const allText = svg.querySelectorAll('text');
    allText.forEach(textEl => {
      const fill = textEl.getAttribute('fill');
      const style = textEl.getAttribute('style') || '';
      
      // Set default black fill if missing
      if (!fill || fill === 'none' || fill === 'currentColor') {
        textEl.setAttribute('fill', '#000000');
      }
      
      // Ensure text is visible by removing any display:none
      if (style.includes('display: none') || style.includes('display:none')) {
        textEl.setAttribute('style', style.replace(/display\s*:\s*none;?/g, ''));
      }
      
      // Set font size if missing
      if (!textEl.getAttribute('font-size')) {
        textEl.setAttribute('font-size', '12');
      }
      
      // Set font family for consistency
      if (!textEl.getAttribute('font-family')) {
        textEl.setAttribute('font-family', 'Arial, sans-serif');
      }
    });

    // Set default black stroke for axis lines that don't have color
    const allLines = svg.querySelectorAll('line, path.domain');
    allLines.forEach(lineEl => {
      const stroke = lineEl.getAttribute('stroke');
      if (!stroke || stroke === 'none' || stroke === 'currentColor') {
        lineEl.setAttribute('stroke', '#000000');
      }
    });
    
    // Ensure axis elements are visible
    const axisPaths = svg.querySelectorAll('.domain, .tick line');
    axisPaths.forEach(el => {
      if (!el.getAttribute('stroke')) {
        el.setAttribute('stroke', '#000000');
      }
    });

    // Get the SVG as string
    const svgString = svg.outerHTML;
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
    // Render chart to SVG
    const svgString = await renderChartToSVG(chart, width, height);

    // Use resvg-js to convert SVG to PNG (better text rendering than @napi-rs/canvas)
    const resvg = new Resvg(svgString, {
      fitTo: {
        mode: 'width',
        value: width,
      },
      font: {
        loadSystemFonts: true, // Load system fonts for better text rendering
      },
    });
    
    const pngData = resvg.render();
    const pngBuffer = pngData.asPng();

    // Load PNG as image and draw on canvas
    const img = await loadImage(pngBuffer);

    ctx.save();
    ctx.globalAlpha = opacity;
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

