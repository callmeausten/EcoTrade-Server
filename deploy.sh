#!/bin/bash

# Hostinger Deployment Script
# This script helps you deploy to Hostinger quickly

echo "🚀 Harmony IoT Backend - Hostinger Deployment"
echo "=============================================="
echo ""

# Check if git is initialized
if [ ! -d .git ]; then
    echo "⚠️  Git not initialized. Initializing..."
    git init
    echo "✅ Git initialized"
fi

# Check if remote exists
if ! git remote | grep -q origin; then
    echo "⚠️  No git remote found"
    read -p "Enter your repository URL: " repo_url
    git remote add origin "$repo_url"
    echo "✅ Remote added"
fi

# Commit changes
echo ""
echo "📝 Committing changes..."
git add .
read -p "Enter commit message (default: 'Update for deployment'): " commit_msg
commit_msg=${commit_msg:-"Update for deployment"}
git commit -m "$commit_msg"

# Push to repository
echo ""
echo "📤 Pushing to repository..."
git push origin main

echo ""
echo "✅ Code pushed successfully!"
echo ""
echo "📋 Next steps on Hostinger server:"
echo "1. SSH into your Hostinger server"
echo "2. Run: git pull origin main"
echo "3. Run: npm install --production"
echo "4. Run: pm2 restart harmony-backend"
echo ""
echo "Or if first deployment:"
echo "1. git clone <your-repo> harmony-backend"
echo "2. cd harmony-backend"
echo "3. npm install --production"
echo "4. pm2 start ecosystem.config.js --env production"
echo ""
echo "🎉 Deployment preparation complete!"
