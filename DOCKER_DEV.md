# 🐳 Docker Development Guide

Quick reference for developing with Docker.

---

## 📋 **Common Commands**

### **Build & Run**
```bash
# Build the image
docker build -t flyingshelf-photographer-service .

# Run in foreground (see logs)
docker run -p 3000:3000 flyingshelf-photographer-service

# Run in background
docker run -d -p 3000:3000 --name canvas-api flyingshelf-photographer-service
```

### **See Logs**
```bash
# Follow logs in real-time
docker logs -f canvas-api

# Last 50 lines + follow
docker logs -f --tail 50 canvas-api

# With timestamps
docker logs -f -t canvas-api

# Stop watching (Ctrl+C)
```

### **Stop & Clean Up**
```bash
# Stop container
docker stop canvas-api

# Remove container
docker rm canvas-api

# Stop and remove in one command
docker rm -f canvas-api

# Remove all stopped containers
docker container prune
```

---

## ⚡ **Development Workflow**

### **Method 1: Hot Reload with Volume Mounts** ⭐

```bash
# Terminal 1: Watch and rebuild TypeScript
npm run dev

# Terminal 2: Run container with volume mount
docker run -p 3000:3000 \
  -v $(pwd)/dist:/app/dist \
  -v $(pwd)/src:/app/src \
  --name canvas-dev \
  flyingshelf-photographer-service

# Now edit files in src/ → tsc rebuilds → container picks up changes!
```

**Restart container after code changes:**
```bash
docker restart canvas-dev
```

### **Method 2: Docker Compose** (easier)

```bash
# Start all services
docker-compose -f docker-compose.dev.yml up

# See logs in real-time (built-in!)
# Press Ctrl+C to stop

# Run in background
docker-compose -f docker-compose.dev.yml up -d

# View logs
docker-compose -f docker-compose.dev.yml logs -f

# Rebuild after changes
docker-compose -f docker-compose.dev.yml restart
```

---

## 🔗 **Connect to Other Local Services**

### **Option A: Use host.docker.internal**

From inside the container, access services on your Mac:

```typescript
// In your code
const response = await fetch('http://host.docker.internal:8080/api');
```

This connects to port 8080 on your Mac.

### **Option B: Docker Network**

Connect multiple containers:

```bash
# Create a network
docker network create app-network

# Run your services on the same network
docker run -d --name postgres --network app-network postgres:15
docker run -d --name canvas-api --network app-network -p 3000:3000 flyingshelf-photographer-service

# Now canvas-api can reach postgres at: http://postgres:5432
```

### **Option C: Docker Compose** (easiest)

All services automatically share a network:

```yaml
# docker-compose.dev.yml
services:
  canvas-api:
    build: .
    ports:
      - "3000:3000"
  
  your-backend:
    image: your-backend:latest
    ports:
      - "8080:8080"
  
  postgres:
    image: postgres:15
    ports:
      - "5432:5432"
```

Now services can reach each other:
- `http://canvas-api:3000`
- `http://your-backend:8080`
- `http://postgres:5432`

---

## 🔍 **Debug Inside Container**

### **Open a shell inside running container**
```bash
docker exec -it canvas-api sh

# Now you're inside the container!
# pwd
# ls -la
# node --version
# exit
```

### **Run commands in container**
```bash
# Check available fonts
docker exec canvas-api fc-list | grep Roboto

# Check environment
docker exec canvas-api env

# Test rendering
docker exec canvas-api npm test
```

### **Inspect container**
```bash
# See container details
docker inspect canvas-api

# See port mappings
docker port canvas-api

# See resource usage
docker stats canvas-api
```

---

## 🚀 **Fast Development Loop**

### **Without Docker** (fastest for quick tests)
```bash
# Terminal 1: Watch mode
npm run dev

# Terminal 2: Run directly
npm start

# Edit files → auto-reloads!
```

### **With Docker** (matches production)
```bash
# After making changes:
docker restart canvas-api

# Or rebuild if you changed package.json or Dockerfile:
docker rm -f canvas-api
docker build -t flyingshelf-photographer-service .
docker run -d -p 3000:3000 --name canvas-api flyingshelf-photographer-service
```

---

## 📦 **Volume Mounts Explained**

```bash
docker run -v $(pwd)/src:/app/src flyingshelf-photographer-service
#           ↑              ↑
#           Host path      Container path
```

**What it does:**
- Maps your local `src/` folder to `/app/src` in the container
- Changes in local files = changes in container
- No rebuild needed!

**Common mounts for development:**
```bash
docker run \
  -v $(pwd)/src:/app/src \           # Source code
  -v $(pwd)/dist:/app/dist \         # Compiled JS
  -v $(pwd)/test:/app/test \         # Tests
  -v /app/node_modules \             # Don't override node_modules
  flyingshelf-photographer-service
```

---

## 🌐 **Port Mapping**

```bash
docker run -p 3001:3000 flyingshelf-photographer-service
#             ↑     ↑
#             Host  Container
```

- **Container listens on**: 3000
- **Access from Mac**: http://localhost:3001
- **Multiple instances**: Use different host ports
  ```bash
  docker run -p 3001:3000 flyingshelf-photographer-service
  docker run -p 3002:3000 flyingshelf-photographer-service
  ```

---

## 🛠️ **Useful Docker Commands**

```bash
# List running containers
docker ps

# List all containers (including stopped)
docker ps -a

# Remove all stopped containers
docker container prune

# Remove all unused images
docker image prune

# See disk usage
docker system df

# Clean everything
docker system prune -a
```

---

## 🎯 **My Recommended Workflow**

For daily development:

**1. Local development (no Docker):**
```bash
# Fast iteration
npm run dev      # Terminal 1
npm start        # Terminal 2
# Edit files → instant reload
```

**2. Test in Docker (before deploying):**
```bash
# Build
docker build -t flyingshelf-photographer-service .

# Run and watch logs
docker run -p 3000:3000 flyingshelf-photographer-service

# Test
curl http://localhost:3000/render/example -o test.png
```

**3. Deploy:**
```bash
gcloud builds submit --config=cloudbuild.yaml
```

---

## 📝 **Quick Reference Card**

| Task | Command |
|------|---------|
| Build image | `docker build -t flyingshelf-photographer-service .` |
| Run (see logs) | `docker run -p 3000:3000 flyingshelf-photographer-service` |
| Run (background) | `docker run -d -p 3000:3000 --name canvas-api flyingshelf-photographer-service` |
| See logs | `docker logs -f canvas-api` |
| Stop | `docker stop canvas-api` |
| Remove | `docker rm canvas-api` |
| Shell inside | `docker exec -it canvas-api sh` |
| Restart | `docker restart canvas-api` |
| Clean up | `docker rm -f canvas-api` |

---

**Pro tip:** Use `docker-compose -f docker-compose.dev.yml up` for the easiest development experience!

