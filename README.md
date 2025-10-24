# 🎓 VTOP Chatbot Assistant

An intelligent chatbot interface for VIT students to interact with VTOP (VIT's academic portal) using natural language. Built with Node.js, Express, React, and Google's Gemini AI.

![VTOP Chatbot](https://img.shields.io/badge/VIT-VTOP%20Assistant-blue)
![Node.js](https://img.shields.io/badge/Node.js-v18+-green)
![License](https://img.shields.io/badge/license-MIT-blue)

## ✨ Features

- 🤖 **AI-Powered Chat Interface** - Natural language queries using Gemini 2.5 Flash
- 📊 **Real-time VTOP Data** - Fetches live academic information
- 🔐 **Secure Authentication** - Session-based auth with CAPTCHA solving
- 💬 **Multi-Intent Recognition** - Handle multiple queries simultaneously
- ⚡ **Smart Caching** - 30-minute cache for faster responses
- 🎯 **Context-Aware** - Dynamic suggestions based on conversation
- 🔒 **Privacy First** - No credential storage, session-only data

### What You Can Ask

- **CGPA & Grades**: "What's my CGPA?", "Show semester report"
- **Attendance**: "Show my attendance", "Am I at risk of debarment?"
- **Marks**: "Get my marks", "Which subject am I worst at?"
- **Assignments**: "Show assignments", "What deadlines are urgent?"
- **Exam Schedule**: "Show exam schedule", "When is my FAT?"
- **Login History**: "Show my login history"

## 🚀 Quick Start

### Prerequisites

- Node.js (v18 or higher)
- npm or yarn
- A Google Gemini API key
- VIT VTOP credentials (for demo mode)

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

3. **Set up environment variables**

Create a `.env` file in the `backend` directory:

```env
# Server Configuration
PORT=3000

# Google Gemini API
GEMINI_API_KEY=your_gemini_api_key_here

# Demo Credentials (optional - for demo mode)
VTOP_USERNAME=your_vtop_username
VTOP_PASSWORD=your_vtop_password
```

4. **Start the server**
```bash
npm start
```

5. **Open your browser**
```
http://localhost:3000
```

## 🏗️ Project Structure

```
vtop-chatbot/
├── backend/
│   ├── captcha/
│   │   ├── bitmaps.js          # CAPTCHA character bitmaps
│   │   └── captchaSolver.js    # ViBoOT CAPTCHA solver
│   ├── public/
│   │   └── index.html          # React frontend
│   ├── server.js               # Express server & chat logic
│   ├── vtop-auth.js            # VTOP authentication
│   ├── vtop-functions.js       # VTOP data fetchers
│   ├── package.json
│   └── .env
└── README.md
```

## 🔧 Configuration

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `PORT` | Server port (default: 3000) | No |
| `GEMINI_API_KEY` | Google Gemini API key | Yes |
| `VTOP_USERNAME` | Demo mode VTOP username | No |
| `VTOP_PASSWORD` | Demo mode VTOP password | No |

### Getting a Gemini API Key

1. Visit [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Sign in with your Google account
3. Create a new API key
4. Copy and paste it into your `.env` file

## 💡 How It Works

### Architecture

```
User Query → Intent Recognition (Gemini) → Data Fetching (VTOP) → Response Generation (Gemini) → Formatted Response
```

### Multi-Intent System

The chatbot can handle multiple intents in a single query:

```javascript
// Example: "Show attendance and marks"
Intents: ['getattendance', 'getmarks']
→ Fetches both data types in parallel
→ Generates comprehensive response
```

### Session Management

Each user gets an isolated browser session with:
- Separate cookie jars
- Independent CSRF tokens
- Isolated data caching
- Automatic cleanup on logout

### CAPTCHA Solving

Uses the **ViBoOT** algorithm (neural network + bitmap matching) to automatically solve VTOP's CAPTCHA challenges with high accuracy.

## 🛡️ Security & Privacy

- ✅ No credentials stored in database
- ✅ Session-only authentication
- ✅ Automatic session cleanup
- ✅ HTTPS-ready for production
- ✅ CSRF token protection
- ✅ No logging of sensitive data

**Important**: Your VTOP credentials are used only during the active session and are never saved, logged, or transmitted anywhere except directly to VTOP's servers.

## 📊 API Endpoints

### POST `/api/login`
Authenticate with VTOP credentials

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
  "sessionId": "session_token"
}
```

### POST `/api/chat`
Send a chat message

**Request:**
```json
{
  "message": "What's my CGPA?",
  "sessionId": "session_token"
}
```

**Response:**
```json
{
  "response": "Your current CGPA is 8.5! Keep up the great work! 🎉",
  "data": { "cgpa": { "CGPA": "8.50", "Credits": "120" } }
}
```

### POST `/api/logout`
End the session

## 🎨 Frontend Features

- **Modern UI** - Clean, gradient-based design with smooth animations
- **Responsive** - Works on desktop, tablet, and mobile
- **Dynamic Suggestions** - Context-aware query suggestions
- **Markdown Support** - Rich formatting in responses
- **Loading States** - Visual feedback during data fetching
- **Demo Mode** - Try without personal credentials

## 🔨 Development

### Running in Development Mode

```bash
# Install nodemon for auto-restart
npm install -g nodemon

# Start with nodemon
nodemon server.js
```

### Adding New Features

1. **Add new VTOP function** in `vtop-functions.js`:
```javascript
async function getNewFeature(authData, session, sessionId) {
  // Implement VTOP data fetching
}
```

2. **Add intent recognition** in `server.js`:
```javascript
case 'getnewfeature':
  // Handle the new intent
```

3. **Update prompt** in `generateResponse()` for AI formatting

## 🚀 Deployment

### Deploying to Production

1. **Set environment variables** on your hosting platform
2. **Update CORS settings** if needed in `server.js`
3. **Use HTTPS** for secure communication
4. **Set up process manager** (PM2 recommended):

```bash
npm install -g pm2
pm2 start server.js --name vtop-chatbot
pm2 save
pm2 startup
```

### Recommended Platforms

- Heroku
- DigitalOcean
- AWS EC2
- Vercel (with serverless functions)
- Railway

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## ⚠️ Disclaimer

This project is an unofficial tool created for educational purposes. It is not affiliated with, endorsed by, or connected to VIT (Vellore Institute of Technology) or their VTOP system. 

- Use at your own risk
- Respect VIT's terms of service
- Do not abuse the system
- Keep your credentials secure

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the project
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 🐛 Known Issues

- CAPTCHA solving may fail occasionally (retry mechanism included)
- Some VTOP endpoints may be slow during peak hours
- Session timeout after extended inactivity

## 📧 Support

If you have questions or issues:
- Open an issue on GitHub
- Check existing issues for solutions
- Review the documentation

## 🙏 Acknowledgments

- Google Gemini AI for natural language processing
- ViBoOT CAPTCHA solving algorithm
- VIT community for testing and feedback

---

Made with ❤️ for VIT students

**Star ⭐ this repo if you find it helpful!**
