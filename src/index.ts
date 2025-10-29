/**
 * Canvas Render Service - Main Entry Point
 * 
 * A high-performance server-side canvas rendering service
 */

// Main rendering functions
export {
  renderCanvasServerSide,
  canRenderServerSide
} from './lib/server-renderer';

// Chart rendering
export {
  renderChartServerSide,
  renderChartToSVG,
  canRenderChartServerSide
} from './lib/chart-server-renderer';

// Table rendering
export {
  renderTableServerSide
} from './lib/table-server-renderer';

// Font management
export {
  registerFont,
  getFontWithFallback,
  initializeUnicodeFonts
} from './lib/font-registry';

// Dynamic font loading
export {
  downloadAndRegisterFont,
  downloadFonts,
  isFontAvailable,
  getAvailableFonts
} from './lib/dynamic-font-loader';
