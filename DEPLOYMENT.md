# 🚀 Deployment Guide - Hostinger

This guide will help you deploy the Harmony IoT Backend to Hostinger VPS/Cloud hosting.

---

## 📋 Pre-Deployment Checklist

Before deploying, ensure you have:

- [x] Hostinger VPS or Cloud Hosting account
- [x] MongoDB Atlas database (already configured)
- [x] Firebase service account credentials
- [x] All environment variables ready
- [x] Node.js installed on server (v16+ recommended)

---

## 🔧 Step 1: Prepare Environment Variables

Hostinger typically uses a control panel to manage environment variables. You'll need to set these in your hosting panel:

### Required Environment Variables

```env
# Server Configuration
PORT=3000
NODE_ENV=production

# MongoDB Configuration (MongoDB Atlas)
MONGODB_URI=mongodb+srv://elbert:elbert@cluster0.7kinng9.mongodb.net/harmony-iot

# JWT Configuration - CHANGE THESE IN PRODUCTION!
JWT_SECRET=CHANGE_THIS_TO_A_SECURE_RANDOM_STRING_IN_PRODUCTION
JWT_REFRESH_SECRET=CHANGE_THIS_TO_ANOTHER_SECURE_RANDOM_STRING
JWT_EXPIRES_IN=1h
JWT_REFRESH_EXPIRES_IN=7d

# Google OAuth Configuration
GOOGLE_CLIENT_ID=279463931878-fsatj0fuqlqpi77f8p92h0rbk6e0gg4l.apps.googleusercontent.com

# API Configuration
API_VERSION=v1

# CORS Configuration - Set to your frontend domain
CORS_ORIGIN=https://yourdomain.com

# QR Code Encryption (MUST match ESP32 firmware)
QR_ENCRYPTION_KEY=UnanzaHarmony24!

# Server Network Configuration - Set to your Hostinger server IP
SERVER_IP=your-hostinger-server-ip

# Firebase Admin SDK (RECOMMENDED for production)
FIREBASE_PROJECT_ID=your-firebase-project-id
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYour-Private-Key-Here\n-----END PRIVATE KEY-----"
FIREBASE_CLIENT_EMAIL=firebase-adminsdk@your-project.iam.gserviceaccount.com
```

> **⚠️ IMPORTANT**: Generate strong random strings for `JWT_SECRET` and `JWT_REFRESH_SECRET` in production!

---

## 🔐 Step 2: Firebase Credentials Setup

### Option A: Using Environment Variables (RECOMMENDED for Hostinger)

1. Open your `firebase-service-account.json` file locally
2. Extract the following values:
   - `project_id` → `FIREBASE_PROJECT_ID`
   - `private_key` → `FIREBASE_PRIVATE_KEY`
   - `client_email` → `FIREBASE_CLIENT_EMAIL`

3. Add them to your Hostinger environment variables

### Option B: Using JSON File

1. Upload `firebase-service-account.json` to `src/config/` on the server
2. Ensure it's NOT in your git repository (already in `.gitignore`)
3. Set proper file permissions: `chmod 600 src/config/firebase-service-account.json`

---

## 📦 Step 3: Update package.json

Your `package.json` is already configured correctly with:
```json
{
  "scripts": {
    "start": "node src/server.js"
  }
}
```

This is perfect for production deployment.

---

## 🌐 Step 4: Deploy to Hostinger

### Method 1: Using Git (Recommended)

1. **Initialize Git repository** (if not already done):
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   ```

2. **Push to GitHub/GitLab**:
   ```bash
   git remote add origin <your-repo-url>
   git push -u origin main
   ```

3. **SSH into Hostinger**:
   ```bash
   ssh your-username@your-hostinger-ip
   ```

4. **Clone your repository**:
   ```bash
   cd ~
   git clone <your-repo-url> harmony-backend
   cd harmony-backend
   ```

5. **Install dependencies**:
   ```bash
   npm install --production
   ```

6. **Set environment variables** in Hostinger control panel or create `.env` file manually

7. **Start the application**:
   ```bash
   npm start
   ```

### Method 2: Using FTP/SFTP

1. **Build locally** (if needed)
2. **Upload files** via FTP/SFTP to your Hostinger server
3. **Exclude** these folders/files from upload:
   - `node_modules/` (will install on server)
   - `.git/`
   - `.env` (configure on server)
   - `firebase-service-account.json` (configure separately)

4. **SSH into server** and run:
   ```bash
   cd /path/to/your/app
   npm install --production
   npm start
   ```

---

## 🔄 Step 5: Process Management (Keep App Running)

### Option A: Using PM2 (Recommended)

1. **Install PM2 globally**:
   ```bash
   npm install -g pm2
   ```

2. **Start your app with PM2**:
   ```bash
   pm2 start src/server.js --name harmony-backend
   ```

3. **Save PM2 configuration**:
   ```bash
   pm2 save
   pm2 startup
   ```

4. **Useful PM2 commands**:
   ```bash
   pm2 status              # Check status
   pm2 logs harmony-backend # View logs
   pm2 restart harmony-backend # Restart app
   pm2 stop harmony-backend    # Stop app
   pm2 delete harmony-backend  # Remove from PM2
   ```

### Option B: Using systemd

Create a systemd service file (if Hostinger supports it).

---

## 🔒 Step 6: Nginx Configuration (Reverse Proxy)

If using Nginx on Hostinger, create a configuration:

```nginx
server {
    listen 80;
    server_name yourdomain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

---

## ✅ Step 7: Verify Deployment

1. **Test the API endpoint**:
   ```bash
   curl http://your-server-ip:3000/health
   ```

   Expected response:
   ```json
   {"status":"OK","timestamp":"2026-01-24T..."}
   ```

2. **Check server logs**:
   ```bash
   pm2 logs harmony-backend
   ```

   Look for:
   - ✅ MongoDB Connected
   - ✅ Firebase credentials loaded
   - ✅ Server running on port 3000

3. **Test your API routes**:
   - `GET /health` - Health check
   - `POST /api/v1/auth/register` - User registration
   - `POST /api/v1/auth/login` - User login

---

## 🔐 Security Recommendations

1. **Change default secrets**:
   - Generate new `JWT_SECRET` and `JWT_REFRESH_SECRET`
   - Use: `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`

2. **Update CORS origin**:
   - Set `CORS_ORIGIN` to your actual frontend domain
   - Never use `*` in production

3. **Firewall configuration**:
   - Only expose necessary ports (80, 443, 22)
   - Block direct access to port 3000 (use Nginx reverse proxy)

4. **SSL/TLS Certificate**:
   - Install Let's Encrypt certificate
   - Force HTTPS redirect

5. **Environment variables**:
   - Never commit `.env` to git
   - Never commit `firebase-service-account.json` to git

---

## 🔧 Troubleshooting

### App won't start

Check logs:
```bash
pm2 logs harmony-backend --lines 100
```

Common issues:
- Missing environment variables
- MongoDB connection failed
- Port already in use
- Missing dependencies

### MongoDB connection issues

- Whitelist Hostinger server IP in MongoDB Atlas
- Verify `MONGODB_URI` is correct
- Check network connectivity

### Firebase authentication errors

- Verify Firebase credentials are correct
- Check environment variables are properly set
- Ensure private key format is correct (with `\n` preserved)

---

## 📊 Monitoring

### View logs
```bash
pm2 logs harmony-backend
```

### Monitor resources
```bash
pm2 monit
```

### Application metrics
```bash
pm2 status
```

---

## 🔄 Updating Your Application

1. **Pull latest changes**:
   ```bash
   cd ~/harmony-backend
   git pull origin main
   ```

2. **Install new dependencies** (if any):
   ```bash
   npm install --production
   ```

3. **Restart application**:
   ```bash
   pm2 restart harmony-backend
   ```

---

## 📞 Support

If you encounter issues:
1. Check server logs: `pm2 logs`
2. Verify environment variables are set correctly
3. Test MongoDB Atlas connection
4. Verify Firebase credentials

---

## 🎯 Quick Deployment Commands

```bash
# SSH into Hostinger
ssh your-username@your-server-ip

# Clone repository
git clone <your-repo> harmony-backend
cd harmony-backend

# Install dependencies
npm install --production

# Install PM2
npm install -g pm2

# Start application
pm2 start src/server.js --name harmony-backend
pm2 save

# Check status
pm2 status
pm2 logs harmony-backend
```

---

**🎉 Your Harmony IoT Backend should now be live on Hostinger!**
