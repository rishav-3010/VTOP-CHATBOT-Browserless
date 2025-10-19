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

// Intent recognition - NOW RETURNS ARRAY OF INTENTS
async function recognizeIntent(message, session) {
  const { GoogleGenerativeAI } = require("@google/generative-ai");
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
  
  const recentHistory = session.conversationHistory.map(msg => ({
    role: msg.role,
    parts: [{ text: msg.content }]
  }));
  
  const prompt = `
  You are an advanced intent classifier for a VTOP assistant.
  Analyze the user's message and return ALL intents they're asking for.
  
  Available functions:
  - getCGPA: CGPA queries
  - getAttendance: Attendance percentage, classes attended
  - getMarks: Marks, grades, scores, CAT/FAT marks
  - getAssignments: Digital assignments, DA deadlines
  - getLoginHistory: Login history, session records
  - getExamSchedule: Exam schedule, dates, venue
  - general: Greetings, help, unclear requests
  
  IMPORTANT: 
  - If user asks for multiple things, return ALL relevant intents
  - Return as comma-separated list
  - Examples:
    * "Show my CGPA and attendance" → getCGPA,getAttendance
    * "How am I doing this semester?" → getCGPA,getAttendance,getMarks
    * "Check my marks and assignments" → getMarks,getAssignments
    * "What's my CGPA?" → getCGPA
    * "Give me a full overview" → getCGPA,getAttendance,getMarks,getAssignments
  
  User's message: "${message}"
  
  Respond with ONLY the function names, comma-separated. No explanations.
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
    
    const response = result.response.text().trim().toLowerCase();
    
    // Parse comma-separated intents
    const intents = response.split(',').map(i => i.trim()).filter(i => i);
    
    console.log(`[Multi-Intent] Detected: ${intents.join(', ')}`);
    
    return intents.length > 0 ? intents : ['general'];
  } catch (error) {
    console.error('Error in intent recognition:', error);
    return ['general'];
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

// NEW: Generate response with multiple data sources
async function generateResponseMulti(intents, allData, originalMessage, session) {
  const { GoogleGenerativeAI } = require("@google/generative-ai");
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
  
  const recentHistory = session.conversationHistory.map(msg => ({
    role: msg.role,
    parts: [{ text: msg.content }]
  }));
  
  // Build comprehensive data context
  let dataContext = '';
  
  if (allData.cgpa) {
    dataContext += `\nCGPA Data: ${JSON.stringify(allData.cgpa, null, 2)}`;
  }
  if (allData.attendance) {
    dataContext += `\nAttendance Data: ${JSON.stringify(allData.attendance, null, 2)}`;
  }
  if (allData.marks) {
    dataContext += `\nMarks Data: ${JSON.stringify(allData.marks, null, 2)}`;
  }
  if (allData.assignments) {
    dataContext += `\nAssignments Data: ${JSON.stringify(allData.assignments, null, 2)}`;
  }
  if (allData.loginHistory) {
    dataContext += `\nLogin History: ${JSON.stringify(allData.loginHistory, null, 2)}`;
  }
  if (allData.examSchedule) {
    dataContext += `\nExam Schedule: ${JSON.stringify(allData.examSchedule, null, 2)}`;
  }
  
  const prompt = `
    The user asked: "${originalMessage}"
    
    You have access to multiple data sources:
    ${dataContext}
    
    FORMATTING RULES:
    
    For CGPA: Show the value clearly with encouragement
    
    For Attendance: Format like:
    📚 [Course Code] - [Course Name]
      ✅ Attendance: [attended]/[total] classes
      📊 Percentage: [xx%]
      🚫 Debar Status: [status]
    (leave a line between each course)
    
    For Marks: Format like:
    📚 [1] [Course Code] - [Course Title]
       📝 [Assessment]: [scored]/[max] | Weight: [weightage]/[percent]
    (leave a line between each course)
    
    For Assignments: Format like:
    📋 DIGITAL ASSIGNMENTS
    ============================================================
    📚 [1] [Course Code] - [Course Title]
       📝 [1] [Assignment Title] - Due: [Date]
    
    IMPORTANT:
    - Present ALL the data the user requested
    - Organize it clearly with headers for each section
    - Keep it concise but comprehensive
    - Add a brief summary at the start if multiple data types
    - Use emojis and proper spacing for readability
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

    // Get MULTIPLE intents (array)
    const intents = await recognizeIntent(message, session);
    console.log(`[${sessionId}] Recognized intents:`, intents.join(', '));

    let allData = {};
    let response = '';

    // Check if we need to fetch multiple data sources
    const needsMultipleData = intents.length > 1 && !intents.includes('general');

    if (needsMultipleData) {
      // PARALLEL EXECUTION of multiple functions
      const authData = await getAuthData(sessionId);
      
      const promises = intents.map(async (intent) => {
        try {
          switch (intent) {
            case 'getcgpa':
              allData.cgpa = await getCGPA(authData, session, sessionId);
              break;
            case 'getattendance':
              allData.attendance = await getAttendance(authData, session, sessionId);
              break;
            case 'getmarks':
              allData.marks = await getMarks(authData, session, sessionId);
              break;
            case 'getassignments':
              allData.assignments = await getAssignments(authData, session, sessionId);
              break;
            case 'getloginhistory':
              allData.loginHistory = await getLoginHistory(authData, session, sessionId);
              break;
            case 'getexamschedule':
              allData.examSchedule = await getExamSchedule(authData, session, sessionId);
              break;
          }
        } catch (error) {
          console.error(`[${sessionId}] Error fetching ${intent}:`, error.message);
        }
      });

      // Wait for all data to be fetched in parallel
      await Promise.all(promises);
      
      // Generate comprehensive response with all data
      response = await generateResponseMulti(intents, allData, message, session);
      
    } else {
      // Single intent - use existing logic
      const intent = intents[0];
      
      switch (intent) {
        case 'getcgpa':
          try {
            const authData = await getAuthData(sessionId);
            allData.cgpa = await getCGPA(authData, session, sessionId);
            response = await generateResponse(intent, allData.cgpa, message, session);
          } catch (error) {
            response = "Sorry, I couldn't fetch your CGPA right now. Please try again.";
          }
          break;

        case 'getattendance':
          try {
            const authData = await getAuthData(sessionId);
            allData.attendance = await getAttendance(authData, session, sessionId);
            response = await generateResponse(intent, allData.attendance, message, session);
          } catch (error) {
            response = "Sorry, I couldn't fetch your attendance data right now. Please try again.";
          }
          break;

        case 'getassignments':
          try {
            const authData = await getAuthData(sessionId);
            allData.assignments = await getAssignments(authData, session, sessionId);
            response = await generateResponse(intent, allData.assignments, message, session);
          } catch (error) {
            response = "Sorry, I couldn't fetch your assignment data right now. Please try again.";
          }
          break;

        case 'getmarks':
          try {
            const authData = await getAuthData(sessionId);
            allData.marks = await getMarks(authData, session, sessionId);
            response = await generateResponse(intent, allData.marks, message, session);
          } catch (error) {
            response = "Sorry, I couldn't fetch your marks right now. Please try again.";
          }
          break;

        case 'getloginhistory':
          try {
            const authData = await getAuthData(sessionId);
            allData.loginHistory = await getLoginHistory(authData, session, sessionId);
            response = await generateResponse(intent, allData.loginHistory, message, session);
          } catch (error) {
            response = "Sorry, I couldn't fetch your login history right now. Please try again.";
          }
          break;

        case 'getexamschedule':
          try {
            const authData = await getAuthData(sessionId);
            allData.examSchedule = await getExamSchedule(authData, session, sessionId);
            response = await generateResponse(intent, allData.examSchedule, message, session);
          } catch (error) {
            response = "Sorry, I couldn't fetch your exam schedule right now. Please try again.";
          }
          break;

        default:
          response = await generateResponse(intent, null, message, session);
          break;
      }
    }

    session.conversationHistory.push({ role: 'model', content: response });
    if (session.conversationHistory.length > MAX_HISTORY) {
      session.conversationHistory.shift();
    }

    res.json({ response, data: allData });

  } catch (error) {
    console.error(`[${sessionId}] Chat error:`, error);
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