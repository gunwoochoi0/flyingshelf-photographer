# GCP Cloud Run Deployment Guide

Complete guide to deploy the Canvas Render Service to Google Cloud Platform.

---

## 📋 Prerequisites

1. **Google Cloud SDK installed**
   ```bash
   # Install gcloud CLI (if not already installed)
   # https://cloud.google.com/sdk/docs/install
   
   # Login to GCP
   gcloud auth login
   
   # Set your project (use PROJECT_ID not project number)
   gcloud config set project flying-shelf
   ```

2. **Enable required APIs**
   ```bash
   gcloud services enable cloudbuild.googleapis.com
   gcloud services enable run.googleapis.com
   gcloud services enable containerregistry.googleapis.com
   gcloud services enable secretmanager.googleapis.com
   ```

---

## 🔐 Step 1: Store Secrets in Secret Manager

### 1.1 Create NPM Token Secret (for private packages)

```bash
# Store your GitHub token for @gunwoochoi0/flyingshelf-types
echo -n "YOUR_GITHUB_TOKEN" | gcloud secrets create npm-token --data-file=-

# Grant Cloud Build access to npm-token
PROJECT_NUMBER=$(gcloud projects describe $(gcloud config get-value project) --format="value(projectNumber)")

gcloud secrets add-iam-policy-binding npm-token \
  --member="serviceAccount:${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

### 1.2 Create API Secret (for CORS bypass)

```bash
# Generate a secure random secret
API_SECRET=$(openssl rand -hex 32)
echo "Generated API Secret: $API_SECRET"
echo "⚠️  SAVE THIS SECRET - you'll need it for server-to-server calls"

# Store in Secret Manager
echo -n "$API_SECRET" | gcloud secrets create api-secret --data-file=-

# Grant Cloud Run access to api-secret
PROJECT_NUMBER=$(gcloud projects describe $(gcloud config get-value project) --format="value(projectNumber)")

gcloud secrets add-iam-policy-binding api-secret \
  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

### 1.3 Verify Secrets

```bash
# List all secrets
gcloud secrets list

# View secret value (for verification)
gcloud secrets versions access latest --secret=api-secret
```

---

## 🚀 Step 2: Deploy to Cloud Run

### Option A: Using Cloud Build (Recommended)

```bash
# Deploy using cloudbuild.yaml
gcloud builds submit --config=cloudbuild.yaml

# This will:
# 1. Create .npmrc from npm-token secret
# 2. Build Docker image with fonts
# 3. Push to Container Registry
# 4. Deploy to Cloud Run with environment variables
```

### Option B: Manual Deployment

```bash
# Build locally
docker build -t gcr.io/YOUR_PROJECT_ID/flyingshelf-photographer-service .

# Push to GCR
docker push gcr.io/YOUR_PROJECT_ID/flyingshelf-photographer-service

# Deploy to Cloud Run
gcloud run deploy flyingshelf-photographer-service \
  --image=gcr.io/YOUR_PROJECT_ID/flyingshelf-photographer-service \
  --platform=managed \
  --region=us-central1 \
  --memory=2Gi \
  --cpu=2 \
  --timeout=900s \
  --concurrency=50 \
  --max-instances=10 \
  --min-instances=0 \
  --allow-unauthenticated \
  --set-env-vars="PORT=3000,ALLOWED_ORIGINS=https://flyingshelf.ai" \
  --set-secrets="API_SECRET=api-secret:latest"
```

---

## 🔧 Step 3: Update Environment Variables

### Update ALLOWED_ORIGINS

```bash
gcloud run services update flyingshelf-photographer-service \
  --region=us-central1 \
  --update-env-vars="ALLOWED_ORIGINS=https://flyingshelf.ai,https://app.flyingshelf.ai"
```

### Update Port (if needed)

```bash
gcloud run services update flyingshelf-photographer-service \
  --region=us-central1 \
  --update-env-vars="PORT=8080"
```

### Rotate API Secret

```bash
# Create new secret version
NEW_SECRET=$(openssl rand -hex 32)
echo -n "$NEW_SECRET" | gcloud secrets versions add api-secret --data-file=-

# Cloud Run will automatically use the latest version
# Or force update:
gcloud run services update flyingshelf-photographer-service \
  --region=us-central1 \
  --update-secrets="API_SECRET=api-secret:latest"
```

---

## 📊 Step 4: Verify Deployment

```bash
# Get service URL
SERVICE_URL=$(gcloud run services describe flyingshelf-photographer-service \
  --region=us-central1 \
  --format="value(status.url)")

echo "Service deployed at: $SERVICE_URL"

# Test health endpoint
curl $SERVICE_URL/health

# Test render endpoint (should work - no CORS for curl)
curl $SERVICE_URL/render/example -o test.png

# Test with API secret
API_SECRET=$(gcloud secrets versions access latest --secret=api-secret)
curl -H "X-API-Secret: $API_SECRET" $SERVICE_URL/render/example -o test-auth.png
```

---

## 🔍 Step 5: Monitoring & Logs

### View Logs

```bash
# Stream logs in real-time
gcloud run services logs tail flyingshelf-photographer-service --region=us-central1

# View recent logs
gcloud run services logs read flyingshelf-photographer-service --region=us-central1 --limit=50

# Filter logs
gcloud run services logs read flyingshelf-photographer-service \
  --region=us-central1 \
  --filter="textPayload:ERROR"
```

### View Metrics

```bash
# Open in Cloud Console
gcloud run services describe flyingshelf-photographer-service \
  --region=us-central1 \
  --format="value(status.url)"

# Or visit: https://console.cloud.google.com/run
```

---

## 🔐 Step 6: Retrieve API Secret (for your backend)

```bash
# Get API secret for use in your backend services
API_SECRET=$(gcloud secrets versions access latest --secret=api-secret)
echo "Your API Secret: $API_SECRET"

# Use this in your backend environment variables
export API_SECRET="$API_SECRET"
```

---

## 🌐 Step 7: Configure Your Frontend

Update your frontend to call the deployed service:

```typescript
// In your flyingshelf.ai frontend
const RENDER_API_URL = "https://flyingshelf-photographer-service-xxxxx-uc.a.run.app";

const response = await fetch(`${RENDER_API_URL}/render?format=base64`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
    // No X-API-Secret needed - flyingshelf.ai is in ALLOWED_ORIGINS
  },
  body: JSON.stringify(canvasData)
});
```

---

## 🔧 Common Commands

### Update Service

```bash
# Update with new environment variables
gcloud run services update flyingshelf-photographer-service \
  --region=us-central1 \
  --update-env-vars="ALLOWED_ORIGINS=https://flyingshelf.ai,https://beta.flyingshelf.ai"

# Update memory/CPU
gcloud run services update flyingshelf-photographer-service \
  --region=us-central1 \
  --memory=4Gi \
  --cpu=4

# Update max instances
gcloud run services update flyingshelf-photographer-service \
  --region=us-central1 \
  --max-instances=20
```

### Delete Service

```bash
gcloud run services delete flyingshelf-photographer-service --region=us-central1
```

### Redeploy

```bash
# Trigger new deployment with latest code
gcloud builds submit --config=cloudbuild.yaml
```

---

## 📝 Environment Variables Summary

| Variable | Set Via | Value | Purpose |
|----------|---------|-------|---------|
| `PORT` | `--set-env-vars` | `3000` | Server port |
| `ALLOWED_ORIGINS` | `--set-env-vars` | `https://flyingshelf.ai` | CORS allowed origins |
| `API_SECRET` | `--set-secrets` | Secret Manager | CORS bypass secret |

---

## 🚨 Troubleshooting

### Secret Access Denied

```bash
# Grant Cloud Run service account access to secrets
PROJECT_NUMBER=$(gcloud projects describe $(gcloud config get-value project) --format="value(projectNumber)")

gcloud secrets add-iam-policy-binding api-secret \
  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

### Build Fails

```bash
# Check build logs
gcloud builds list --limit=5

# View specific build
gcloud builds log BUILD_ID
```

### Service Not Responding

```bash
# Check service status
gcloud run services describe flyingshelf-photographer-service --region=us-central1

# Check recent logs
gcloud run services logs read flyingshelf-photographer-service --region=us-central1 --limit=100
```

---

## 💰 Cost Optimization

```bash
# Set min instances to 0 (default)
gcloud run services update flyingshelf-photographer-service \
  --region=us-central1 \
  --min-instances=0

# Reduce max instances for cost control
gcloud run services update flyingshelf-photographer-service \
  --region=us-central1 \
  --max-instances=5

# Cloud Run pricing:
# - Pay only for what you use
# - Free tier: 2 million requests/month
# - CPU/Memory charged per 100ms
```

---

## 🎉 Quick Deployment Checklist

- [ ] Install gcloud CLI
- [ ] Enable required APIs
- [ ] Create `npm-token` secret
- [ ] Create `api-secret` secret
- [ ] Grant permissions to secrets
- [ ] Run `gcloud builds submit --config=cloudbuild.yaml`
- [ ] Get service URL
- [ ] Test endpoints
- [ ] Save API secret for backend use
- [ ] Update frontend with service URL

---

## 📚 Additional Resources

- [Cloud Run Documentation](https://cloud.google.com/run/docs)
- [Secret Manager](https://cloud.google.com/secret-manager/docs)
- [Cloud Build](https://cloud.google.com/build/docs)
- [gcloud CLI Reference](https://cloud.google.com/sdk/gcloud/reference)

