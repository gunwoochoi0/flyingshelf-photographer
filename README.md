# Canvas Render Service

Fast HTTP API that converts JSON canvas data to PNG images. Built with Fastify, @napi-rs/canvas, and D3.

## 🎯 Key Features

✅ **Multi-Language Support** - Korean, Japanese, Chinese, Arabic, Thai, Hebrew, Hindi & more  
✅ **Dynamic Font Loading** - Google Fonts by name OR custom fonts by URL  
✅ **Base64 Images** - No external URLs needed  
✅ **Fast** - 200-400ms per render  
✅ **Scalable** - 50+ concurrent requests  

---

## ⚡️ Development Quick Start

**Start the development server:**

```bash
docker-compose -f docker-compose.dev.yml up --build
```

🎉 **That's it!** Your server will:
- ✅ Start on `http://localhost:3001`
- ✅ Show real-time logs
- ✅ Auto-reload on any code changes
- ✅ Compile TypeScript automatically

Just edit files in `src/` and watch the magic happen!

**Stop the server:**

```bash
# Press Ctrl+C in the terminal where it's running
# Then clean up containers:
docker-compose -f docker-compose.dev.yml down
```

**Quick commands:**

```bash
# Start (first time or after rebuild)
docker-compose -f docker-compose.dev.yml up --build

# Start (subsequent times)
docker-compose -f docker-compose.dev.yml up

# Stop and remove containers
docker-compose -f docker-compose.dev.yml down

# View logs (if running in background)
docker-compose -f docker-compose.dev.yml logs -f
```

---

## 🚀 Quick Start

### Local Docker
```bash
# Build
docker build -t flyingshelf-photographer-service .

# Run
docker run -d -p 3000:3000 flyingshelf-photographer-service

# Test
curl http://localhost:3000/render/example -o example.png
```

### Use the API
```bash
# Get raw PNG binary (default - highest quality)
curl -X POST http://localhost:3000/render \
  -H "Content-Type: application/json" \
  -d @src/examples/data1.json \
  -o output.png

# Get raw JPEG binary (smaller file size, 30-70% smaller)
curl -X POST "http://localhost:3000/render?format=jpeg&quality=90" \
  -H "Content-Type: application/json" \
  -d @src/examples/data1.json \
  -o output.jpg

# Get base64 JSON response
curl -X POST "http://localhost:3000/render?format=base64" \
  -H "Content-Type: application/json" \
  -d @src/examples/data1.json
```

---

## ☁️ Deploy to GCP Cloud Run

### 1. Store NPM Token in Secret Manager
```bash
echo -n "YOUR_GITHUB_TOKEN" | \
  gcloud secrets create npm-token --data-file=-

PROJECT_NUMBER=$(gcloud projects describe $(gcloud config get-value project) --format="value(projectNumber)")

gcloud secrets add-iam-policy-binding npm-token \
    --member="serviceAccount:${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com" \
    --role="roles/secretmanager.secretAccessor"
```

### 2. Deploy
```bash
gcloud builds submit --config=cloudbuild.yaml
```

Done! Your API will be live at `https://flyingshelf-photographer-service-[HASH].run.app`

---

## 📋 API Reference

### Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check |
| `/render` | POST | Render canvas → raw PNG binary (default) |
| `/render?format=jpeg` | POST | Render canvas → raw JPEG binary |
| `/render?format=jpeg&quality=85` | POST | Render JPEG with custom quality (0-100) |
| `/render?format=base64` | POST | Render canvas → JSON with base64 image |
| `/render/example` | GET | Render demo canvas |
| `/` | GET | API info |

---

### `/render` Parameters

**Query Parameters:**
- `format` (optional): Output format
  - `png` or not specified - PNG binary (default, lossless)
  - `jpeg` - JPEG binary (lossy, smaller files)
  - `base64` - Base64-encoded image in JSON
- `quality` (optional): JPEG quality 0-100 (default: 90, only for `format=jpeg`)

**Headers:**
- `Content-Type`: `application/json` (required)
- `X-API-Secret`: Secret key to bypass CORS (optional, for server-to-server)

**Request Body (JSON):**
```typescript
{
  components: Array<Component>,     // Required: Canvas components
  dimensions: {                     // Required: Canvas size
    width: number,
    height: number
  },
  background?: {                    // Optional: Background
    color?: string,                 // e.g., "#FFFFFF"
    url?: string                    // Background image URL
  },
  fonts?: {                         // Optional: Custom fonts
    [fontName: string]: string      // Font name → Google Font name or URL
  },
  id?: string,                      // Optional: Canvas ID
  name?: string,                    // Optional: Canvas name
  parentId?: string | null          // Optional: Parent canvas ID
}
```

---

### Response Formats

#### 1️⃣ Raw PNG Binary (default)
```bash
POST /render
# Same as: POST /render?format=png
```

**Response:**
- `Content-Type: image/png`
- Binary PNG data
- Headers: `X-Render-Time-Ms`, `X-Canvas-Id`, `X-Image-Format`

**Best for:** Highest quality, lossless, transparency support

#### 2️⃣ Raw JPEG Binary
```bash
POST /render?format=jpeg
POST /render?format=jpeg&quality=85
```

**Response:**
- `Content-Type: image/jpeg`
- Binary JPEG data  
- Headers: `X-Render-Time-Ms`, `X-Canvas-Id`, `X-Image-Format`

**Best for:** Smaller file sizes (30-70% smaller than PNG), photos/graphics without transparency

**Quality Settings:**
- `100` - Maximum quality (~same size as PNG)
- `90` - High quality, great compression (default, recommended)
- `85` - Very good quality, better compression
- `75` - Good quality, significant compression
- `60` - Moderate quality, maximum compression

#### 3️⃣ Base64 JSON
```bash
POST /render?format=base64
```

**Response:**
```json
{
  "success": true,
  "image": "data:image/png;base64,iVBORw0KGgo...",
  "metadata": {
    "canvasId": "render-1234567890",
    "renderTimeMs": 250,
    "sizeBytes": 51200,
    "sizeKB": 50.0,
    "format": "png",
    "dimensions": { "width": 1920, "height": 1080 },
    "componentsCount": 5,
    "timestamp": "2025-10-18T12:00:00.000Z"
  }
}
```

**Best for:** JSON APIs, HTML emails, embedding in HTML/JSON

---

### Usage Examples

#### JavaScript (Browser)

**Option 1: PNG Binary → Blob**
```javascript
const response = await fetch('http://localhost:3000/render', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    components: [...],
    dimensions: { width: 1920, height: 1080 }
  })
});

const blob = await response.blob();
const imageUrl = URL.createObjectURL(blob);

// Use in <img> tag
document.querySelector('img').src = imageUrl;

// Or download
const a = document.createElement('a');
a.href = imageUrl;
a.download = 'canvas.png';
a.click();
```

**Option 2: JPEG Binary → Blob (Smaller Files)**
```javascript
const response = await fetch('http://localhost:3000/render?format=jpeg&quality=85', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    components: [...],
    dimensions: { width: 1920, height: 1080 }
  })
});

const blob = await response.blob();
const imageUrl = URL.createObjectURL(blob);

// 30-70% smaller than PNG!
document.querySelector('img').src = imageUrl;
```

**Option 3: Base64 → Direct Use**
```javascript
const response = await fetch('http://localhost:3000/render?format=base64', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    components: [...],
    dimensions: { width: 1920, height: 1080 }
  })
});

const { image, metadata } = await response.json();

// Use directly in <img> tag
document.querySelector('img').src = image;

console.log(`Rendered in ${metadata.renderTimeMs}ms`);
```

---

#### Node.js (Buffer)

**Option 1: PNG Binary → Save File**
```javascript
const fs = require('fs');

const response = await fetch('http://localhost:3000/render', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    components: [...],
    dimensions: { width: 1920, height: 1080 }
  })
});

const buffer = Buffer.from(await response.arrayBuffer());
fs.writeFileSync('output.png', buffer);

console.log(`Saved ${buffer.length} bytes`);
```

**Option 2: JPEG Binary → Save File (Smaller)**
```javascript
const fs = require('fs');

const response = await fetch('http://localhost:3000/render?format=jpeg&quality=90', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    components: [...],
    dimensions: { width: 1920, height: 1080 }
  })
});

const buffer = Buffer.from(await response.arrayBuffer());
fs.writeFileSync('output.jpg', buffer);

console.log(`Saved ${buffer.length} bytes (30-70% smaller than PNG!)`);
```

**Option 3: Base64 → Decode & Save**
```javascript
const fs = require('fs');

const response = await fetch('http://localhost:3000/render?format=base64', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    components: [...],
    dimensions: { width: 1920, height: 1080 }
  })
});

const { image, metadata } = await response.json();

// Remove data URL prefix and decode
const base64Data = image.replace(/^data:image\/png;base64,/, '');
const buffer = Buffer.from(base64Data, 'base64');
fs.writeFileSync('output.png', buffer);

console.log(`Rendered in ${metadata.renderTimeMs}ms`);
```

**Option 4: Use Base64 Directly (e.g., in HTML email)**
```javascript
const { image } = await response.json();

const html = `
  <html>
    <body>
      <img src="${image}" alt="Rendered Canvas" />
    </body>
  </html>
`;
```

**Option 5: Compare PNG vs JPEG Sizes**
```javascript
const fs = require('fs');

// Render as PNG
const pngResponse = await fetch('http://localhost:3000/render', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(canvasData)
});
const pngBuffer = Buffer.from(await pngResponse.arrayBuffer());

// Render as JPEG
const jpegResponse = await fetch('http://localhost:3000/render?format=jpeg&quality=90', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(canvasData)
});
const jpegBuffer = Buffer.from(await jpegResponse.arrayBuffer());

console.log(`PNG:  ${(pngBuffer.length / 1024).toFixed(2)} KB`);
console.log(`JPEG: ${(jpegBuffer.length / 1024).toFixed(2)} KB`);
console.log(`Savings: ${((1 - jpegBuffer.length / pngBuffer.length) * 100).toFixed(1)}%`);

fs.writeFileSync('output.png', pngBuffer);
fs.writeFileSync('output.jpg', jpegBuffer);
```

---

### When to Use Each Format

| Format | Use Case | File Size | Quality | Transparency | Speed |
|--------|----------|-----------|---------|--------------|-------|
| **PNG** (default) | Graphics with transparency, logos, text-heavy images | 100% | Lossless | ✅ Yes | Fast |
| **JPEG** | Photos, gradients, backgrounds, social media | 30-70% of PNG | Lossy (adjustable) | ❌ No | Fastest |
| **Base64** | JSON APIs, HTML emails, inline embedding | 133% of binary | Same as format | Depends on format | Slowest |

**Recommendations:**

| Scenario | Best Format | Example |
|----------|-------------|---------|
| Logos, icons, UI elements | PNG | `POST /render` |
| Social media images | JPEG quality 85-90 | `POST /render?format=jpeg&quality=85` |
| Photo-heavy designs | JPEG quality 90 | `POST /render?format=jpeg` |
| Designs with transparency | PNG | `POST /render` |
| Email campaigns | Base64 PNG/JPEG | `POST /render?format=base64` |
| JSON API responses | Base64 | `POST /render?format=base64` |

---

### 🔐 CORS & Authentication

#### CORS Policy

The API automatically configures CORS based on the environment:

**🔧 Development Mode (default):**
- ✅ All origins allowed automatically
- ✅ No CORS restrictions
- ✅ Perfect for local development (`NODE_ENV !== 'production'`)

**🚀 Production Mode:**
- 🔒 Only `https://flyingshelf.ai` allowed by default
- 🔐 Use `ALLOWED_ORIGINS` env var to customize

```bash
# Development (automatic)
npm run dev  # CORS disabled automatically

# Production - Allow specific origins
export NODE_ENV=production
export ALLOWED_ORIGINS="https://yourdomain.com,https://app.yourdomain.com"

# Production - Allow all origins (not recommended)
export NODE_ENV=production
export ALLOWED_ORIGINS="*"
```

#### Secret Header Bypass

For **server-to-server** communication, you can bypass CORS entirely using the `X-API-Secret` header:

```bash
# Set your secret (recommended: use a strong random string)
export API_SECRET="your-super-secret-key-here"

# Use it in requests
curl -X POST http://localhost:3000/render \
  -H "Content-Type: application/json" \
  -H "X-API-Secret: your-super-secret-key-here" \
  -d @data.json \
  -o output.png
```

**JavaScript/Node.js Example:**
```javascript
const response = await fetch('http://localhost:3000/render', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-API-Secret': process.env.API_SECRET  // Bypasses CORS
  },
  body: JSON.stringify(canvasData)
});
```

**When to use X-API-Secret:**
- ✅ Server-to-server API calls
- ✅ Backend services calling the render API
- ✅ Microservices architecture
- ❌ Don't expose the secret in client-side JavaScript (browsers)
- ❌ Don't commit secrets to version control

**Security Notes:**
1. Change the default secret in production: `export API_SECRET="$(openssl rand -hex 32)"`
2. Store the secret securely (environment variables, secret managers)
3. Never expose the secret in client-side code
4. Rotate secrets periodically

---

### 🌏 Multi-Language Support

The service automatically supports text in **multiple languages and scripts** out of the box:

**Supported Languages:**
- 🇰🇷 **Korean** (한국어)
- 🇯🇵 **Japanese** (日本語)
- 🇨🇳 **Chinese** Simplified & Traditional (中文)
- 🇸🇦 **Arabic** (العربية)
- 🇹🇭 **Thai** (ไทย)
- 🇮🇱 **Hebrew** (עברית)
- 🇮🇳 **Hindi & Devanagari** (हिन्दी)
- 🇬🇷 **Greek** (Ελληνικά)
- 🇷🇺 **Cyrillic** (Русский)
- And many more Unicode scripts

**How It Works:**
1. Noto fonts (Google's universal font family) are pre-installed in the Docker container
2. Font fallback chain automatically uses the correct font for each character
3. No configuration needed - just send text in any language!

**Example - Korean Text:**
```json
{
  "components": [{
    "type": "text",
    "text": {
      "blocks": [{
        "spans": [{
          "text": "안녕하세요! 환영합니다.",
          "fontFamily": "Arial",
          "fontSize": "48px"
        }]
      }]
    }
  }]
}
```

**Font Fallback Chain:**
```
Requested Font → Noto Sans CJK KR → Noto Sans → DejaVu Sans → sans-serif
```

This ensures that:
- Latin characters use your requested font (e.g., Arial, Roboto)
- Korean, Japanese, Chinese use Noto Sans CJK
- Other Unicode characters use appropriate Noto fonts
- Everything renders correctly, even in mixed-language text!

---

### Example Request
```json
{
  "components": [
    {
      "id": "text-1",
      "type": "text",
      "x": 100,
      "y": 100,
      "width": 400,
      "height": 100,
      "rotation": 0,
      "opacity": 1,
      "zIndex": 1,
      "locked": false,
      "text": {
        "blocks": [{
          "type": "paragraph",
          "align": "left",
          "spans": [{
            "text": "Hello World!",
            "color": "#000000",
            "marks": ["bold"],
            "fontSize": "48px",
            "fontFamily": "Arial"
          }]
        }]
      }
    }
  ],
  "dimensions": { "width": 1920, "height": 1080 },
  "background": { "color": "#FFFFFF" }
}
```

### Example with Dynamic Fonts

Add the `fonts` parameter to your request. The system **auto-detects** if it's a Google Font or custom URL:

```json
{
  "components": [
    {
      "type": "text",
      "text": {
        "blocks": [{
          "spans": [{
            "text": "Using Google Font",
            "fontFamily": "Pacifico",
            "fontSize": "48px"
          }]
        }]
      }
    }
  ],
  "dimensions": { "width": 1920, "height": 1080 },
  "fonts": {
    "Pacifico": "Pacifico"
  }
}
```

**Rules:**
- **Value WITHOUT `https://`** → Downloads from Google Fonts
- **Value WITH `https://`** → Downloads from your URL

**More Examples:**

```json
// Google Font (just the name)
"fonts": {
  "Pacifico": "Pacifico",
  "Lobster": "Lobster"
}

// Custom Font (full URL)
"fonts": {
  "My Brand Font": "https://cdn.example.com/brand.ttf"
}

// Mix both
"fonts": {
  "Pacifico": "Pacifico",
  "My Brand Font": "https://cdn.example.com/brand.ttf"
}
```

### Example with Base64 Images
```json
{
  "components": [
    {
      "id": "img-1",
      "type": "image",
      "x": 100,
      "y": 100,
      "width": 400,
      "height": 300,
      "opacity": 1,
      "zIndex": 1,
      "locked": false,
      "image": {
        "src": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUA...",
        "alt": "Base64 Image"
      }
    }
  ],
  "dimensions": { "width": 1920, "height": 1080 }
}
```

---

## ✅ Supported Components

- ✅ Text (rich text with formatting)
- ✅ Images (HTTP/HTTPS/GCS)
- ✅ Shapes (rectangle, circle, triangle, SVG)
- ✅ Icons (SVG)
- ✅ Lines & Curves
- ✅ Charts (12 D3 chart types)
- ✅ Tables
- ❌ Videos (not supported)

---

## ⚡ Performance

- **200-400ms** per canvas
- **50+ concurrent requests**
- **2GB memory** recommended

---

## 🔐 Local Setup

The `.npmrc` file contains your GitHub token for `@gunwoochoi0/flyingshelf-types`. It's already configured and gitignored.

### Environment Variables

There are multiple ways to set environment variables:

#### Option 1: `.env` file (Recommended for Development)

1. Copy the example file:
   ```bash
   cp .env.example .env
   ```

2. Edit `.env` with your values:
   ```bash
   # .env
   PORT=3000
   ALLOWED_ORIGINS=*
   API_SECRET=your-super-secret-key-here
   ```

3. Load it when running (if using dotenv):
   ```bash
   npm install dotenv
   # Then add require('dotenv').config() to your code
   ```

#### Option 2: Export in Terminal (Session-specific)

```bash
# Set environment variables for current terminal session
export PORT=3000
export ALLOWED_ORIGINS="https://yourdomain.com,https://app.yourdomain.com"
export API_SECRET="$(openssl rand -hex 32)"

# Run the server
npm start
```

#### Option 3: Inline with Command

```bash
# Set environment variables for a single command
PORT=3001 API_SECRET="my-secret" ALLOWED_ORIGINS="*" npm start
```

#### Option 4: Docker / Docker Compose

**docker-compose.yml:**
```yaml
services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - PORT=3000
      - ALLOWED_ORIGINS=https://yourdomain.com,https://app.yourdomain.com
      - API_SECRET=${API_SECRET}  # Load from host environment
```

**Or using .env file with Docker Compose:**
```yaml
services:
  app:
    build: .
    env_file:
      - .env  # Automatically loads .env file
```

#### Option 5: Cloud Deployment (GCP Cloud Run)

```bash
gcloud run deploy flyingshelf-photographer-service \
  --image gcr.io/your-project/flyingshelf-photographer-service \
  --set-env-vars "API_SECRET=$(openssl rand -hex 32),ALLOWED_ORIGINS=https://yourdomain.com"
```

### Environment Variable Reference

| Variable | Default | Description | Example |
|----------|---------|-------------|---------|
| `NODE_ENV` | (unset) | Environment mode | `production` (dev mode when unset) |
| `PORT` | `3000` | Server port | `3000`, `8080` |
| `ALLOWED_ORIGINS` | `*` (dev) or `https://flyingshelf.ai` (prod) | Allowed CORS origins (comma-separated) | `https://yourdomain.com,http://localhost:3001` |
| `API_SECRET` | `your-secret-key-change-this` | Secret for bypassing CORS | Generate with: `openssl rand -hex 32` |

### Generate Secure Secrets

```bash
# Generate a random 32-byte hex string
openssl rand -hex 32

# Or use Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Example output: 
# 5f9c8e3b2a1d4f6e8c7b9a0d3e5f7c2b4a6d8e1f3c5b7a9d2e4f6c8a0b3d5e7f
```

---

## 🔤 Font Management

### **TL;DR - Font Data Structure**

The `fonts` parameter is a **key-value object**:

```json
"fonts": {
  "Pacifico": "Pacifico",                                    // ← Google Font (value = name)
  "My Font": "https://cdn.example.com/fonts/custom.ttf"     // ← Custom Font (value = URL)
}
```

**Detection logic:**  
- Value is a **name** (no `https://`) → Downloads from Google Fonts
- Value is a **URL** (has `https://`) → Downloads from your URL

**Complete curl example:**
```bash
curl -X POST http://localhost:3000/render \
  -H "Content-Type: application/json" \
  -d '{
    "components": [{
      "type":"text",
      "x":100,"y":100,"width":800,"height":100,
      "opacity":1,"zIndex":1,"locked":false,
      "text":{
        "blocks":[{
          "spans":[{
            "text":"Custom Font Test",
            "fontFamily":"Pacifico",
            "fontSize":"48px"
          }]
        }]
      }
    }],
    "dimensions":{"width":1000,"height":300},
    "fonts":{"Pacifico":"Pacifico"}
  }' -o output.png
```

---

### **Production Fonts**

Fonts are **pre-installed in the Docker image** at build time (no runtime downloads):

1. **System fonts** (always available):
   - DejaVu Sans, Serif, Mono
   - Noto Sans, Serif, Symbols

2. **Google Fonts** (pre-installed at build time):
   - Top 100 most popular fonts from `fonts-build.txt`
   - Build time: ~2-3 minutes
   - Image size: +50 MB
   - ⭐ **Covers 95% of use cases**

3. **Dynamic fonts** (downloaded on-demand at runtime):
   - Any Google Font by name
   - Any custom font by URL
   - Cached after first use
   - Perfect for rare/custom fonts

### **Real-World Examples**

**Scenario 1: Use pre-installed fonts only**
```json
{
  "components": [{
    "type": "text",
    "text": {
      "spans": [{ "fontFamily": "Roboto" }]
    }
  }],
  "dimensions": { "width": 1920, "height": 1080 }
}
```
No `fonts` parameter needed!

**Scenario 2: Load a Google Font on-demand**
```json
{
  "components": [{
    "type": "text",
    "text": {
      "spans": [{ "fontFamily": "Pacifico" }]
    }
  }],
  "dimensions": { "width": 1920, "height": 1080 },
  "fonts": {
    "Pacifico": "Pacifico"
  }
}
```

**Scenario 3: Load your custom brand font**
```json
{
  "components": [{
    "type": "text",
    "text": {
      "spans": [{ "fontFamily": "Acme Brand Font" }]
    }
  }],
  "dimensions": { "width": 1920, "height": 1080 },
  "fonts": {
    "Acme Brand Font": "https://cdn.acme.com/fonts/brand.ttf"
  }
}
```

### **Add More Pre-installed Fonts**

Edit `fonts-build.txt` and add Google Fonts:
```
Your Font Name:400,700
Another Font:400,700
```

Then rebuild:
```bash
docker build -t flyingshelf-photographer-service .
```

### **How It Works**

1. During Docker build, `scripts/download-fonts.sh` runs
2. Downloads fonts from Google Fonts based on chosen font list
3. Stores them in `/usr/share/fonts/truetype/google-fonts/`
4. Font cache is updated with `fc-cache`
5. Fonts are available immediately at runtime ✨

### **Why NOT Download ALL Google Fonts?**

❌ **Don't do this:**
- 1400+ font families = thousands of files
- Build time: **2-4 hours**
- Docker image: **10-20 GB** (vs 500 MB)
- Most fonts you'll never use

✅ **Current approach (best practice):**
- Pre-install top 100 fonts (`fonts-build.txt`)
- Use dynamic loading for rare fonts
- Add custom fonts to `fonts-build.txt` as needed

### **Font Fallbacks**

If a requested font isn't available, it automatically falls back:
```
Arial/Helvetica → DejaVu Sans
Times New Roman → DejaVu Serif
Courier → DejaVu Sans Mono
```

---

## 📦 Files

- `src/server.ts` - Fastify API server
- `src/lib/server-renderer.ts` - Main rendering engine
- `src/lib/chart-server-renderer.ts` - D3 chart renderer
- `src/lib/table-server-renderer.ts` - Table renderer
- `Dockerfile` - Production container
- `cloudbuild.yaml` - GCP deployment config
- `.npmrc` - NPM token (gitignored)

---

**That's it! Simple and ready to deploy.** 🎉

For detailed Docker development instructions, see [DOCKER_DEV.md](DOCKER_DEV.md).
