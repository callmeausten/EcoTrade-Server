# 🚀 Quick Deployment Checklist for Hostinger

## ✅ What I've Prepared for You

### 1. **Updated Code for Production**
- ✅ Environment variables system in place
- ✅ Firebase supports both JSON file and env vars
- ✅ QR encryption key uses env vars
- ✅ Server IP is configurable
- ✅ All hardcoded values removed

### 2. **New Files Created**
- 📄 [`DEPLOYMENT.md`](./DEPLOYMENT.md) - Complete deployment guide
- 📄 [`.env.production.example`](./.env.production.example) - Production env template
- 📄 [`ecosystem.config.js`](./ecosystem.config.js) - PM2 configuration
- 📄 [`deploy.sh`](./deploy.sh) - Deployment helper script

### 3. **Updated Files**
- 📄 [`.gitignore`](./.gitignore) - Added logs and PM2 files
- 📄 [`src/server.js`](./src/server.js) - Uses SERVER_IP env var
- 📄 [`src/config/firebase.js`](./src/config/firebase.js) - Supports env vars
- 📄 [`src/utils/crypto.js`](./src/utils/crypto.js) - Requires env var

---

## 🎯 Changes You Need to Make Before Deploying

### 1. **Update Your Local `.env` File**

Add these lines to your current `.env`:

```env
# QR Code Encryption (MUST match ESP32 firmware)
QR_ENCRYPTION_KEY=UnanzaHarmony24!

# Server Network Configuration
SERVER_IP=192.168.100.12
```

### 2. **Remove Duplicate in `.env`**

You have `GOOGLE_CLIENT_ID` listed twice. Remove one of them.

### 3. **Generate Strong JWT Secrets for Production**

Run this command to generate secure random strings:

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

Use the output for `JWT_SECRET` and `JWT_REFRESH_SECRET` in production.

---

## 📋 Deployment Steps to Hostinger

### Option 1: Quick Start (Recommended)

1. **Prepare your repository**:
   ```bash
   git init
   git add .
   git commit -m "Prepare for deployment"
   git remote add origin <your-github-repo-url>
   git push -u origin main
   ```

2. **Access Hostinger via SSH**:
   ```bash
   ssh your-username@your-hostinger-ip
   ```

3. **Clone and setup on Hostinger**:
   ```bash
   # Clone repository
   git clone <your-repo-url> harmony-backend
   cd harmony-backend
   
   # Install dependencies
   npm install --production
   
   # Create .env file (copy from .env.production.example)
   nano .env
   # Paste your production environment variables and save
   
   # Install PM2
   npm install -g pm2
   
   # Start application
   pm2 start ecosystem.config.js --env production
   pm2 save
   pm2 startup
   ```

4. **Set up environment variables on Hostinger**:
   - Copy `.env.production.example` content
   - Create `.env` file on server
   - Update values for production

5. **Verify deployment**:
   ```bash
   # Check if app is running
   pm2 status
   
   # View logs
   pm2 logs harmony-backend
   
   # Test API endpoint
   curl http://localhost:3000/health
   ```

### Option 2: Using Hostinger Control Panel

If Hostinger provides a control panel for Node.js apps:

1. Upload your code via Git or FTP
2. Set environment variables in the panel
3. Run `npm install --production`
4. Start the application

---

## 🔐 Security Checklist

Before going live, ensure:

- [ ] Changed `JWT_SECRET` to a strong random string
- [ ] Changed `JWT_REFRESH_SECRET` to a strong random string
- [ ] Set `CORS_ORIGIN=*` (acceptable for Android apps, CORS doesn't apply to native apps)
- [ ] Set `NODE_ENV=production`
- [ ] MongoDB Atlas has Hostinger server IP whitelisted
- [ ] Firebase credentials are set (env vars or JSON file)
- [ ] `.env` file is NOT in git repository
- [ ] `firebase-service-account.json` is NOT in git repository
- [ ] Changed default `QR_ENCRYPTION_KEY` if needed
- [ ] (Recommended) Set up HTTPS/SSL for secure Android communication

---

## 🔍 Important URLs After Deployment

Replace `your-hostinger-ip` with your actual server IP:

- **Health Check**: `http://your-hostinger-ip:3000/health`
- **API Base**: `http://your-hostinger-ip:3000/api/v1`
- **Auth Endpoints**: `http://your-hostinger-ip:3000/api/v1/auth`

If using domain with Nginx and SSL (recommended for Android):
- **Health Check**: `https://api.yourdomain.com/health`
- **API Base**: `https://api.yourdomain.com/api/v1`

### 📱 Android App Configuration

After deploying your backend, update your Android app's API base URL:

```kotlin
// In your Android app (e.g., RetrofitClient.kt or ApiConfig.kt)

// Development
const val BASE_URL = "http://192.168.100.12:3000/api/v1/"

// Production (HTTP - requires network security config for Android 9+)
const val BASE_URL = "http://YOUR_HOSTINGER_IP:3000/api/v1/"

// Production (HTTPS - Recommended)
const val BASE_URL = "https://api.yourdomain.com/api/v1/"
```

> **Note**: For Android 9+ (API 28+), HTTPS is required by default. See [`ANDROID_DEPLOYMENT.md`](./ANDROID_DEPLOYMENT.md) for details.


---

## 📞 Quick Reference Commands

### On Your Local Machine
```bash
# Generate JWT secret
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# Commit and push changes
git add .
git commit -m "Your message"
git push origin main
```

### On Hostinger Server
```bash
# Update code
cd ~/harmony-backend
git pull origin main
npm install --production
pm2 restart harmony-backend

# View logs
pm2 logs harmony-backend

# Check status
pm2 status

# Monitor resources
pm2 monit
```

---

## ⚠️ Common Issues

### "MongoDB connection failed"
→ Whitelist Hostinger server IP in MongoDB Atlas

### "Firebase credentials not found"
→ Set environment variables or upload `firebase-service-account.json`

### "QR_ENCRYPTION_KEY required"
→ Add `QR_ENCRYPTION_KEY=UnanzaHarmony24!` to `.env`

### "Port 3000 already in use"
→ Change PORT in `.env` or stop conflicting process

---

## 📚 Resources

- [`DEPLOYMENT.md`](./DEPLOYMENT.md) - Full deployment guide
- [`ecosystem.config.js`](./ecosystem.config.js) - PM2 configuration
- [`.env.production.example`](./.env.production.example) - Environment template

---

## 🎉 Next Steps

1. ✅ Review this checklist
2. ✅ Add missing env vars to your local `.env`
3. ✅ Test locally: `npm start`
4. ✅ Push to GitHub/GitLab
5. ✅ Follow deployment steps above
6. ✅ Verify on Hostinger
7. ✅ Set up SSL certificate (Let's Encrypt recommended)
8. ✅ Configure Nginx reverse proxy (optional but recommended)

**Good luck with your deployment! 🚀**
