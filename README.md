# Harmony IoT Platform - Backend Server

Complete Express.js backend implementing all 31 API endpoints from the API documentation.

## 🚀 Features

- ✅ **Authentication:** Register, Login (email/password + Google OAuth), JWT tokens
- ✅ **User Management:** Profile management, statistics
- ✅ **Workspaces:** Full CRUD operations
- ✅ **Devices:** All device types (Smart Bin, Lamp, Access Control, RFID)
- ✅ **Members:** Role-based access control, permissions
- ✅ **Notifications:** Real-time notifications system
- ✅ **Analytics:** Workspace and user statistics

## 📋 Prerequisites

- Node.js >= 16.x
- MongoDB >= 5.x
- npm or yarn

## 🛠️ Installation

1. **Navigate to backend directory:**
   ```bash
   cd harmony-backend
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Create environment file:**
   ```bash
   cp .env.example .env
   ```

4. **Configure environment variables in `.env`:**
   ```env
   PORT=3000
   MONGODB_URI=mongodb://localhost:27017/harmony-iot
   JWT_SECRET=your_secret_key_here
   JWT_REFRESH_SECRET=your_refresh_secret_here
   GOOGLE_CLIENT_ID=your_google_client_id
   ```

## 🏃 Running the Server

**Development mode (with auto-reload):**
```bash
npm run dev
```

**Production mode:**
```bash
npm start
```

The server will start on `http://localhost:3000`

## 📡 API Endpoints

Base URL: `http://localhost:3000/api/v1`

### Authentication
- `POST /auth/register` - Register new user
- `POST /auth/login` - Login with email/password
- `POST /auth/google` - Google OAuth sign-in
- `POST /auth/refresh` - Refresh access token
- `POST /auth/logout` - Logout user

### Users
- `GET /users/me` - Get current user
- `PATCH /users/me` - Update profile
- `GET /users/me/statistics` - Get user statistics

### Workspaces
- `GET /workspaces` - List all workspaces
- `GET /workspaces/:id` - Get workspace details
- `POST /workspaces` - Create workspace
- `PATCH /workspaces/:id` - Update workspace
- `DELETE /workspaces/:id` - Delete workspace
- `GET /workspaces/:id/statistics` - Get workspace statistics
- `GET /workspaces/:id/devices` - List workspace devices
- `POST /workspaces/:id/devices` - Add device to workspace
- `GET /workspaces/:id/members` - List workspace members
- `POST /workspaces/:id/members/invite` - Invite member
- `GET /workspaces/:id/notifications` - List notifications
- `POST /workspaces/:id/notifications/read-all` - Mark all as read

### Devices
- `GET /devices/:id` - Get device details
- `PATCH /devices/:id` - Update device
- `DELETE /devices/:id` - Remove device
- `POST /devices/:id/control` - Control device

### Members
- `PATCH /members/:workspaceId/:memberId` - Update member role
- `PATCH /members/:workspaceId/:memberId/permissions` - Update permissions
- `DELETE /members/:workspaceId/:memberId` - Remove member

### Notifications
- `PATCH /notifications/:id/read` - Mark as read
- `DELETE /notifications/:id` - Delete  notification

## 🗄️ Database Schema

### Collections:
- **users** - User accounts and authentication
- **workspaces** - Workspace/organization data
- **devices** - IoT devices
- **workspacemembers** - Workspace membership and roles
- **notifications** - User notifications

## 🔐 Authentication

The API uses JWT (JSON Web Tokens) for authentication:

1. Register or login to receive `accessToken` and `refreshToken`
2. Include access token in requests: `Authorization: Bearer {accessToken}`
3. Access tokens expire in 1 hour
4. Use refresh token to get new access token when expired

## 🧪 Testing

Test the API using:
- **Postman** - Import the endpoints
- **cURL** - Command line testing
- **Android App** - Connect your Harmony IoT Android app

### Example cURL:
```bash
# Register
curl -X POST http://localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"John Doe","email":"john@example.com","password":"password123"}'

# Login
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"john@example.com","password":"password123"}'

# Get current user (with token)
curl -X GET http://localhost:3000/api/v1/users/me \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

## 📱 Android App Integration

1. **Update Android app base URL:**
   ```kotlin
   const val BASE_URL = "http://YOUR_IP_ADDRESS:3000/api/v1/"
   ```

2. **Use your local IP** (not localhost) when testing on physical device

3. **All mock data can now be replaced** with real API calls!

## 🔧 Project Structure

```
harmony-backend/
├── src/
│   ├── config/
│   │   └── database.js          # MongoDB connection
│   ├── controllers/
│   │   ├── authController.js    # Authentication logic
│   │   ├── userController.js    # User management
│   │   ├── workspaceController.js
│   │   ├── deviceController.js
│   │   ├── memberController.js
│   │   └── notificationController.js
│   ├── models/
│   │   ├── User.js              # User schema
│   │   ├── Workspace.js         # Workspace schema
│   │   ├── Device.js            # Device schema
│   │   ├── WorkspaceMember.js   # Member schema
│   │   └── Notification.js      # Notification schema
│   ├── routes/
│   │   ├── authRoutes.js        # Auth endpoints
│   │   ├── userRoutes.js        # User endpoints
│   │   ├── workspaceRoutes.js
│   │   ├── deviceRoutes.js
│   │   ├── memberRoutes.js
│   │   └── notificationRoutes.js
│   ├── middleware/
│   │   └── auth.js              # JWT authentication
│   ├── utils/
│   │   └── tokenUtils.js        # Token generation
│   └── server.js                # Main application
├── .env.example                 # Environment template
├── .gitignore
├── package.json
└── README.md
```

## 🚨 Important Notes

1. **Change JWT secrets** in production
2. **Set up Google OAuth** credentials in Google Cloud Console
3. **Use MongoDB Atlas** or local MongoDB
4. **Enable CORS** for your Android app's domain
5. **Use HTTPS** in production

## 📝 License

MIT

## 🤝 Support

For issues or questions, refer to the API_DOCUMENTATION.md file in the parent directory.
