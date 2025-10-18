/**
 * Canvas Render Service - Fastify API Server
 */

import Fastify from 'fastify';
import cors from '@fastify/cors';
import { renderCanvasServerSide, canRenderServerSide, CanvasVersionSnapshot, initializeUnicodeFonts } from './index';

const fastify = Fastify({ logger: false });
const PORT = Number(process.env.PORT) || 3000;

// Secret for bypassing CORS (set via environment variable)
const API_SECRET = process.env.API_SECRET || 'your-secret-key-change-this';
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS 
  ? process.env.ALLOWED_ORIGINS.split(',') 
  : ["https://flyingshelf.ai"]; // Default: production only

// CORS configuration with secret header bypass
fastify.register(cors, {
  origin: (origin: string | undefined, callback: (err: Error | null, allow: boolean) => void) => {
    // Get the secret from request headers
    // Note: We need to access this from the current request context
    const req = (callback as any).request || (callback as any).req;
    const secret = req?.headers?.['x-api-secret'];
    
    // If secret header matches, bypass CORS - allow any origin
    if (secret && secret === API_SECRET) {
      console.log(`✓ Authenticated request with X-API-Secret: ${req.method} ${req.url}`);
      callback(null, true);
      return;
    }
    
    // Otherwise, use default CORS policy
    if (ALLOWED_ORIGINS[0] === '*') {
      // Allow all origins
      callback(null, true);
    } else if (!origin || ALLOWED_ORIGINS.includes(origin)) {
      // Allow specific origins
      // Note: !origin allows requests without Origin header (curl, Postman, server-to-server)
      callback(null, true);
    } else {
      // Reject origin
      callback(new Error('Not allowed by CORS'), false);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
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

  if (!canRenderServerSide(components)) {
    const unsupported = components.filter((c: any) => c.type === 'video' || c.type.startsWith('placeholder-'));
    return reply.code(400).send({
      error: 'Unsupported components detected',
      unsupportedTypes: unsupported.map((c: any) => c.type)
    });
  }

  const versionData: CanvasVersionSnapshot = {
    id: id || `render-${Date.now()}`,
    parentId: parentId || null,
    name: name || 'Rendered Canvas',
    components,
    timestamp: Date.now(),
    background: background || { url: '', color: '#FFFFFF' }
  };

  // Determine output format and quality
  const outputFormat = format === 'jpeg' ? 'jpeg' : 'png';
  const jpegQuality = quality ? parseInt(quality, 10) : 90;
  const isBase64 = format === 'base64';

  const startTime = Date.now();
  const imageBuffer = await renderCanvasServerSide(versionData, dimensions, fonts, 2, outputFormat, jpegQuality);
  const renderTime = Date.now() - startTime;

  console.log(`✅ Rendered in ${renderTime}ms (${components.length} components, ${(imageBuffer.length / 1024).toFixed(2)} KB, format: ${outputFormat})`);

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
          componentsCount: components.length,
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
    ? 'All origins allowed' 
    : `Allowed origins: ${ALLOWED_ORIGINS.join(', ')}`;
  
  console.log(`
🎨 Canvas Render Service
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ Server: ${address}
🏥 Health: ${address}/health
🎯 Example: ${address}/render/example
🔐 CORS: ${corsInfo}
🔑 Secret: ${API_SECRET === 'your-secret-key-change-this' ? '⚠️  Using default secret (change in production!)' : '✓ Custom secret configured'}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💡 Tip: Use X-API-Secret header to bypass CORS
  `);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 Shutting down...');
  fastify.close(() => process.exit(0));
});
