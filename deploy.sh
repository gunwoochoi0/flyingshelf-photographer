#!/bin/bash
# Quick deployment script for Canvas Render Service to GCP Cloud Run

set -e  # Exit on error

echo "🚀 Canvas Render Service - GCP Deployment"
echo "=========================================="
echo ""

# Check if gcloud is installed
if ! command -v gcloud &> /dev/null; then
    echo "❌ gcloud CLI not found. Please install it first:"
    echo "   https://cloud.google.com/sdk/docs/install"
    exit 1
fi

# Get current project
PROJECT_ID=$(gcloud config get-value project 2>/dev/null)
if [ -z "$PROJECT_ID" ]; then
    echo "❌ No GCP project set. Run: gcloud config set project YOUR_PROJECT_ID"
    exit 1
fi

echo "📋 Project: $PROJECT_ID"
echo ""

# Ask user what to do
echo "What would you like to do?"
echo "1. First-time setup (create secrets)"
echo "2. Deploy/Update service"
echo "3. View service URL and status"
echo "4. View logs"
echo "5. Retrieve API secret"
echo ""
read -p "Enter choice (1-5): " choice

case $choice in
    1)
        echo ""
        echo "🔐 First-time Setup"
        echo "==================="
        echo ""
        
        # Enable APIs
        echo "📦 Enabling required APIs..."
        gcloud services enable cloudbuild.googleapis.com
        gcloud services enable run.googleapis.com
        gcloud services enable containerregistry.googleapis.com
        gcloud services enable secretmanager.googleapis.com
        echo "✅ APIs enabled"
        echo ""
        
        # NPM Token
        echo "📝 Setting up NPM token..."
        read -p "Enter your GitHub token (for @gunwoochoi0 packages): " NPM_TOKEN
        echo -n "$NPM_TOKEN" | gcloud secrets create npm-token --data-file=- 2>/dev/null || \
            echo -n "$NPM_TOKEN" | gcloud secrets versions add npm-token --data-file=-
        
        PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format="value(projectNumber)")
        gcloud secrets add-iam-policy-binding npm-token \
            --member="serviceAccount:${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com" \
            --role="roles/secretmanager.secretAccessor" 2>/dev/null || true
        echo "✅ NPM token configured"
        echo ""
        
        # API Secret
        echo "🔑 Generating API secret..."
        API_SECRET=$(openssl rand -hex 32)
        echo "Generated API Secret: $API_SECRET"
        echo "⚠️  SAVE THIS SECRET - you'll need it for server-to-server calls"
        echo ""
        read -p "Press Enter to continue..."
        
        echo -n "$API_SECRET" | gcloud secrets create api-secret --data-file=- 2>/dev/null || \
            echo -n "$API_SECRET" | gcloud secrets versions add api-secret --data-file=-
        
        gcloud secrets add-iam-policy-binding api-secret \
            --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
            --role="roles/secretmanager.secretAccessor" 2>/dev/null || true
        echo "✅ API secret configured"
        echo ""
        
        echo "✅ Setup complete! Now run option 2 to deploy."
        ;;
        
    2)
        echo ""
        echo "🚀 Deploying to Cloud Run"
        echo "========================="
        echo ""
        
        # Check if secrets exist
        if ! gcloud secrets describe api-secret &>/dev/null; then
            echo "❌ Secrets not found. Please run option 1 first."
            exit 1
        fi
        
        echo "📦 Building and deploying..."
        gcloud builds submit --config=cloudbuild.yaml
        
        echo ""
        echo "✅ Deployment complete!"
        echo ""
        
        # Get service URL
        SERVICE_URL=$(gcloud run services describe flyingshelf-photographer-service \
            --region=us-central1 \
            --format="value(status.url)" 2>/dev/null || echo "")
        
        if [ ! -z "$SERVICE_URL" ]; then
            echo "🌐 Service URL: $SERVICE_URL"
            echo ""
            echo "Test it:"
            echo "  curl $SERVICE_URL/health"
        fi
        ;;
        
    3)
        echo ""
        echo "📊 Service Status"
        echo "================"
        echo ""
        
        SERVICE_URL=$(gcloud run services describe flyingshelf-photographer-service \
            --region=us-central1 \
            --format="value(status.url)" 2>/dev/null || echo "Not deployed")
        
        echo "Service URL: $SERVICE_URL"
        echo ""
        
        if [ "$SERVICE_URL" != "Not deployed" ]; then
            echo "Testing health endpoint..."
            curl -s "$SERVICE_URL/health" | jq '.' || curl -s "$SERVICE_URL/health"
        fi
        ;;
        
    4)
        echo ""
        echo "📜 Recent Logs"
        echo "============="
        echo ""
        gcloud run services logs read flyingshelf-photographer-service \
            --region=us-central1 \
            --limit=50
        ;;
        
    5)
        echo ""
        echo "🔑 API Secret"
        echo "============"
        echo ""
        API_SECRET=$(gcloud secrets versions access latest --secret=api-secret 2>/dev/null)
        if [ -z "$API_SECRET" ]; then
            echo "❌ API secret not found. Run option 1 first."
        else
            echo "Your API Secret:"
            echo "$API_SECRET"
            echo ""
            echo "Use this in your backend with the X-API-Secret header:"
            echo "  curl -H \"X-API-Secret: $API_SECRET\" https://your-service.run.app/render"
        fi
        ;;
        
    *)
        echo "Invalid choice"
        exit 1
        ;;
esac

echo ""
echo "Done! 🎉"

