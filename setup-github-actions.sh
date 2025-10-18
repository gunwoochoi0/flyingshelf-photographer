#!/bin/bash

# Configuration
PROJECT_ID="flying-shelf"
PROJECT_NUMBER="243243513452"
SERVICE_ACCOUNT_NAME="github-actions-deployer"
POOL_NAME="github-pool"
PROVIDER_NAME="github-provider"

# IMPORTANT: Replace with your GitHub username/org
GITHUB_USERNAME="gunwoochoi0"  # e.g., gunwoochoi0
GITHUB_REPO="flyingshelf-photographer"

# Check if GitHub username is set
if [ "$GITHUB_USERNAME" = "YOUR_GITHUB_USERNAME" ]; then
    echo "❌ ERROR: Please edit this script and replace YOUR_GITHUB_USERNAME with your actual GitHub username!"
    echo ""
    echo "Edit line 10 of this script:"
    echo "  GITHUB_USERNAME=\"your-actual-github-username\""
    exit 1
fi

echo "🔧 Setting up GitHub Actions for Cloud Run deployment..."
echo "Project: $PROJECT_ID"
echo "GitHub: $GITHUB_USERNAME/$GITHUB_REPO"
echo ""

# 1. Create service account
echo "📝 Creating service account..."
gcloud iam service-accounts create $SERVICE_ACCOUNT_NAME \
  --display-name="GitHub Actions Deployer" \
  --project=$PROJECT_ID 2>/dev/null || echo "Service account already exists"

# 2. Grant permissions
echo "🔐 Granting permissions..."
for role in "roles/run.admin" "roles/iam.serviceAccountUser" "roles/cloudbuild.builds.builder" "roles/storage.admin"; do
  echo "  Adding role: $role"
  gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:${SERVICE_ACCOUNT_NAME}@${PROJECT_ID}.iam.gserviceaccount.com" \
    --role="$role" \
    --quiet 2>/dev/null || true
done

# 3. Enable API
echo "🔌 Enabling IAM Credentials API..."
gcloud services enable iamcredentials.googleapis.com --project=$PROJECT_ID

# 4. Create Workload Identity Pool
echo "🏊 Creating Workload Identity Pool..."
gcloud iam workload-identity-pools create $POOL_NAME \
  --project=$PROJECT_ID \
  --location="global" \
  --display-name="GitHub Actions Pool" 2>/dev/null || echo "Pool already exists"

# 5. Create Workload Identity Provider
echo "🔗 Creating Workload Identity Provider..."
gcloud iam workload-identity-pools providers create-oidc $PROVIDER_NAME \
  --project=$PROJECT_ID \
  --location="global" \
  --workload-identity-pool=$POOL_NAME \
  --display-name="GitHub Provider" \
  --attribute-mapping="google.subject=assertion.sub,attribute.actor=assertion.actor,attribute.repository=assertion.repository,attribute.repository_owner=assertion.repository_owner" \
  --attribute-condition="assertion.repository_owner=='${GITHUB_USERNAME}'" \
  --issuer-uri="https://token.actions.githubusercontent.com" 2>/dev/null || echo "Provider already exists"

# 6. Bind service account
echo "🔒 Binding service account to Workload Identity..."
gcloud iam service-accounts add-iam-policy-binding \
  "${SERVICE_ACCOUNT_NAME}@${PROJECT_ID}.iam.gserviceaccount.com" \
  --project=$PROJECT_ID \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL_NAME}/attribute.repository/${GITHUB_USERNAME}/${GITHUB_REPO}" \
  --quiet 2>/dev/null || true

# 7. Get the values for GitHub secrets
echo ""
echo "✅ Setup complete!"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📋 Add these secrets to your GitHub repository:"
echo "   Settings → Secrets and variables → Actions → New repository secret"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Secret name: GCP_PROJECT_ID"
echo "Value:"
echo "$PROJECT_ID"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Secret name: WIF_PROVIDER"
echo "Value:"
gcloud iam workload-identity-pools providers describe $PROVIDER_NAME \
  --project=$PROJECT_ID \
  --location="global" \
  --workload-identity-pool=$POOL_NAME \
  --format="value(name)"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Secret name: WIF_SERVICE_ACCOUNT"
echo "Value:"
echo "${SERVICE_ACCOUNT_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "🎯 Next steps:"
echo "1. Go to: https://github.com/$GITHUB_USERNAME/$GITHUB_REPO/settings/secrets/actions"
echo "2. Add the three secrets above"
echo "3. Push to main branch to trigger deployment!"
echo ""

