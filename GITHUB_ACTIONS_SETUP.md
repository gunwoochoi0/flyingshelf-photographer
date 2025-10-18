# GitHub Actions Setup Guide

This guide will help you set up automatic deployment to Google Cloud Run when you push to the `main` branch.

---

## 🔐 GitHub Secrets Required

You need to add these secrets to your GitHub repository:

| Secret Name | Value | Is Sensitive? | Description |
|-------------|-------|---------------|-------------|
| `GCP_PROJECT_ID` | `flying-shelf` | ⚠️ Semi-sensitive | Your GCP project ID |
| `WIF_PROVIDER` | See setup below | 🔒 Sensitive | Workload Identity Federation provider |
| `WIF_SERVICE_ACCOUNT` | See setup below | 🔒 Sensitive | Service account email |

---

## 📋 Step-by-Step Setup

### Step 1: Create a Service Account for GitHub Actions

```bash
# Create service account
gcloud iam service-accounts create github-actions-deployer \
  --display-name="GitHub Actions Deployer" \
  --project=flying-shelf

# Grant necessary permissions
gcloud projects add-iam-policy-binding flying-shelf \
  --member="serviceAccount:github-actions-deployer@flying-shelf.iam.gserviceaccount.com" \
  --role="roles/run.admin"

gcloud projects add-iam-policy-binding flying-shelf \
  --member="serviceAccount:github-actions-deployer@flying-shelf.iam.gserviceaccount.com" \
  --role="roles/iam.serviceAccountUser"

gcloud projects add-iam-policy-binding flying-shelf \
  --member="serviceAccount:github-actions-deployer@flying-shelf.iam.gserviceaccount.com" \
  --role="roles/cloudbuild.builds.builder"

gcloud projects add-iam-policy-binding flying-shelf \
  --member="serviceAccount:github-actions-deployer@flying-shelf.iam.gserviceaccount.com" \
  --role="roles/storage.admin"
```

---

### Step 2: Set Up Workload Identity Federation

```bash
# Enable IAM API
gcloud services enable iamcredentials.googleapis.com --project=flying-shelf

# Create Workload Identity Pool
gcloud iam workload-identity-pools create "github-pool" \
  --project="flying-shelf" \
  --location="global" \
  --display-name="GitHub Actions Pool"

# Create Workload Identity Provider
gcloud iam workload-identity-pools providers create-oidc "github-provider" \
  --project="flying-shelf" \
  --location="global" \
  --workload-identity-pool="github-pool" \
  --display-name="GitHub Provider" \
  --attribute-mapping="google.subject=assertion.sub,attribute.actor=assertion.actor,attribute.repository=assertion.repository,attribute.repository_owner=assertion.repository_owner" \
  --attribute-condition="assertion.repository_owner=='YOUR_GITHUB_USERNAME'" \
  --issuer-uri="https://token.actions.githubusercontent.com"
```

**⚠️ IMPORTANT:** Replace `YOUR_GITHUB_USERNAME` with your actual GitHub username/organization!

---

### Step 3: Bind Service Account to Workload Identity

```bash
# Get your GitHub username/org and repo name
GITHUB_USERNAME="YOUR_GITHUB_USERNAME"  # e.g., "gunwoochoi0"
GITHUB_REPO="flyingshelf-photographer"  # Your repo name

# Allow GitHub Actions from your repo to impersonate the service account
gcloud iam service-accounts add-iam-policy-binding \
  "github-actions-deployer@flying-shelf.iam.gserviceaccount.com" \
  --project="flying-shelf" \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/projects/243243513452/locations/global/workloadIdentityPools/github-pool/attribute.repository/${GITHUB_USERNAME}/${GITHUB_REPO}"
```

---

### Step 4: Get the Values for GitHub Secrets

**Get WIF_PROVIDER:**
```bash
gcloud iam workload-identity-pools providers describe "github-provider" \
  --project="flying-shelf" \
  --location="global" \
  --workload-identity-pool="github-pool" \
  --format="value(name)"
```

**Example output:**
```
projects/243243513452/locations/global/workloadIdentityPools/github-pool/providers/github-provider
```

**WIF_SERVICE_ACCOUNT value:**
```
github-actions-deployer@flying-shelf.iam.gserviceaccount.com
```

---

### Step 5: Add Secrets to GitHub

1. Go to your GitHub repository
2. Click **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret**
4. Add these secrets:

| Name | Value |
|------|-------|
| `GCP_PROJECT_ID` | `flying-shelf` |
| `WIF_PROVIDER` | `projects/243243513452/locations/global/workloadIdentityPools/github-pool/providers/github-provider` |
| `WIF_SERVICE_ACCOUNT` | `github-actions-deployer@flying-shelf.iam.gserviceaccount.com` |

---

## 🚀 Quick Setup Script

Run this script to set everything up automatically:

```bash
#!/bin/bash

# Configuration
PROJECT_ID="flying-shelf"
PROJECT_NUMBER="243243513452"
SERVICE_ACCOUNT_NAME="github-actions-deployer"
POOL_NAME="github-pool"
PROVIDER_NAME="github-provider"

# IMPORTANT: Replace with your GitHub username/org
GITHUB_USERNAME="YOUR_GITHUB_USERNAME"  # e.g., gunwoochoi0
GITHUB_REPO="flyingshelf-photographer"

echo "🔧 Setting up GitHub Actions for Cloud Run deployment..."

# 1. Create service account
echo "📝 Creating service account..."
gcloud iam service-accounts create $SERVICE_ACCOUNT_NAME \
  --display-name="GitHub Actions Deployer" \
  --project=$PROJECT_ID

# 2. Grant permissions
echo "🔐 Granting permissions..."
for role in "roles/run.admin" "roles/iam.serviceAccountUser" "roles/cloudbuild.builds.builder" "roles/storage.admin"; do
  gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:${SERVICE_ACCOUNT_NAME}@${PROJECT_ID}.iam.gserviceaccount.com" \
    --role="$role" \
    --quiet
done

# 3. Enable API
echo "🔌 Enabling IAM API..."
gcloud services enable iamcredentials.googleapis.com --project=$PROJECT_ID

# 4. Create Workload Identity Pool
echo "🏊 Creating Workload Identity Pool..."
gcloud iam workload-identity-pools create $POOL_NAME \
  --project=$PROJECT_ID \
  --location="global" \
  --display-name="GitHub Actions Pool"

# 5. Create Workload Identity Provider
echo "🔗 Creating Workload Identity Provider..."
gcloud iam workload-identity-pools providers create-oidc $PROVIDER_NAME \
  --project=$PROJECT_ID \
  --location="global" \
  --workload-identity-pool=$POOL_NAME \
  --display-name="GitHub Provider" \
  --attribute-mapping="google.subject=assertion.sub,attribute.actor=assertion.actor,attribute.repository=assertion.repository,attribute.repository_owner=assertion.repository_owner" \
  --attribute-condition="assertion.repository_owner=='${GITHUB_USERNAME}'" \
  --issuer-uri="https://token.actions.githubusercontent.com"

# 6. Bind service account
echo "🔒 Binding service account to Workload Identity..."
gcloud iam service-accounts add-iam-policy-binding \
  "${SERVICE_ACCOUNT_NAME}@${PROJECT_ID}.iam.gserviceaccount.com" \
  --project=$PROJECT_ID \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL_NAME}/attribute.repository/${GITHUB_USERNAME}/${GITHUB_REPO}"

# 7. Get the values for GitHub secrets
echo ""
echo "✅ Setup complete!"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📋 Add these secrets to your GitHub repository:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "GCP_PROJECT_ID:"
echo "$PROJECT_ID"
echo ""
echo "WIF_PROVIDER:"
gcloud iam workload-identity-pools providers describe $PROVIDER_NAME \
  --project=$PROJECT_ID \
  --location="global" \
  --workload-identity-pool=$POOL_NAME \
  --format="value(name)"
echo ""
echo "WIF_SERVICE_ACCOUNT:"
echo "${SERVICE_ACCOUNT_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
```

**Save this as `setup-github-actions.sh` and run:**
```bash
chmod +x setup-github-actions.sh
./setup-github-actions.sh
```

---

## 🎯 How It Works

1. **Push to main:** When you push code to the `main` branch
2. **GitHub Actions triggers:** The workflow in `.github/workflows/deploy.yml` runs
3. **Authentication:** Uses Workload Identity Federation (no keys needed!)
4. **Cloud Build:** Submits your `cloudbuild.yaml` to GCP
5. **Deployment:** Your service is built and deployed to Cloud Run
6. **Health Check:** Verifies the deployment is healthy
7. **Summary:** Shows the service URL

---

## 🧪 Test the Workflow

### Option 1: Push to main
```bash
git add .
git commit -m "Test GitHub Actions deployment"
git push origin main
```

### Option 2: Manual trigger
1. Go to your GitHub repository
2. Click **Actions** tab
3. Click **Deploy to Cloud Run** workflow
4. Click **Run workflow** → **Run workflow**

---

## 📊 Monitor Deployments

**GitHub Actions:**
- Go to your repo → **Actions** tab
- Click on the running workflow to see logs

**Cloud Build:**
```bash
# List recent builds
gcloud builds list --project=flying-shelf --limit=5

# Watch logs for a specific build
gcloud builds log BUILD_ID --project=flying-shelf --stream
```

---

## 🔄 Update Allowed Origins

If you add more domains (e.g., `app.flyingshelf.ai`), update `cloudbuild.yaml`:

```yaml
- '--set-env-vars=ALLOWED_ORIGINS=https://flyingshelf.ai,https://app.flyingshelf.ai'
```

---

## 🚨 Troubleshooting

### "Permission denied" errors
Make sure the service account has all required roles:
```bash
./setup-github-actions.sh
```

### "Workload Identity Provider not found"
Check that you replaced `YOUR_GITHUB_USERNAME` with your actual username.

### Build fails
Check Cloud Build logs:
```bash
gcloud builds list --project=flying-shelf --limit=1
gcloud builds log LATEST_BUILD_ID --project=flying-shelf
```

---

## 🔒 Security Best Practices

✅ **What we're doing right:**
- Using Workload Identity Federation (no service account keys!)
- Secrets stored in GitHub Secrets (encrypted)
- Service account has minimal required permissions
- CORS restrictions in place

❌ **What NOT to do:**
- Never commit service account keys to git
- Never hardcode secrets in code
- Don't give service accounts more permissions than needed

---

## 📝 Summary of Sensitive Values

| Value | Sensitive? | Where to Store |
|-------|------------|----------------|
| `GCP_PROJECT_ID` | ⚠️ Semi | GitHub Secrets (best practice) |
| `WIF_PROVIDER` | 🔒 Yes | GitHub Secrets |
| `WIF_SERVICE_ACCOUNT` | 🔒 Yes | GitHub Secrets |
| `API_SECRET` | 🔒 Yes | GCP Secret Manager (already done) |
| `npm-token` | 🔒 Yes | GCP Secret Manager (already done) |

---

## ✅ Checklist

- [ ] Run `setup-github-actions.sh` script
- [ ] Replace `YOUR_GITHUB_USERNAME` with your GitHub username
- [ ] Add `GCP_PROJECT_ID` to GitHub Secrets
- [ ] Add `WIF_PROVIDER` to GitHub Secrets
- [ ] Add `WIF_SERVICE_ACCOUNT` to GitHub Secrets
- [ ] Push to main branch to test
- [ ] Verify deployment in GitHub Actions tab
- [ ] Test the deployed service URL

---

That's it! Your deployments are now fully automated! 🎉
