# 🎓 VTOP Chatbot Assistant

An intelligent, AI-powered chatbot interface for VIT students to interact with VTOP (VIT's academic portal) using natural language. Built with Node.js, Express, React, and Google's Gemini AI.

![VTOP Chatbot](https://img.shields.io/badge/VIT-VTOP%20Assistant-blue)
![Node.js](https://img.shields.io/badge/Node.js-v18+-green)
![React](https://img.shields.io/badge/React-18-blue)
![License](https://img.shields.io/badge/license-MIT-blue)

## ✨ Features

### 🤖 **Intelligent Conversational Interface**
- **Natural Language Understanding** - Powered by Gemini 2.5 Flash for human-like interactions
- **Multi-Intent Recognition** - Handle multiple queries simultaneously (e.g., "Show attendance and marks")
- **Context-Aware Responses** - Dynamic suggestions based on conversation history
- **Smart Data Presentation** - Automatically formats complex data into readable markdown tables

### 📊 **What You Can Ask**
- **📈 Performance Tracking**
  - Current CGPA and semester-wise GPA
  - Complete grade history with distribution analysis
  - Marks breakdown for all assessments (CAT1, CAT2, FAT)
  - Subject-wise performance with passing status predictions
  
- **📅 Attendance Management**
  - Real-time attendance percentage
  - Debarment risk alerts (color-coded: 🔴 Danger, ⚠️ Caution, ✅ Safe)
  - Classes needed to reach 75% threshold
  - Skip-class calculator for safe attendance levels
  
- **📋 Assignment Tracking**
  - Digital assignment deadlines
  - Automatic deadline status (overdue, due today, days remaining)
  - Course-wise organization
  - Urgent task highlighting

### 🗓️ **Schedule & Calendar**
- **Exam Schedules** - FAT, CAT1, CAT2 with venue and seat details
- **Weekly Timetable** - Day-wise class schedule with venues and faculty
- **Academic Calendar** - Semester events, holidays, instructional days
- **Smart Time Management** - Visual slot-based timetable organization

### 👨‍🏫 **Faculty & Administrative**
- **Faculty Search** - Find faculty by name with contact details and open hours
- **Proctor Information** - View assigned proctor details
- **Payment History** - Fee receipts and transaction records
- **Login History** - Session tracking and IP address logs

### 🏠 **Hostel Management**
- **Leave History** - Past leave applications with approval status
- **Current Leave Status** - Pending and active leave requests
- **Counselling Rank** - Hostel counselling slot and timing information

### 📚 **Previous Year Papers** *(NEW!)*
- Browse and download past exam papers
- Search by course name or code
- Filter by paper type (CAT1, CAT2, FAT)
- Integrated with VIT PYQPs repository

### 🔥 **Advanced Features**
- **Parallel Data Fetching** - Lightning-fast response for multi-intent queries
- **Smart Caching** - 30-minute cache for instant repeated queries
- **Session Isolation** - Each user gets independent browser session
- **Auto CAPTCHA Solving** - ViBoOT algorithm with 95%+ accuracy
- **Intelligent Retry Mechanism** - Auto-recovery from temporary failures

## 🚀 Quick Start

### Prerequisites

```bash
# Required
- Node.js v18 or higher
- npm or yarn
- Google Gemini API key

# Optional (for demo mode)
- VTOP credentials
- GitHub token (for papers feature)
```

### Installation

1. **Clone the repository**
```bash
git clone https://github.com/yourusername/vtop-chatbot.git
cd vtop-chatbot
```

2. **Install dependencies**
```bash
cd backend
npm install
```

3. **Configure environment variables**

Create a `.env` file in the `backend` directory:

```env
# Server Configuration
PORT=3000

# Google Gemini API (Required)
GEMINI_API_KEY=your_gemini_api_key_here

# Demo Mode Credentials (Optional)
VTOP_USERNAME=your_vtop_username
VTOP_PASSWORD=your_vtop_password

# GitHub Token for Papers Feature (Optional but recommended)
GITHUB_TOKEN=your_github_personal_access_token
```

4. **Start the server**
```bash
npm start
```

5. **Open your browser**
```
http://localhost:3000
```

## 💡 What You Can Ask

### Academic Performance
```
✅ "What's my CGPA?"
✅ "Show my complete academic history"
✅ "Which subject am I performing worst in?"
✅ "Do I have any courses with failing marks?"
✅ "Show me my grade distribution"
```

### Attendance Queries
```
✅ "Show my attendance"
✅ "Am I at risk of debarment?"
✅ "How many classes can I skip in IoT?"
✅ "Which course has the lowest attendance?"
✅ "Show courses with attendance below 75%"
```

### Marks & Assessments
```
✅ "Get my marks for all subjects"
✅ "What marks do I need in FAT to pass?"
✅ "Show CAT1 and CAT2 marks comparison"
✅ "Which assessment am I weakest in?"
```

### Assignments & Deadlines
```
✅ "Show my pending assignments"
✅ "What deadlines are urgent?"
✅ "Which assignments are overdue?"
✅ "Show assignments due this week"
```

### Schedules & Timetable
```
✅ "Show my exam schedule"
✅ "When is my FAT exam?"
✅ "Show Monday's timetable"
✅ "Show my weekly class schedule"
✅ "Show the academic calendar"
```

### Faculty & Administrative
```
✅ "Find faculty named Yokesh"
✅ "Show my proctor details"
✅ "Who is my faculty advisor?"
✅ "Show payment history"
✅ "View login history"
```

### Hostel & Leave
```
✅ "Show my leave history"
✅ "What's my current leave status?"
✅ "Show my hostel counselling rank"
```

### Multi-Intent Queries *(Smart Feature!)*
```
✅ "Show my complete semester report"
   → Fetches CGPA, attendance, marks, and assignments in parallel!
✅ "Show attendance and marks together"
✅ "Give me a complete academic overview"
```

## 🏗️ Project Architecture

```
vtop-chatbot/
├── backend/
│   ├── captcha/
│   │   ├── bitmaps.js              # CAPTCHA character patterns
│   │   └── captchaSolver.js        # ViBoOT CAPTCHA solver
│   ├── public/
│   │   └── index.html              # React frontend (single-page app)
│   ├── server.js                   # Express server & AI chat logic
│   ├── vtop-auth.js                # VTOP authentication & session management
│   ├── vtop-functions.js           # All VTOP data fetchers (15+ functions)
│   ├── papers.js                   # Previous year papers integration
│   ├── package.json
│   ├── .env
│   └── .gitignore
└── README.md
```

## 🔧 Technical Details

### Multi-Intent System
The chatbot can intelligently parse and execute multiple requests in a single query:

```javascript
User: "Show attendance and marks"
↓
Intent Recognition: ['getattendance', 'getmarks']
↓
Parallel Execution: Both functions run simultaneously
↓
Combined Response: Comprehensive formatted output
```

### Smart Caching Strategy
- **Duration**: 30 minutes per data type
- **Granularity**: Individual caching for each function
- **Benefits**: 
  - Instant responses for repeated queries
  - Reduced load on VTOP servers
  - Better user experience

### Session Management
Each user gets an isolated environment:
- Separate cookie jars
- Independent CSRF tokens
- Isolated data caching
- Automatic cleanup on logout

### CAPTCHA Solving
Uses the **ViBoOT** (VIT Boots On Our Toes) algorithm:
- Neural network + bitmap matching hybrid approach
- 95%+ accuracy rate
- Automatic retry with exponential backoff
- Fallback mechanisms for edge cases

### Attendance Calculator
Advanced attendance calculation:
- Handles both theory and lab classes differently
- Accounts for VIT's 74.01% = 75% policy
- Calculates exact classes needed/can skip
- Color-coded risk levels

### Marks Analysis
Intelligent passing status prediction:
- Theory courses: 60% total weightage system
- Lab courses: 50% passing requirement
- STS courses: Special handling
- FAT marks prediction for borderline cases

## 🛡️ Security & Privacy

### 🔒 **Privacy-First Design**
- ✅ **Zero credential storage** - Never saved to disk or database
- ✅ **Session-only authentication** - Credentials exist only during active session
- ✅ **Automatic cleanup** - All data cleared on logout
- ✅ **No logging** - Sensitive data never written to logs
- ✅ **Isolated sessions** - Each user's data completely separate

### 🔐 **Security Measures**
- CSRF token protection on all requests
- Cookie-based session management
- Input validation and sanitization
- Rate limiting (via caching)
- HTTPS-ready for production deployment

### ⚠️ **Important Notice**
Your VTOP credentials are:
- Used **ONLY** to authenticate with VTOP servers
- **NEVER** transmitted to any third-party service
- **NEVER** stored in any database or file
- Cleared immediately upon logout

The assistant uses the same security practices as the official VTOP website.

## 📊 API Endpoints

### `POST /api/login`
Authenticate with VTOP credentials or demo mode

**Request:**
```json
{
  "username": "21BCE1234",
  "password": "your_password",
  "useDemo": false,
  "sessionId": "session_token"
}
```

**Response:**
```json
{
  "success": true,
  "isDemo": false,
  "sessionId": "session_token",
  "message": "Login successful"
}
```

### `POST /api/chat`
Send a conversational message

**Request:**
```json
{
  "message": "Show my attendance and marks",
  "sessionId": "session_token"
}
```

**Response:**
```json
{
  "response": "Here's your attendance and marks...\n\n[Formatted markdown tables]",
  "data": {
    "attendance": [...],
    "marks": [...]
  }
}
```

### `POST /api/papers/search`
Search for previous year papers

**Request:**
```json
{
  "courseCode": "CSE3001",
  "courseName": "AWS",
  "paperType": "FAT"
}
```

**Response:**
```json
{
  "success": true,
  "results": [
    {
      "title": "AWS-FAT-2024",
      "courseCode": "CSE3001",
      "type": "FAT",
      "year": "2024",
      "url": "https://..."
    }
  ]
}
```

### `POST /api/logout`
End the current session

### `GET /api/session`
Check session status

## 🎨 Frontend Features

### Modern UI/UX
- **Clean Design** - Gradient-based aesthetic with smooth animations
- **Responsive Layout** - Works seamlessly on desktop, tablet, and mobile
- **Dynamic Suggestions** - Context-aware query chips that adapt to conversation
- **Markdown Rendering** - Rich formatting with tables, lists, and emphasis
- **Loading States** - Visual feedback during data fetching
- **Error Handling** - Graceful degradation with helpful error messages

### Three Access Modes
1. **Demo Mode** - Explore features with pre-configured credentials
2. **Personal Login** - Use your own VTOP credentials
3. **Papers Browser** - Access previous year papers without login

## 🔨 Development

### Running in Development
```bash
# Install nodemon for auto-restart
npm install -g nodemon

# Start with hot-reload
nodemon server.js
```

### Adding New VTOP Functions

1. **Create function in `vtop-functions.js`:**
```javascript
async function getNewFeature(authData, session, sessionId) {
  // Check cache
  if (isCacheValid(session, 'newFeature')) {
    return session.cache.newFeature.data;
  }

  // Fetch from VTOP
  const client = getClient(sessionId);
  const res = await client.post('https://vtop.vit.ac.in/...', ...);
  
  // Parse data
  const data = parseResponse(res.data);
  
  // Update cache
  session.cache.newFeature = { data, timestamp: Date.now() };
  
  return data;
}
```

2. **Add intent recognition in `server.js`:**
```javascript
// In recognizeIntent() prompt
- getNewFeature: New feature description

// In chat endpoint switch statement
case 'getnewfeature':
  allData.newFeature = await getNewFeature(authData, session, sessionId);
  break;
```

3. **Update response generation:**
```javascript
// In generateResponse() or generateResponseMulti()
case 'getnewfeature':
  prompt = `Format the new feature data: ${JSON.stringify(data)}`;
  break;
```

### Code Style Guidelines
- Use async/await for asynchronous operations
- Always implement error handling with try-catch
- Add logging for debugging (`console.log`, `console.error`)
- Cache frequently accessed data
- Use descriptive variable names
- Comment complex logic

## 🚀 Deployment

### Environment Setup
```bash
# Production environment variables
NODE_ENV=production
PORT=3000
GEMINI_API_KEY=your_key
GITHUB_TOKEN=your_token  # Optional but recommended
```

### Using PM2 (Recommended)
```bash
# Install PM2
npm install -g pm2

# Start application
pm2 start server.js --name vtop-chatbot

# Save configuration
pm2 save

# Setup auto-restart on system reboot
pm2 startup
```

### Deployment Platforms

#### **Heroku**
```bash
# Install Heroku CLI
npm install -g heroku

# Login and create app
heroku login
heroku create your-app-name

# Set environment variables
heroku config:set GEMINI_API_KEY=your_key
heroku config:set GITHUB_TOKEN=your_token

# Deploy
git push heroku main
```

#### **DigitalOcean / AWS EC2**
- Use PM2 for process management
- Configure Nginx as reverse proxy
- Setup SSL with Let's Encrypt
- Enable firewall (UFW)

#### **Railway / Render**
- Connect GitHub repository
- Set environment variables in dashboard
- Auto-deploys on git push

### Production Checklist
- [ ] Set `NODE_ENV=production`
- [ ] Use HTTPS (SSL certificate)
- [ ] Configure CORS for your domain
- [ ] Setup monitoring (PM2, New Relic, etc.)
- [ ] Enable rate limiting
- [ ] Setup backup/restore procedures
- [ ] Configure logging (Winston, Bunyan)
- [ ] Test error handling
- [ ] Setup health check endpoints

## 🐛 Troubleshooting

### Common Issues

**CAPTCHA solving fails repeatedly**
- Solution: The ViBoOT algorithm has built-in retry with 3 attempts
- If persistent, VTOP's CAPTCHA format may have changed
- Check console logs for CAPTCHA solver errors

**"Session expired" errors**
- Solution: Refresh the page to re-login
- Sessions are cleared on server restart in development

**Slow response times**
- First query: Cache is being built (expected)
- Subsequent queries: Should be instant due to caching
- Check VTOP server status if persistent

**GitHub API rate limit (Papers feature)**
- Without token: 60 requests/hour
- With token: 5000 requests/hour
- Add `GITHUB_TOKEN` to `.env` to increase limit

**Data not updating**
- Cache duration is 30 minutes
- Logout and login again to force refresh
- Or wait for cache expiration

## 📝 Known Limitations

### Technical Constraints
- **Cache Duration**: 30-minute cache may show stale data
- **VTOP Dependency**: Requires VTOP servers to be online
- **CAPTCHA Changes**: May break if VTOP updates CAPTCHA format
- **Session Persistence**: Sessions cleared on server restart (development)

### Feature Limitations
- **Real-time Updates**: Not true real-time, relies on cache
- **File Uploads**: Cannot upload documents (assignments, forms)
- **Fee Payment**: Read-only, cannot make payments
- **Registration**: Cannot register for courses

### VTOP-Specific
- **Semester ID**: Hardcoded to current semester (VL20252601)
- **Campus Variations**: Tested primarily on Vellore campus
- **Portal Changes**: May need updates if VTOP UI changes

## 🤝 Contributing

We welcome contributions! Here's how:

### Contribution Guidelines

1. **Fork** the repository
2. **Create** a feature branch
   ```bash
   git checkout -b feature/AmazingFeature
   ```
3. **Commit** your changes
   ```bash
   git commit -m 'Add some AmazingFeature'
   ```
4. **Push** to the branch
   ```bash
   git push origin feature/AmazingFeature
   ```
5. **Open** a Pull Request

### Development Setup
```bash
# Clone your fork
git clone https://github.com/YOUR_USERNAME/vtop-chatbot.git

# Add upstream remote
git remote add upstream https://github.com/ORIGINAL_OWNER/vtop-chatbot.git

# Create a branch
git checkout -b feature/your-feature

# Make changes and commit
git add .
git commit -m "Description of changes"

# Push and create PR
git push origin feature/your-feature
```

### Areas for Contribution
- 🐛 Bug fixes and error handling improvements
- ✨ New VTOP features integration
- 📝 Documentation improvements
- 🎨 UI/UX enhancements
- 🧪 Test coverage
- 🌐 Multi-language support
- ♿ Accessibility improvements

## 📜 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

```
MIT License

Copyright (c) 2025 VTOP Chatbot Contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software")...
```

## ⚠️ Disclaimer

**Important Legal Notice:**

This project is an **unofficial, educational tool** created by students, for students. It is:

- ❌ **NOT affiliated with** VIT (Vellore Institute of Technology)
- ❌ **NOT endorsed by** VIT or VTOP administrators
- ❌ **NOT an official** VIT product or service

### Terms of Use
- ✅ Use for personal academic assistance only
- ✅ Respect VIT's terms of service at all times
- ✅ Keep your credentials secure
- ❌ Do not abuse or overload VTOP servers
- ❌ Do not use for any malicious purposes
- ❌ Do not share your credentials with others

### Liability
- The developers assume **NO responsibility** for:
  - Account issues arising from use
  - Data accuracy or availability
  - Any violations of VIT policies
  - Damages or losses of any kind

### Responsible Use
- Check data accuracy with official VTOP
- Use during off-peak hours when possible
- Report bugs responsibly
- Respect rate limits and caching

**By using this software, you agree to use it responsibly and at your own risk.**

## 🙏 Acknowledgments

### Technology Stack
- **Google Gemini AI** - Natural language processing
- **Node.js & Express** - Backend server
- **React** - Frontend interface
- **Axios** - HTTP client
- **Cheerio** - HTML parsing
- **ViBoOT Algorithm** - CAPTCHA solving

### Open Source Projects
- [VIT PYQPs Repository](https://github.com/puneet-chandna/VIT-PYQPs-Paaji) - Previous year papers
- ViBoOT Browser Extension - Original CAPTCHA solving algorithm
- VTOP community - Testing and feedback

### Special Thanks
- VIT student community for testing and feedback
- Contributors who helped improve the codebase
- Everyone who reported bugs and suggested features

## 📧 Support & Contact

### Get Help
- 📖 **Documentation**: Read this README thoroughly
- 🐛 **Bug Reports**: [Open an issue](https://github.com/yourusername/vtop-chatbot/issues)
- 💡 **Feature Requests**: [Open an issue](https://github.com/yourusername/vtop-chatbot/issues)
- 💬 **Discussions**: [GitHub Discussions](https://github.com/yourusername/vtop-chatbot/discussions)

### Community
- ⭐ **Star** the repo if you find it helpful
- 🔀 **Fork** to customize for your needs
- 📢 **Share** with fellow VIT students

---

<div align="center">

### Made with ❤️ by VIT students, for VIT students

**If this project helped you, consider giving it a ⭐!**

[![GitHub stars](https://img.shields.io/github/stars/yourusername/vtop-chatbot?style=social)](https://github.com/yourusername/vtop-chatbot/stargazers)
[![GitHub forks](https://img.shields.io/github/forks/yourusername/vtop-chatbot?style=social)](https://github.com/yourusername/vtop-chatbot/network/members)
[![GitHub watchers](https://img.shields.io/github/watchers/yourusername/vtop-chatbot?style=social)](https://github.com/yourusername/vtop-chatbot/watchers)

</div>
