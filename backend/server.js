require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { loginToVTOP, getAuthData } = require('./vtop-auth');
const { getCGPA, getAttendance, getAssignments, getMarks, getLoginHistory, getExamSchedule } = require('./vtop-functions');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const demoUsername = process.env.VTOP_USERNAME;
const demoPassword = process.env.VTOP_PASSWORD;

const sessions = {}; // Store sessions separately
const MAX_HISTORY = 10; // Keep last 10 messages for context

function createSession() {
  const sessionId = require('crypto').randomBytes(16).toString('hex');
  sessions[sessionId] = {
    isLoggedIn: false,
    conversationHistory: [],
    currentCredentials: {},
    cache: {
      cgpa: { data: null, timestamp: 0 },
      attendance: { data: null, timestamp: 0 },
      marks: { data: null, timestamp: 0 },
      assignments: { data: null, timestamp: 0 },
      loginHistory: { data: null, timestamp: 0 },
      examSchedule: { data: null, timestamp: 0 }
    }
  };
  return sessionId;
}

function getSession(sessionId) {
  return sessions[sessionId] || null;
}

// Intent recognition using AI
async function recognizeIntent(message, session) {
  const { GoogleGenerativeAI } = require("@google/generative-ai");
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
  
  // Get recent conversation history for context
  const recentHistory = session.conversationHistory.map(msg => ({
    role: msg.role,
    parts: [{ text: msg.content }]
  }));
  
  const prompt = `
  You are an advanced intent classifier for a VTOP (VIT University portal) assistant.
  Analyze the user's CURRENT message and determine their primary intent.
  
  Use the conversation history for context, but focus on what the user is asking NOW.
  
  Available functions:
  - getCGPA: CGPA queries, GPA questions, overall academic performance
  - getAttendance: Attendance percentage, classes attended, debar status, attendance records
  - getMarks: Marks, grades, scores, test results, exam performance, CAT marks, FAT marks
  - getAssignments: Digital assignments, DA deadlines, assignment uploads, submission dates
  - getLoginHistory: Login history, session history, login records, access logs
  - getExamSchedule: Exam schedule, exam dates, exam timing, venue, seat number
  - general: Greetings, help requests, general conversation, unclear requests
  
  Intent Detection Rules:
  - Look for keywords: CGPA, GPA, grade point → getCGPA
  - Look for keywords: attendance, classes, present, absent, debar → getAttendance  
  - Look for keywords: marks, grades, scores, CAT, FAT, exam, test → getMarks
  - Look for keywords: assignment, DA, deadline, upload, submission → getAssignments
  - Look for keywords: login history, session, access log, login records → getLoginHistory
  - Look for keywords: exam schedule, exam date, exam time, venue, seat → getExamSchedule
  - If user says "yes" after bot suggested checking CGPA/marks/etc, infer that intent
  - Casual conversation, greetings, help → general
  
  User's current message: "${message}"
  
  Examples:
  - "What's my current CGPA?" → getCGPA
  - "How's my attendance looking?" → getAttendance  
  - "Show me my CAT 1 marks" → getMarks
  - "Any pending DA submissions?" → getAssignments
  - "Show my login history" → getLoginHistory
  - "When's my exam schedule?" → getExamSchedule
  - User: "How about CGPA?" Bot: "Sure!" User: "yes" → getCGPA (infer from context)
  - "Hello, how are you?" → general
  
  Respond with ONLY the function name. No explanations or additional text.
`;

  try {
    const result = await model.generateContent({
      contents: [
        ...recentHistory,
        {
          role: 'user',
          parts: [{ text: prompt }]
        }
      ]
    });
    const intent = result.response.text().trim().toLowerCase();
    return intent;
  } catch (error) {
    console.error('Error in intent recognition:', error);
    return 'general';
  }
}

// Response generation using AI
async function generateResponse(intent, data, originalMessage, session) {
  const { GoogleGenerativeAI } = require("@google/generative-ai");
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
  
  const recentHistory = session.conversationHistory.map(msg => ({
    role: msg.role,
    parts: [{ text: msg.content }]
  }));
  
  let prompt = '';
  
  switch (intent) {
    case 'getcgpa':
      prompt = `
        The user asked: "${originalMessage}"
        Their CGPA data is: ${JSON.stringify(data, null, 2)}
        
        Generate a friendly, encouraging response about their CGPA. Keep it conversational and positive.
        Include the CGPA value and maybe a motivational comment.
      `;
      break;
      
    case 'getattendance':
      prompt = `
        The user asked: "${originalMessage}"
        Here's their attendance data: ${JSON.stringify(data, null, 2)}
        
        Format the output like this style:

    📚 [Course Code] - [Course Name]
      ✅ Attendance: [attended]/[total] classes
      📊 Percentage: [xx%]
      🚫 Debar Status: [status]

      Only output in this structured multi-line format, no extra explanation.
      `;
      break;
      
    case 'getassignments':
      prompt = `
        The user asked: "${originalMessage}"
        Here's their assignments data: ${JSON.stringify(data, null, 2)}
        
        Format the output EXACTLY like this structure:
        
        📋 DIGITAL ASSIGNMENTS
        ============================================================
        📚 [1] BCSE310L - IoT Architectures and Protocols
           📝 [1] Course Project - Due: 25-Sep-2025
        
        📚 [2] BCSE312L - Programming for IoT Boards
           📝 [1] Course Based Design Project - Due: 07-Nov-2025
        
        Use the exact field names from JSON and follow this format precisely.
      `;
      break;

    case 'getmarks':
      prompt = `
        The user asked: "${originalMessage}"
        Here's their marks data: ${JSON.stringify(data, null, 2)}
        
        Format the output like this:
        
        📚 [1] BCSE310L - IoT Architectures and Protocols
           📝 CAT-1:  25/50  | Weightage: 7.5/15
           📝 Quiz-1: 10/10  | Weightage: 10/10 
        (leave a line)
        📚 [2] BCSE312L - Programming for IoT Boards
           📝 Assessment-1: 10/20   | Weight: 5/10
        
        FIELD MAPPING:
        - Use course.slNo for numbering [1], [2], etc.
        - Use course.courseCode - course.courseTitle for subject line
        - Use course.marks[].title for assessment name
        - Format: course.marks[].scored/course.marks[].max  | Weight: course.marks[].weightage/course.marks[].percent
        
        Keep it concise - no extra text.
      `;
      break;

    case 'getloginhistory':
      prompt = `
        The user asked: "${originalMessage}"
        Here's their login history data: ${JSON.stringify(data, null, 2)}
        
        Format the output like this:
        
        🕐 LOGIN HISTORY
        ============================================================
        
        [Display the login history in a clean, tabular format]
        
        Keep it simple and organized.
      `;
      break;

    case 'getexamschedule':
      prompt = `
        The user asked: "${originalMessage}"
        Here's their exam schedule data: ${JSON.stringify(data, null, 2)}
        
        Format the output like this:
        
        📅 EXAM SCHEDULE
        ============================================================
        
        🎯 FAT EXAMS:
        [1] BCSE310L - IoT Architectures
            📅 Date: 15-Nov-2025 | Session: FN
            ⏰ Time: 09:00 AM - 12:00 PM | Reporting: 08:30 AM
            🏢 Venue: Lab Block A | Seat: A-25
        
        🎯 CAT1 EXAMS:
        [Similar format]
        
        Keep it organized by exam type.(leave a line after every subject and exam)
      `;
      break;

    default:
      // If this is the first message (conversation just started), send context
      if (session.conversationHistory.length <= 2) {
        prompt = `
          So u r a vtop chatbot.
          right now u help functionalities to get help with
          view cgpa, view marks, check da deadlines, check attendance, view login history

          this is user's msg: "${originalMessage}"

          answer it accordingly
        `;
      } else {
        // For subsequent messages, just answer naturally with conversation context
        prompt = `
          The user asked: "${originalMessage}"
          
          Answer their question naturally, keeping the conversation going.
        `;
      }
      break;
  }

  try {
    const result = await model.generateContent({
      contents: [
        ...recentHistory,
        {
          role: 'user',
          parts: [{ text: prompt }]
        }
      ]
    });
    return result.response.text().trim();
  } catch (error) {
    console.error('Error generating response:', error);
    return "I'm having trouble generating a response right now. Please try again.";
  }
}

// ===== LOGIN ENDPOINT =====
app.post('/api/login', async (req, res) => {
  try {
    const { username, password, useDemo, sessionId } = req.body;
    
    let session = getSession(sessionId);
    if (!session) {
      sessions[sessionId] = {
        isLoggedIn: false,
        conversationHistory: [],
        currentCredentials: {},
        cache: {
          cgpa: { data: null, timestamp: 0 },
          attendance: { data: null, timestamp: 0 },
          marks: { data: null, timestamp: 0 },
          assignments: { data: null, timestamp: 0 },
          loginHistory: { data: null, timestamp: 0 },
          examSchedule: { data: null, timestamp: 0 }
        }
      };
      session = sessions[sessionId];
    }
    
    let loginUsername, loginPassword;
    
    if (useDemo) {
      loginUsername = demoUsername;
      loginPassword = demoPassword;
      session.currentCredentials = {
        username: loginUsername,
        password: loginPassword,
        isDemo: true
      };
    } else {
      if (!username || !password) {
        return res.status(400).json({ 
          success: false, 
          error: 'Username and password required' 
        });
      }
      loginUsername = username;
      loginPassword = password;
      session.currentCredentials = {
        username: loginUsername,
        password: loginPassword,
        isDemo: false
      };
    }

    // Pass sessionId to loginToVTOP
    const success = await loginToVTOP(loginUsername, loginPassword, sessionId);
    
    if (success) {
      session.isLoggedIn = true;
      res.json({ 
        success: true, 
        isDemo: session.currentCredentials.isDemo,
        message: 'Login successful',
        sessionId: sessionId
      });
    } else {
      res.json({ 
        success: false, 
        message: 'Login failed'
      });
    }
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});
// ===== CHAT ENDPOINT =====
app.post('/api/chat', async (req, res) => {
  try {
    const { message, sessionId } = req.body;
    const session = getSession(sessionId);

    if (!session || !session.isLoggedIn) {
      return res.json({ 
        response: "I'm not connected to VTOP right now. Please refresh the page to reconnect.",
        data: null 
      });
    }

    session.conversationHistory.push({ role: 'user', content: message });
    if (session.conversationHistory.length > MAX_HISTORY) {
      session.conversationHistory.shift();
    }

    const intent = await recognizeIntent(message, session);
    console.log(`[${sessionId}] Recognized intent:`, intent);

    let data = null;
    let response = '';

    switch (intent) {
      case 'getcgpa':
        try {
          const authData = await getAuthData(sessionId);
          data = await getCGPA(authData, session, sessionId);
          response = await generateResponse(intent, data, message, session);
        } catch (error) {
          response = "Sorry, I couldn't fetch your CGPA right now. Please try again.";
        }
        break;

      case 'getattendance':
        try {
          const authData = await getAuthData(sessionId);
          data = await getAttendance(authData, session, sessionId);
          response = await generateResponse(intent, data, message, session);
        } catch (error) {
          response = "Sorry, I couldn't fetch your attendance data right now. Please try again.";
        }
        break;

      case 'getassignments':
        try {
          const authData = await getAuthData(sessionId);
          data = await getAssignments(authData, session, sessionId);
          response = await generateResponse(intent, data, message, session);
        } catch (error) {
          response = "Sorry, I couldn't fetch your assignment data right now. Please try again.";
        }
        break;

      case 'getmarks':
        try {
          const authData = await getAuthData(sessionId);
          data = await getMarks(authData, session, sessionId);
          response = await generateResponse(intent, data, message, session);
        } catch (error) {
          response = "Sorry, I couldn't fetch your marks right now. Please try again.";
        }
        break;

      case 'getloginhistory':
        try {
          const authData = await getAuthData(sessionId);
          data = await getLoginHistory(authData, session, sessionId);
          response = await generateResponse(intent, data, message, session);
        } catch (error) {
          response = "Sorry, I couldn't fetch your login history right now. Please try again.";
        }
        break;

      case 'getexamschedule':
        try {
          const authData = await getAuthData(sessionId);
          data = await getExamSchedule(authData, session, sessionId);
          response = await generateResponse(intent, data, message, session);
        } catch (error) {
          response = "Sorry, I couldn't fetch your exam schedule right now. Please try again.";
        }
        break;

      default:
        response = await generateResponse(intent, null, message, session);
        break;
    }

    session.conversationHistory.push({ role: 'model', content: response });
    if (session.conversationHistory.length > MAX_HISTORY) {
      session.conversationHistory.shift();
    }

    res.json({ response, data });

  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({ 
      response: "I encountered an error processing your request. Please try again.",
      data: null 
    });
  }
});
// ===== SESSION ENDPOINT =====
app.get('/api/session', (req, res) => {
  const sessionId = req.query.sessionId;
  const session = getSession(sessionId);
  
  if (!session) {
    return res.json({ isLoggedIn: false });
  }
  
  res.json({
    isLoggedIn: session.isLoggedIn,
    isDemo: session.currentCredentials.isDemo,
    hasCredentials: !!session.currentCredentials.username
  });
});

// ===== LOGOUT ENDPOINT =====
app.post('/api/logout', async (req, res) => {
  const { sessionId } = req.body;
  const session = getSession(sessionId);
  
  if (session) {
    // Clean up the isolated browser session
    const { destroySession } = require('./vtop-auth');
    destroySession(sessionId);
    delete sessions[sessionId];
  }
  
  res.json({ success: true });
});
// Serve React app
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🚀 VTOP Server running on port ${PORT}`);
  console.log(`📱 Frontend: http://localhost:${PORT}`);
});