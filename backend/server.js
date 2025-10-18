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

let isLoggedIn = false;
let currentCredentials = {
  username: null,
  password: null,
  isDemo: false
};

const demoUsername = process.env.VTOP_USERNAME;
const demoPassword = process.env.VTOP_PASSWORD;

// Intent recognition using AI
async function recognizeIntent(message) {
  const { GoogleGenerativeAI } = require("@google/generative-ai");
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
  
  const prompt = `
  You are an advanced intent classifier for a VTOP (VIT University portal) assistant.
  Analyze the user's message and determine their primary intent.
  
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
  - Casual conversation, greetings, help → general
  
  User message: "${message}"
  
  Examples:
  - "What's my current CGPA?" → getCGPA
  - "How's my attendance looking?" → getAttendance  
  - "Show me my CAT 1 marks" → getMarks
  - "Any pending DA submissions?" → getAssignments
  - "Show my login history" → getLoginHistory
  - "When's my exam schedule?" → getExamSchedule
  - "Hello, how are you?" → general
  
  Respond with ONLY the function name. No explanations or additional text.
`;

  try {
    const result = await model.generateContent(prompt);
    const intent = result.response.text().trim().toLowerCase();
    return intent;
  } catch (error) {
    console.error('Error in intent recognition:', error);
    return 'general';
  }
}

// Response generation using AI
async function generateResponse(intent, data, originalMessage) {
  const { GoogleGenerativeAI } = require("@google/generative-ai");
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
  
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
           📝 CAT-1:  25/50  | Weight: 7.5/15
           📝 Quiz-1: 10/10  | Weight: 10/10 
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
      prompt = `
        So u r a vtop chatbot.
        right now u help functionalities to get help with
        view cgpa, view marks, check da deadlines, check attendance, view login history

        this is user's msg  "${originalMessage}"

        answer it accordingly
      `;
  }

  try {
    const result = await model.generateContent(prompt);
    return result.response.text().trim();
  } catch (error) {
    console.error('Error generating response:', error);
    return "I'm having trouble generating a response right now. Please try again.";
  }
}

// ===== LOGIN ENDPOINT =====
app.post('/api/login', async (req, res) => {
  try {
    const { username, password, useDemo } = req.body;
    
    let loginUsername, loginPassword;
    
    if (useDemo) {
      loginUsername = demoUsername;
      loginPassword = demoPassword;
      currentCredentials = {
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
      currentCredentials = {
        username: loginUsername,
        password: loginPassword,
        isDemo: false
      };
    }

    const success = await loginToVTOP(loginUsername, loginPassword);
    
    if (success) {
      isLoggedIn = true;
      res.json({ 
        success: true, 
        isDemo: currentCredentials.isDemo,
        message: 'Login successful'
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
    const { message } = req.body;

    if (!isLoggedIn) {
      return res.json({ 
        response: "I'm not connected to VTOP right now. Please refresh the page to reconnect.",
        data: null 
      });
    }

    // Recognize intent
    const intent = await recognizeIntent(message);
    console.log('Recognized intent:', intent);

    let data = null;
    let response = '';

    // Execute appropriate function based on intent
    switch (intent) {
      case 'getcgpa':
        try {
          const authData = await getAuthData();
          data = await getCGPA(authData);
          response = await generateResponse(intent, data, message);
        } catch (error) {
          response = "Sorry, I couldn't fetch your CGPA right now. Please try again.";
        }
        break;

      case 'getattendance':
        try {
          const authData = await getAuthData();
          data = await getAttendance(authData);
          response = await generateResponse(intent, data, message);
        } catch (error) {
          response = "Sorry, I couldn't fetch your attendance data right now. Please try again.";
        }
        break;

        case 'getassignments':
        try {
          const authData = await getAuthData();
          data = await getAssignments(authData);
          response = await generateResponse(intent, data, message);
        } catch (error) {
          response = "Sorry, I couldn't fetch your assignment data right now. Please try again.";
        }
        break;

      case 'getmarks':
      try {
        const authData = await getAuthData();
        data = await getMarks(authData);
        response = await generateResponse(intent, data, message);
      } catch (error) {
        response = "Sorry, I couldn't fetch your marks right now. Please try again.";
      }
      break;

    case 'getloginhistory':
      try {
        const authData = await getAuthData();
        data = await getLoginHistory(authData);
        response = await generateResponse(intent, data, message);
      } catch (error) {
        response = "Sorry, I couldn't fetch your login history right now. Please try again.";
      }
      break;

    case 'getexamschedule':
      try {
        const authData = await getAuthData();
        data = await getExamSchedule(authData);
        response = await generateResponse(intent, data, message);
      } catch (error) {
        response = "Sorry, I couldn't fetch your exam schedule right now. Please try again.";
      }
      break;

       default:
        response = await generateResponse(intent, null, message);
        break;
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
  res.json({
    isLoggedIn,
    isDemo: currentCredentials.isDemo,
    hasCredentials: !!currentCredentials.username
  });
});

// ===== LOGOUT ENDPOINT =====
app.post('/api/logout', async (req, res) => {
  try {
    isLoggedIn = false;
    currentCredentials = {
      username: null,
      password: null,
      isDemo: false
    };
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Serve React app
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Only start server in development, not on Vercel
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`🚀 VTOP Server running on port ${PORT}`);
    console.log(`📱 Frontend: http://localhost:${PORT}`);
  });
}

// Export for Vercel
module.exports = app;
