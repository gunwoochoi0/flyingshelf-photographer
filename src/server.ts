/**
 * Canvas Render Service - Fastify API Server
 */

import Fastify from 'fastify';
import cors from '@fastify/cors';
import { renderCanvasServerSide, canRenderServerSide, CanvasVersionSnapshot, initializeUnicodeFonts } from './index';
import { renderWorkerPool } from './lib/worker-pool';

const fastify = Fastify({ logger: false });
const PORT = Number(process.env.PORT) || 3000;

// Secret for bypassing CORS (set via environment variable)
const API_SECRET = process.env.API_SECRET || 'linedot';
const IS_DEVELOPMENT = process.env.NODE_ENV !== 'production';
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS 
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
  : IS_DEVELOPMENT 
    ? ['*'] // Development: Allow all origins
    : [
        'https://flyingshelf.ai',
        'https://www.flyingshelf.ai',
        'http://localhost:3001', 
        'http://localhost:3000'
      ]; // Production: Restrict to specific origins

// CORS configuration with secret header bypass
fastify.register(cors, {
  origin: (origin: string | undefined, callback: (err: Error | null, allow: boolean) => void) => {
    // In development, allow everything
    if (ALLOWED_ORIGINS[0] === '*') {
      callback(null, true);
      return;
    }
    
    // In production, check allowed origins
    // !origin allows requests without Origin header (curl, Postman, server-to-server)
    if (!origin || ALLOWED_ORIGINS.includes(origin)) {
      if (origin && !IS_DEVELOPMENT) {
        console.log(`✅ CORS allowed: ${origin}`);
      }
      callback(null, true);
      return;
    }
    
    // Reject origin
    console.warn(`❌ CORS blocked origin: "${origin}"`);
    console.warn(`   Allowed origins: ${ALLOWED_ORIGINS.join(', ')}`);
    console.warn(`   Tip: Set ALLOWED_ORIGINS env var or use X-API-Secret header`);
    callback(new Error('Not allowed by CORS'), false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Secret', 'X-Requested-With'],
  exposedHeaders: ['X-Render-Time-Ms', 'X-Canvas-Id', 'X-Image-Format']
});

// Hook to bypass CORS with X-API-Secret header
fastify.addHook('onRequest', async (request, reply) => {
  const secret = request.headers['x-api-secret'];
  
  // If secret header matches, allow CORS from any origin
  if (secret === API_SECRET) {
    console.log(`✓ Authenticated request with X-API-Secret: ${request.method} ${request.url}`);
    reply.header('Access-Control-Allow-Origin', request.headers.origin || '*');
    reply.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    reply.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Secret, X-Requested-With');
    reply.header('Access-Control-Allow-Credentials', 'true');
    reply.header('Access-Control-Expose-Headers', 'X-Render-Time-Ms, X-Canvas-Id, X-Image-Format');
  }
});

// Initialize fonts at startup
console.log('🔤 Initializing fonts...');
initializeUnicodeFonts();

// Health check
fastify.get('/health', async () => {
  return {
    status: 'healthy',
    service: 'flyingshelf-photographer-service',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  };
});

// Debug: List registered fonts
fastify.get('/fonts', async () => {
  const { getRegisteredFonts, getCacheStats } = await import('./lib/dynamic-font-loader');
  
  return {
    registeredWithCanvas: getRegisteredFonts(),
    cacheStats: getCacheStats(),
    totalFonts: getRegisteredFonts().length
  };
});

// Debug: Test font rendering with different weights
fastify.get('/test-font/:fontName', async (request, reply) => {
  const { fontName } = request.params as any;
  const { weight } = request.query as any;
  
  const testWeight = weight || '400';
  const testText = `${fontName} - Weight ${testWeight}`;
  
  // Create a simple canvas to test font rendering
  const { createCanvas } = await import('@napi-rs/canvas');
  const canvas = createCanvas(800, 200);
  const ctx = canvas.getContext('2d');
  
  // White background
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, 800, 200);
  
  // Try to render with the font
  ctx.fillStyle = '#000000';
  ctx.font = `normal ${testWeight} 48px "${fontName}"`;
  ctx.fillText(testText, 20, 100);
  
  // Also show fallback
  ctx.font = `normal ${testWeight} 24px "${fontName}", "Noto Sans"`;
  ctx.fillText(`Fallback test: ${fontName}`, 20, 150);
  
  const pngBuffer = canvas.toBuffer('image/png');
  return reply.header('Content-Type', 'image/png').send(pngBuffer);
});

// Render single canvas
fastify.post('/render', async (request, reply) => {
  const { components, dimensions, background, id, parentId, name, fonts } = request.body as any;
  const { format, quality } = request.query as any; // ?format=png|jpeg|base64 ?quality=0-100

  if (!components || !Array.isArray(components)) {
    return reply.code(400).send({
      error: 'Missing or invalid "components" field',
      message: 'Request must include a "components" array'
    });
  }

  if (!dimensions || !dimensions.width || !dimensions.height) {
    return reply.code(400).send({
      error: 'Missing or invalid "dimensions" field',
      message: 'Request must include dimensions with width and height'
    });
  }

  // Download custom fonts if provided
  if (fonts) {
    const { downloadFonts } = await import('./lib/dynamic-font-loader');
    
    // Handle both array format and object format
    let fontsMap: Record<string, string> = {};
    
    if (Array.isArray(fonts)) {
      // Array format: [{ family: 'Roboto', type: 'google' }, ...]
      for (const font of fonts) {
        if (font.family) {
          // For Google fonts, we just use the family name as both key and value
          // For custom fonts with URLs, the url would be in font.url
          fontsMap[font.family] = font.url || font.family;
        }
      }
    } else if (typeof fonts === 'object') {
      // Object format: { 'Roboto': 'Roboto', ... }
      fontsMap = fonts;
    }
  }

  // Filter out unsupported components (videos and placeholders)
  const supportedComponents = components.filter((c: any) => {
    if (c.type === 'video' || c.type.startsWith('placeholder-')) {
      return false;
    }
    return true;
  });

  // Log if any components were filtered out
  if (supportedComponents.length < components.length) {
    const unsupported = components.filter((c: any) => c.type === 'video' || c.type.startsWith('placeholder-'));
    console.log(`⚠️  Ignoring ${unsupported.length} unsupported component(s): ${unsupported.map((c: any) => c.type).join(', ')}`);
  }

  const versionData: CanvasVersionSnapshot = {
    id: id || `render-${Date.now()}`,
    parentId: parentId || null,
    name: name || 'Rendered Canvas',
    components: supportedComponents,
    timestamp: Date.now(),
    background: background || { url: '', color: '#FFFFFF' }
  };

  // Determine output format and quality
  const outputFormat = format === 'jpeg' ? 'jpeg' : 'png';
  const jpegQuality = quality ? parseInt(quality, 10) : 90;
  const isBase64 = format === 'base64';

  const startTime = Date.now();
  
  // OLD WAY: const imageBuffer = await renderCanvasServerSide(versionData, dimensions, fonts, 2, outputFormat, jpegQuality);

  // NEW WAY: Use the worker pool
  const imageBuffer = await renderWorkerPool.run({
    versionData,
    dimensions,
    fonts,
    outputFormat,
    jpegQuality,
  }) as Buffer;

  const renderTime = Date.now() - startTime;

  console.log(`✅ Rendered in ${renderTime}ms (${supportedComponents.length} components, ${(imageBuffer.length / 1024).toFixed(2)} KB, format: ${outputFormat})`);

  // Return format based on query parameter
  if (isBase64) {
    // Return JSON with base64-encoded image
    const base64Image = imageBuffer.toString('base64');
    const mimeType = outputFormat === 'jpeg' ? 'image/jpeg' : 'image/png';
    return reply
      .header('Content-Type', 'application/json')
      .send({
        success: true,
        image: `data:${mimeType};base64,${base64Image}`,
        metadata: {
          canvasId: versionData.id,
          renderTimeMs: renderTime,
          sizeBytes: imageBuffer.length,
          sizeKB: parseFloat((imageBuffer.length / 1024).toFixed(2)),
          dimensions: {
            width: dimensions.width,
            height: dimensions.height
          },
          format: outputFormat,
          quality: outputFormat === 'jpeg' ? jpegQuality : undefined,
          componentsCount: supportedComponents.length,
          timestamp: new Date().toISOString()
        }
      });
  }

  // Return raw binary (PNG or JPEG)
  const contentType = outputFormat === 'jpeg' ? 'image/jpeg' : 'image/png';
  return reply
    .header('Content-Type', contentType)
    .header('X-Render-Time-Ms', renderTime.toString())
    .header('X-Canvas-Id', versionData.id)
    .header('X-Image-Format', outputFormat)
    .send(imageBuffer);
});

// Example render
fastify.get('/render/example', async (request, reply) => {
  const exampleData = require('../src/examples/data1.json');
  
  const versionData: CanvasVersionSnapshot = {
    id: 'example-canvas',
    parentId: null,
    name: 'Example Canvas',
    components: exampleData.components,
    timestamp: Date.now(),
    background: exampleData.background
  };

  const pngBuffer = await renderCanvasServerSide(versionData, exampleData.dimensions, exampleData.fonts);

  return reply.header('Content-Type', 'image/png').send(pngBuffer);
});

// API docs
fastify.get('/', async () => {
  return {
    service: 'Canvas Render Service',
    version: '1.0.0',
    endpoints: {
      'GET /health': 'Health check',
      'POST /render': 'Render and return raw PNG binary (default)',
      'POST /render?format=jpeg': 'Render and return raw JPEG binary',
      'POST /render?format=jpeg&quality=85': 'Render JPEG with custom quality (0-100)',
      'POST /render?format=base64': 'Render and return JSON with base64-encoded image',
      'GET /render/example': 'Render example canvas'
    },
    features: {
      'Multiple Output Formats': 'rawPngBinary (default, most efficient) or base64 (JSON)',
      'Dynamic Font Loading': 'Pass custom font URLs in the "fonts" parameter',
      'Base64 Images': 'Use data:image/png;base64,... URLs in image.src',
      'Google Cloud Storage': 'Use bucket/path format for GCS images',
      'Custom Fonts': 'Download fonts on-the-fly with fonts parameter',
      'CORS Bypass': 'Use X-API-Secret header to bypass CORS restrictions'
    },
    usage: {
      rawPngBinary: {
        description: 'Get raw PNG binary (default, highest quality)',
        curl: 'curl -X POST "http://localhost:3000/render" -H "Content-Type: application/json" -d @data.json -o output.png',
        note: 'Default format, no query parameter needed'
      },
      rawJpegBinary: {
        description: 'Get raw JPEG binary (smaller file size)',
        curl: 'curl -X POST "http://localhost:3000/render?format=jpeg&quality=90" -H "Content-Type: application/json" -d @data.json -o output.jpg',
        note: 'quality parameter is optional (default: 90, range: 0-100)'
      },
      base64: {
        description: 'Get JSON response with base64-encoded image (PNG by default)',
        curl: 'curl -X POST "http://localhost:3000/render?format=base64" -H "Content-Type: application/json" -d @data.json',
        response: {
          success: true,
          image: 'data:image/png;base64,iVBORw0KGgoAAAANS...',
          metadata: {
            canvasId: 'render-1234567890',
            renderTimeMs: 250,
            sizeBytes: 51200,
            sizeKB: 50,
            format: 'png',
            dimensions: { width: 1920, height: 1080 },
            componentsCount: 5,
            timestamp: '2025-10-18T12:00:00.000Z'
          }
        }
      },
      withFonts: {
        description: 'Render with custom fonts',
        example: {
          components: [],
          dimensions: { width: 1920, height: 1080 },
          fonts: {
            'My Custom Font': 'https://cdn.example.com/fonts/custom.ttf',
            'Pacifico': 'Pacifico'
          }
        }
      },
      withBase64Image: {
        description: 'Use base64 images in components',
        example: {
          type: 'image',
          image: {
            src: 'data:image/png;base64,iVBORw0KGgoAAAANS...'
          }
        }
      }
    }
  };
});

// Start server
fastify.listen({ port: PORT, host: '0.0.0.0' }, (err, address) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  
  const corsInfo = ALLOWED_ORIGINS[0] === '*' 
    ? '🟢 All origins allowed (development mode)' 
    : `${ALLOWED_ORIGINS.length} allowed origin(s)`;
  
  const envMode = IS_DEVELOPMENT ? '🔧 Development' : '🚀 Production';
  
  console.log(`
🎨 Canvas Render Service
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ Server: ${address}
🏥 Health: ${address}/health
🎯 Example: ${address}/render/example
📡 Mode: ${envMode}
🔐 CORS: ${corsInfo}
🔑 Secret: ${API_SECRET === 'linedot' ? '⚠️  Using default secret (change in production!)' : '✓ Custom secret configured'}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💡 Tip: ${IS_DEVELOPMENT ? 'CORS is disabled in development mode' : 'Use X-API-Secret header to bypass CORS'}
  `);
  
  // Log allowed origins in production
  if (!IS_DEVELOPMENT && ALLOWED_ORIGINS[0] !== '*') {
    console.log('📋 Allowed CORS Origins:');
    ALLOWED_ORIGINS.forEach((origin, i) => {
      console.log(`   ${i + 1}. ${origin}`);
    });
    console.log('');
  }
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 Shutting down...');
  fastify.close(() => process.exit(0));
});

process.on('SIGINT', async () => {
  console.log('🛑 Shutting down gracefully...');
  await renderWorkerPool.destroy();
  fastify.close(() => process.exit(0));
});
