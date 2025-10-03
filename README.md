# AI Todo - Node.js Backend

A robust REST API backend for the AI Todo application, built with Node.js, Express, MongoDB, and Google Gemini AI integration.

[![Node.js](https://img.shields.io/badge/Node.js-18.x-339933?logo=node.js)](https://nodejs.org)
[![Express](https://img.shields.io/badge/Express-5.x-000000?logo=express)](https://expressjs.com)
[![MongoDB](https://img.shields.io/badge/MongoDB-6.x-47A248?logo=mongodb)](https://mongodb.com)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

## 🚀 Features

### 🔐 Authentication
- **JWT-based authentication** - Secure token-based auth
- **Password hashing** - bcrypt encryption
- **Token validation** - Middleware-based auth checks
- **Session management** - 7-day token expiry

### 📝 Task Management
- **CRUD operations** - Create, Read, Update, Delete tasks
- **Task types** - One-time, recurring (daily/weekly), reminders, schedule blocks
- **Date range queries** - Efficient fetching for calendar views
- **Completion tracking** - Per-date completion for recurring tasks
- **Priority levels** - Low, Medium, High, Critical
- **Tags & categories** - Organize tasks effectively

### 🤖 AI Integration
- **Google Gemini AI** - Powered by latest Gemini 2.0 models
- **Multiple AI modes**
  - Summary: Daily/weekly overviews
  - Create: Natural language task parsing
  - Prioritize: Intelligent task ordering
  - Analyze: Productivity pattern detection
- **Context-aware responses** - Analyzes user's actual tasks
- **JSON-only output** - Strict formatting for reliability
- **Rate limiting** - 10 requests/minute per user
- **Input validation** - Prevents spam and abuse

### 🛡️ Security & Validation
- **Input sanitization** - Prevents injection attacks
- **Rate limiting** - API abuse prevention
- **CORS enabled** - Secure cross-origin requests
- **Helmet.js** - Security headers
- **Environment variables** - Sensitive data protection

## 🏗️ Architecture

```
backend/
├── server.js                  # App entry point
│
├── auth/
│   └── auth.js                # Authentication routes
│
├── middleware/
│   └── authMiddleware.js      # JWT verification
│
├── models/
│   ├── users.js               # User schema
│   ├── todos.js               # Task schema
│   └── category.js            # Category schema
│
├── routes/
│   ├── todos.js               # Task CRUD + completion
│   ├── categories.js          # Category management
│   └── ai.js                  # AI endpoints (enhanced)
│
└── utils/
    ├── geminiClient.js        # Google Gemini API wrapper
    └── date_helper_server.js  # Date utilities
```

## 📊 Database Schema

### Users Collection
```javascript
{
  _id: ObjectId,
  username: String,
  email: String (unique, indexed),
  password: String (hashed),
  createdAt: Date,
  updatedAt: Date
}
```

### Todos Collection
```javascript
{
  _id: ObjectId,
  user: ObjectId (ref: User),
  category: ObjectId (ref: Category),
  title: String,
  description: String,
  type: 'one-time' | 'reminder' | 'recurring' | 'schedule-block',
  date: Date,
  time: String (HH:mm),
  recurrence: {
    type: 'none' | 'daily' | 'weekly' | 'custom',
    time: String,
    days: [String] // ['monday', 'wednesday', 'friday']
  },
  schedule: [{
    day: String,
    start: String,
    end: String
  }],
  completed: Boolean,
  completions: [{
    date: Date
  }],
  priority: 'low' | 'medium' | 'high' | 'critical',
  tags: [String],
  createdByAI: Boolean,
  createdAt: Date,
  updatedAt: Date
}
```

### Categories Collection
```javascript
{
  _id: ObjectId,
  user: ObjectId (ref: User),
  name: String,
  icon: String,
  color: String (hex),
  createdAt: Date,
  updatedAt: Date
}
```

## 🔌 API Endpoints

### Authentication

#### Register User
```http
POST /api/auth/register
Content-Type: application/json

{
  "username": "John Doe",
  "email": "john@example.com",
  "password": "securePassword123"
}

Response: 201 Created
{
  "ok": true,
  "message": "User registered successfully",
  "token": "jwt_token_here",
  "user": {
    "id": "user_id",
    "username": "John Doe",
    "email": "john@example.com"
  }
}
```

#### Login
```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "john@example.com",
  "password": "securePassword123"
}

Response: 200 OK
{
  "ok": true,
  "message": "Login successful",
  "token": "jwt_token_here",
  "user": {...}
}
```

### Tasks

#### Get Tasks in Date Range
```http
GET /api/todos/range?start=2025-01-01&end=2025-01-31
Authorization: Bearer {token}

Response: 200 OK
{
  "success": true,
  "count": 15,
  "data": [...]
}
```

#### Create Task
```http
POST /api/todos
Authorization: Bearer {token}
Content-Type: application/json

{
  "title": "Buy groceries",
  "description": "Milk, eggs, bread",
  "type": "one-time",
  "date": "2025-10-05",
  "time": "14:00",
  "priority": "medium",
  "tags": ["shopping"]
}

Response: 201 Created
{
  "success": true,
  "data": {...}
}
```

#### Mark Task Complete
```http
PATCH /api/todos/:id/complete?date=2025-10-05
Authorization: Bearer {token}

Response: 200 OK
{
  "success": true,
  "data": {...},
  "completedFor": "2025-10-05"
}
```

#### Update Task
```http
PUT /api/todos/:id
Authorization: Bearer {token}
Content-Type: application/json

{
  "title": "Updated title",
  "priority": "high"
}

Response: 200 OK
{
  "success": true,
  "data": {...}
}
```

#### Delete Task
```http
DELETE /api/todos/:id
Authorization: Bearer {token}

Response: 200 OK
{
  "success": true,
  "message": "Todo deleted successfully"
}
```

### AI Assistant

#### AI Assist
```http
POST /api/ai/assist
Authorization: Bearer {token}
Content-Type: application/json

{
  "prompt": "Summarize my day and what I should focus on",
  "mode": "summary"
}

Response: 200 OK
{
  "ok": true,
  "data": {
    "summary": "You have 5 tasks today...",
    "advice": "Focus on high-priority items first...",
    "highlights": ["Point 1", "Point 2"],
    "warnings": ["Warning if overloaded"],
    "suggestedTasks": [],
    "meta": {
      "mode": "summary",
      "taskCount": 10,
      "overdueCount": 2,
      "todayCount": 5
    }
  }
}
```

#### Commit AI Tasks
```http
POST /api/ai/commit
Authorization: Bearer {token}
Content-Type: application/json

{
  "tasks": [
    {
      "title": "Task 1",
      "description": "Description",
      "priority": "medium",
      "relativeDayOffset": 0,
      "time": "14:00",
      "tags": ["work"]
    }
  ]
}

Response: 200 OK
{
  "ok": true,
  "createdCount": 1,
  "created": [...],
  "message": "Successfully created 1 tasks"
}
```

### Categories

#### Get All Categories
```http
GET /api/categories
Authorization: Bearer {token}

Response: 200 OK
{
  "success": true,
  "count": 3,
  "data": [...]
}
```

#### Create Category
```http
POST /api/categories
Authorization: Bearer {token}
Content-Type: application/json

{
  "name": "Work",
  "icon": "💼",
  "color": "#3b82f6"
}

Response: 201 Created
{
  "success": true,
  "data": {...}
}
```

## 🚀 Getting Started

### Prerequisites
- Node.js 18.x or higher
- MongoDB 6.x or higher
- Google Gemini API Key

### Installation

1. **Clone the repository**
```bash
git clone https://github.com/yourusername/ai-todo-backend.git
cd ai-todo-backend
```

2. **Install dependencies**
```bash
npm install
```

3. **Create `.env` file**
```bash
cp .env.example .env
```

Edit `.env`:
```env
# Server
PORT=3000
NODE_ENV=development

# MongoDB
MONGODB_URI=mongodb://localhost:27017/ai_todo_backend

# JWT
JWT_SECRET=your_super_secret_jwt_key_change_this_in_production

# Google Gemini AI
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-2.0-flash-exp
```

4. **Start MongoDB**
```bash
# If using local MongoDB
mongod

# Or using Docker
docker run -d -p 27017:27017 --name mongodb mongo:latest
```

5. **Run the server**
```bash
# Development mode (with nodemon)
npm run dev

# Production mode
npm start
```

Server should start on `http://localhost:3000`

## 🔑 Environment Variables

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `PORT` | Server port | No | 3000 |
| `MONGODB_URI` | MongoDB connection string | Yes | - |
| `JWT_SECRET` | Secret for JWT signing | Yes | - |
| `GEMINI_API_KEY` | Google Gemini API key | Yes | - |
| `GEMINI_MODEL` | Gemini model version | No | gemini-2.0-flash-exp |
| `NODE_ENV` | Environment mode | No | development |

### Get Gemini API Key
1. Visit [Google AI Studio](https://aistudio.google.com/apikey)
2. Sign in with Google account
3. Click "Create API Key"
4. Copy and paste into `.env`

## 🧪 Testing

### Test endpoints with curl

**Health Check**
```bash
curl http://localhost:3000/
# Response: "server running"
```

**Register User**
```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "Test User",
    "email": "test@example.com",
    "password": "password123"
  }'
```

**Login**
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123"
  }'
```

**Get Tasks** (replace TOKEN)
```bash
curl http://localhost:3000/api/todos/range?start=2025-01-01&end=2025-12-31 \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

## 📊 Performance & Limits

### Rate Limits
| Endpoint | Limit | Window |
|----------|-------|--------|
| `/api/ai/*` | 10 requests | 1 minute |
| Other endpoints | No limit | - |

### Response Times
- Authentication: <100ms
- CRUD operations: <50ms
- AI requests: 2-10 seconds
- Database queries: <20ms (indexed)

### Scalability
- **Concurrent connections**: 1000+
- **Database**: Indexed queries for performance
- **Caching**: Considered for future implementation
- **Clustering**: Ready for PM2/Docker deployment

## 🐛 Troubleshooting

### Common Issues

**"Error connecting database"**
```bash
# Check MongoDB is running
mongosh

# Check connection string in .env
MONGODB_URI=mongodb://localhost:27017/ai_todo_backend
```

**"GEMINI_API_KEY not set"**
- Add key to `.env` file
- Restart server after changing `.env`

**"Invalid or expired token"**
- Token expires after 7 days
- Login again to get new token
- Check `Authorization: Bearer {token}` header

**Port already in use**
```bash
# Kill process on port 3000
lsof -ti:3000 | xargs kill -9

# Or use different port
PORT=3001 npm run dev
```

## 🔒 Security Best Practices

### Implemented
✅ Password hashing with bcrypt (10 rounds)
✅ JWT token authentication
✅ Input validation and sanitization
✅ Rate limiting on sensitive endpoints
✅ CORS configuration
✅ Helmet.js security headers
✅ Environment variable protection
✅ MongoDB injection prevention

### Recommended for Production
- [ ] HTTPS/TLS encryption
- [ ] API key rotation
- [ ] Database connection pooling
- [ ] Request logging and monitoring
- [ ] DDoS protection
- [ ] Backup strategy
- [ ] Error tracking (Sentry)

## 📈 Monitoring

### Logging
- Morgan HTTP request logging
- Console logs for debugging
- Error logs for failures

### Metrics to Track
- API response times
- Database query performance
- AI request success rate
- Active users
- Error rates

## 🚢 Deployment

### Using PM2

1. **Install PM2**
```bash
npm install -g pm2
```

2. **Create `ecosystem.config.js`**
```javascript
module.exports = {
  apps: [{
    name: 'ai-todo-backend',
    script: 'server.js',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    }
  }]
};
```

3. **Start with PM2**
```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

### Using Docker

1. **Create `Dockerfile`**
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
```

2. **Build and run**
```bash
docker build -t ai-todo-backend .
docker run -p 3000:3000 --env-file .env ai-todo-backend
```

### Using Heroku

```bash
heroku create ai-todo-backend
heroku config:set MONGODB_URI=your_mongodb_uri
heroku config:set JWT_SECRET=your_secret
heroku config:set GEMINI_API_KEY=your_key
git push heroku main
```

## 📝 Development

### Code Structure
- **RESTful design** - Standard HTTP methods
- **Middleware pattern** - Authentication, validation
- **Error handling** - Try-catch blocks
- **Async/await** - Modern async patterns
- **Modular routes** - Separated by feature

### Adding New Features

1. **Create model** in `models/`
2. **Add routes** in `routes/`
3. **Update middleware** if needed
4. **Test endpoints** with curl/Postman
5. **Document in README**

### Code Style
- Use ES6+ features
- Async/await over callbacks
- Descriptive variable names
- Comments for complex logic
- Consistent error handling

## 🤝 Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

## 📄 License

This project is licensed under the MIT License - see [LICENSE](LICENSE) file.

## 👨‍💻 Author
**Niraj Paradva**

## 🙏 Acknowledgments

- Express.js team
- MongoDB team
- Google Gemini AI team

## 📞 Support

For issues:
- Open GitHub issue
- Email: nirajparadva2004@gmail.com


---

**Built with ⚡ using Node.js & Express**
