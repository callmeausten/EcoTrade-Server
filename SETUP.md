# Harmony IoT Backend - Setup Guide

## Quick Start

### 1. Install MongoDB

**Windows:**
- Download from: https://www.mongodb.com/try/download/community
- Install and start MongoDB service

**Linux/Mac:**
```bash
# Linux
sudo apt-get install mongodb

# Mac
brew install mongodb-community
brew services start mongodb-community
```

### 2. Install Node.js Dependencies

```bash
cd harmony-backend
npm install
```

### 3. Configure Environment

```bash
# Copy example env file
cp .env.example .env

# Edit .env file with your settings
notepad .env  # Windows
nano .env     # Linux/Mac
```

**Required Environment Variables:**
```env
PORT=3000
MONGODB_URI=mongodb://localhost:27017/harmony-iot
JWT_SECRET=change_this_to_random_secret_key
JWT_REFRESH_SECRET=change_this_to_another_random_key
GOOGLE_CLIENT_ID=your_google_oauth_client_id
```

### 4. Start the Server

```bash
# Development mode (auto-reload)
npm run dev

# Production mode
npm start
```

Server will start at: `http://localhost:3000`

## Testing the API

### Using cURL

**1. Register a user:**
```bash
curl -X POST http://localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"Test User\",\"email\":\"test@example.com\",\"password\":\"password123\"}"
```

**2. Login:**
```bash
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"test@example.com\",\"password\":\"password123\"}"
```

**3. Get user profile (replace TOKEN):**
```bash
curl -X GET http://localhost:3000/api/v1/users/me \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN_HERE"
```

**4. Create workspace:**
```bash
curl -X POST http://localhost:3000/api/v1/workspaces \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN_HERE" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"My Workspace\",\"type\":\"PRIVATE\"}"
```

## Android App Integration

### Update Android App

In your Android app's network configuration, update the base URL:

```kotlin
// In your Retrofit/API configuration file
object ApiConfig {
    // For emulator (use 10.0.2.2)
    const val BASE_URL = "http://10.0.2.2:3000/api/v1/"
    
    // For physical device (use your computer's local IP)
    // Find your IP: ipconfig (Windows) or ifconfig (Mac/Linux)
    // const val BASE_URL = "http://192.168.1.100:3000/api/v1/"
}
```

### Find Your Local IP Address

**Windows:**
```bash
ipconfig
# Look for "IPv4 Address" under your network adapter
```

**Mac/Linux:**
```bash
ifconfig
# Look for "inet" address
```

## Google OAuth Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or select existing)
3. Enable "Google+ API"
4. Create OAuth 2.0 credentials
5. Configure consent screen
6. Add authorized redirect URIs
7. Copy Client ID to `.env` file
8. Add Client ID to your Android app's `strings.xml`:

```xml
<string name="default_web_client_id">YOUR_GOOGLE_CLIENT_ID</string>
```

## Troubleshooting

### MongoDB Connection Error
- Ensure MongoDB is running: `mongod --version`
- Check connection string in `.env`
- Default MongoDB runs on port 27017

### Port Already in Use
- Change PORT in `.env` to different number (e.g., 3001)
- Or kill process using port 3000

### CORS Errors from Android App
- Update CORS_ORIGIN in `.env` to allow your app's origin
- Or set to `*` for development (not recommended for production)

### Google OAuth Errors
- Verify GOOGLE_CLIENT_ID in `.env`
- Ensure Android app SHA-1 fingerprint is registered in Google Cloud Console
- Check token expiration

## Production Deployment

### Environment Setup
1. Use environment variables (not .env file)
2. Use strong JWT secrets (32+ random characters)
3. Use MongoDB Atlas or managed database
4. Enable HTTPS
5. Set NODE_ENV=production

### Recommended Hosting
- **Heroku** - Easy deployment
- **AWS EC2** - Full control
- **Digital Ocean** - Affordable VPS
- **Google Cloud Run** - Serverless

### Database
- **MongoDB Atlas** - Free tier available
- Connection string format: `mongodb+srv://username:password@cluster.mongodb.net/harmony-iot`

## API Documentation

Full API documentation available in: `../API_DOCUMENTATION.md`

All 31 endpoints are implemented and ready to use!

## Support

- Check logs for errors: Server outputs detailed error messages
- Verify MongoDB is running
- Ensure all environment variables are set
- Test endpoints with cURL or Postman before connecting Android app

Happy coding! 🚀
