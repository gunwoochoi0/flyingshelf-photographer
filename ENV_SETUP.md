# Environment Variables Setup Guide

## Quick Start (Choose One Method)

### 🚀 Method 1: Inline with npm start (Easiest)

```bash
PORT=3000 API_SECRET="my-secret-key" ALLOWED_ORIGINS="*" npm start
```

### 📝 Method 2: Export in Terminal

```bash
export PORT=3000
export API_SECRET="my-secret-key"
export ALLOWED_ORIGINS="*"
npm start
```

### 📄 Method 3: Using .env file (Best for Development)

1. Create a `.env` file (copy from `env.example`):
   ```bash
   cp env.example .env
   ```

2. Edit `.env`:
   ```bash
   PORT=3000
   ALLOWED_ORIGINS=*
   API_SECRET=your-secret-key-here
   ```

3. **Note:** The server doesn't load `.env` automatically. You need to either:
   - Use one of the other methods above, OR
   - Install and use dotenv (see below)

### 🔧 Method 4: Using dotenv package

1. Install dotenv:
   ```bash
   npm install dotenv
   ```

2. Create `.env` file (as in Method 3)

3. Modify `src/server.ts` to load it:
   ```typescript
   // Add at the very top of src/server.ts
   import 'dotenv/config';
   ```

4. Build and run:
   ```bash
   npm run build
   npm start
   ```

---

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORT` | No | `3000` | Port the server listens on |
| `ALLOWED_ORIGINS` | No | `*` | CORS allowed origins (comma-separated) |
| `API_SECRET` | No | `your-secret-key-change-this` | Secret key for X-API-Secret header |

---

## Examples

### Allow All Origins (Development)
```bash
ALLOWED_ORIGINS="*" npm start
```

### Restrict to Specific Domains (Production)
```bash
ALLOWED_ORIGINS="https://yourdomain.com,https://app.yourdomain.com" npm start
```

### With Custom Secret
```bash
API_SECRET="$(openssl rand -hex 32)" npm start
```

### Full Production Example
```bash
PORT=8080 \
ALLOWED_ORIGINS="https://yourdomain.com,https://app.yourdomain.com" \
API_SECRET="5f9c8e3b2a1d4f6e8c7b9a0d3e5f7c2b4a6d8e1f3c5b7a9d2e4f6c8a0b3d5e7f" \
npm start
```

---

## Docker Usage

### docker-compose.yml
```yaml
services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - PORT=3000
      - ALLOWED_ORIGINS=https://yourdomain.com
      - API_SECRET=${API_SECRET}
```

Then run:
```bash
export API_SECRET="$(openssl rand -hex 32)"
docker-compose up
```

### Direct docker run
```bash
docker run -p 3000:3000 \
  -e PORT=3000 \
  -e ALLOWED_ORIGINS="*" \
  -e API_SECRET="my-secret" \
  flyingshelf-photographer-service
```

---

## Generate Secure Secrets

```bash
# Using openssl
openssl rand -hex 32

# Using Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## Testing

Test your setup:
```bash
# Without secret
curl http://localhost:3000/health

# With secret
curl -H "X-API-Secret: your-secret-key" http://localhost:3000/render/example -o test.png
```
