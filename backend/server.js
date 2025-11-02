require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { loginToVTOP, getAuthData } = require('./vtop-auth');
const { getCGPA, getAttendance, getAssignments, getMarks, getLoginHistory, getExamSchedule,getTimetable } = require('./vtop-functions');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const demoUsername = process.env.VTOP_USERNAME;
const demoPassword = process.env.VTOP_PASSWORD;

const sessions = {}; // Store sessions separately
const MAX_HISTORY = 5; // Keep last 10 messages for context

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
      examSchedule: { data: null, timestamp: 0 },
      timetable: { data: null, timestamp: 0 }  
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
  - getCGPA: CGPA queries, semester reports, overall performance
  - getAttendance: Attendance percentage, classes attended, debarment risk
  - getMarks: Marks, grades, scores, CAT/FAT marks, best/worst subjects
  - getAssignments: Digital assignments, DA deadlines, urgent tasks
  - getLoginHistory: Login history, session records
  - getExamSchedule: Exam schedule, dates, venue
  - getTimetable: Timetable, schedule, class timings, weekly schedule
  - general: Greetings, help, unclear requests
  
  IMPORTANT: 
  - If user asks for multiple things, return ALL relevant intents
  - "Semester report" or "complete overview" = getCGPA,getAttendance,getMarks,getAssignments
  - "Which subject has lowest/highest X" = getMarks or getAttendance (based on context)
  - Subject-specific queries still return the main intent (marks/attendance)
  - Return as comma-separated list
  
  Examples:
    * "Show semester report" → getCGPA,getAttendance,getMarks,getAssignments
    * "Which subject am I worst at?" → getMarks
    * "Show attendance and marks" → getAttendance,getMarks
    * "Am I at risk of debarment?" → getAttendance
    * "Which deadline is urgent?" → getAssignments
    * "Show marks for IoT Boards" → getMarks
  
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
    
    **IMPORTANT NOTE**: This calculator calculates attendance to 74.01% (which VIT considers as 75%).
    
    Create a markdown table with these columns:
    | Course | Attended/Total | Percentage | 75% Alert | Status |
    
    For the "75% Alert" column, use the 'alertMessage' field from the data.
    For the "Status" column, use emojis based on 'alertStatus':
    - 'danger' (below 75%): 🔴 (red circle)
    - 'caution' (74.01%-74.99%): ⚠️ (warning)
    - 'safe' (above 75%): ✅ (green check)
    
    After the table, add an Analysis section with:
    - **Overall Summary**: How many courses are safe, in caution zone, or in danger
    - **⚠️ Courses Needing Attention** (below 75%): List them with how many classes needed
    - **🔴 Critical Risk**: Any courses with debar status or very low attendance
    - **✅ Safe Courses**: Mention courses above 75% and how many can be skipped
    
    Add a footer note:
    > **Note**: Color coding:
    > - ✅ Green: Attendance > 75%
    > - ⚠️ Orange: Attendance 74.01% - 74.99% (Be cautious)
    > - 🔴 Red: Attendance < 75%
    
    Use markdown formatting (bold, emphasis) for important points.
  `;
  break;
      
    case 'getassignments':
  prompt = `
    The user asked: "${originalMessage}"
    Here's their assignments data: ${JSON.stringify(data, null, 2)}
    
    Format assignments as SEPARATE tables for each course:
    
    For each course, create:
    ### Course Name (Course Code)
    | Assignment | Due Date | Status |
    |------------|----------|--------|
    | Assessment - 1 | 22-Sep-2025 | 5 days left |
    | Assessment - 2 | 31-Oct-2025 | Overdue |
    
    Use the 'status' field from the data (already calculated).
    - Shows "X days overdue" if past due
    - Shows "Due today!" if due today
    - Shows "X days left" if upcoming
    
    Then add a Summary section with:
    - Total assignments across all courses
    - ⚠️ Overdue assignments (if any)
    - 🔥 Urgent deadlines (within 3-7 days)
    - Course with most assignments
    
    Use emojis and markdown formatting for emphasis on urgent items.
  `;
  break;

    case 'getmarks':
  prompt = `
    The user asked: "${originalMessage}"
    Here's their marks data: ${JSON.stringify(data, null, 2)}
    
    Format marks as SEPARATE tables for each subject/course:
    
    For each course, create:
    ### Course Name (Course Code)
    | Assessment | Scored | Maximum | Weightage | Weightage% |
    |------------|--------|---------|-----------| -----------|
    | CAT-1      | X      | Y       | Z         | Z%         |
    | Assignment | X      | Y       | Z         | Z%         |
    
    After each course table, add a line showing:
    **Course Total: X/Y (Z%)**
    
    Then add an overall Analysis section with:(if user asked for single subject then keep this below instructions for only for single not all)
    - Overall performance summary across all subjects()
    - Best performing courses (70%+)
    - Courses needing attention (below 60%)
    - Recommendations
    
    IMP:If user is asking "Which subject has my lowest/highest marks? or any other particular thing to a single subject then show only for that subject not all" then show only that particular subject not all.
    Use markdown formatting (bold headers, emphasis for important insights).
  `;
  break;

    case 'getloginhistory':
      prompt = `
        The user asked: "${originalMessage}"
        Here's their login history data: ${JSON.stringify(data, null, 2)}
        
        Format as a markdown table with columns:
        | Date | Time | IP Address | Status |
        
        Fill in the login history data.
        
        Then add a summary with:
        - Total logins
        - Most recent login
        - Any suspicious activity (if applicable)
        
        Use markdown formatting for clarity.
      `;
      break;

    case 'getexamschedule':
      prompt = `
        The user asked: "${originalMessage}"
        Here's their exam schedule data: ${JSON.stringify(data, null, 2)}
        
        Create separate markdown tables for each exam type (FAT, CAT1, CAT2) with columns:
        | Course Code | Course Title | Date | Time | Venue | Seat No |
        
        Then add a summary section with:
        - Exam dates timeline
        - Reporting times
        - Important reminders
        
        Use markdown formatting (bold headers, emphasis for important dates).
        If user asked for any particular schedule like for FAT then show only for Fat not cat2 or cat1.
      `;
      break;

      case 'gettimetable':
  prompt = `
    The user asked: "${originalMessage}"
    Here's their timetable data: ${JSON.stringify(data, null, 2)}
    
    Format the timetable in a clean, day-wise view:(Also if user is asking for a particular day then show only for that day not all)
    
    ## 📅 Weekly Schedule
    
    For each day (Monday to Friday), create:
    ### Monday
    | Time | Course | Venue | Slot |
    |------|--------|-------|---------|
    | 08:00 - 09:00 AM | CSE1001 - Problem Solving | AB1-G03 | A1 |
    | ... | ... | ... | ... |
    
    After all days, add a Course Summary section with:
    - Total classes per week
    - Any observations (like back-to-back classes, long gaps, etc.)
    
    Use emojis to make it visually appealing:
    - 🕐 for time-related info
    - 📚 for courses
    - 👨‍🏫 for faculty
    - 🏢 for venues
    
    Use markdown formatting for clarity.
    Also if there is lab sessions include them appropriately like slot L35+L36 is one column not separately
  `;
  break;
    default:
  // If this is the first message (conversation just started), send context
  if (session.conversationHistory.length <= 2) {
    prompt = `
      You are a VTOP chatbot assistant for VIT students.
      
      You can help with:
      - View CGPA and semester reports
      - Check marks and identify best/worst performing subjects
      - Monitor attendance and debarment risk
      - Track assignment deadlines
      - View exam schedules
      
      This is the user's message: "${originalMessage}"
      
      Answer warmly and guide them on what you can help with.
    `;
  } else {
    // For subsequent messages, answer with context
    prompt = `
      The user asked: "${originalMessage}"
      
      Based on our conversation, answer their question naturally.
      If they're asking comparative questions like "which subject is worst" or "what needs attention",
      acknowledge that you can fetch that data for them and ask if they'd like you to show it.
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
// Generate response with multiple data sources
async function generateResponseMulti(intents, allData, originalMessage, session) {
  const { GoogleGenerativeAI } = require("@google/generative-ai");
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
  
  const recentHistory = session.conversationHistory.map(msg => ({
    role: msg.role,
    parts: [{ text: msg.content }]
  }));
  
  // Build comprehensive data context and prompts based on intents
  let dataContext = '';
  let promptSections = [];
  
  // CGPA
  if (allData.cgpa && intents.includes('getcgpa')) {
    dataContext += `\nCGPA Data: ${JSON.stringify(allData.cgpa, null, 2)}`;
    promptSections.push(`For CGPA: Generate a friendly, encouraging response about their CGPA. Keep it conversational and positive. Include the CGPA value and maybe a motivational comment.`);
  }
  
  // Attendance
  if (allData.attendance && intents.includes('getattendance')) {
  dataContext += `\nAttendance Data: ${JSON.stringify(allData.attendance, null, 2)}`;
  promptSections.push(`For Attendance: Create a table with columns: Course | Attended/Total | Percentage | 75% Alert | Status. Use 'alertMessage' for alerts and 'alertStatus' for status emojis (🔴 danger, ⚠️ caution, ✅ safe). Add analysis of courses needing attention with specific class counts needed.`);
}
  
  // Assignments
if (allData.assignments && intents.includes('getassignments')) {
  dataContext += `\nAssignments Data: ${JSON.stringify(allData.assignments, null, 2)}`;
  promptSections.push(`For Assignments: Create SEPARATE tables for each course. Format: ### Course Name (Code), then table with columns: | Assignment | Due Date | Days Left |. Calculate days from today (Oct 21, 2025). Show "X days overdue" if past, "Due today!" if today, "X days left" if upcoming. Then summary with overdue and urgent deadlines (3-7 days).`);
}
  
  // Marks
if (allData.marks && intents.includes('getmarks')) {
  dataContext += `\nMarks Data: ${JSON.stringify(allData.marks, null, 2)}`;
  promptSections.push(`For Marks: Create SEPARATE tables for each subject. Format: ### Course Name (Code), then table with columns: | Assessment | Scored | Maximum | Weightage | Weightage% |. Add course total after each table. Then overall analysis with best/worst performing courses and recommendations.`);
}
  
  // Login History
  if (allData.loginHistory && intents.includes('getloginhistory')) {
    dataContext += `\nLogin History: ${JSON.stringify(allData.loginHistory, null, 2)}`;
    promptSections.push(`For Login History: Format as a markdown table with columns: | Date | Time | IP Address | Status |. Fill in the login history data. Then add a summary with: Total logins, Most recent login, Any suspicious activity (if applicable). Use markdown formatting for clarity.`);
  }
  
  // Exam Schedule
  if (allData.examSchedule && intents.includes('getexamschedule')) {
    dataContext += `\nExam Schedule: ${JSON.stringify(allData.examSchedule, null, 2)}`;
    promptSections.push(`For Exam Schedule: Create separate markdown tables for each exam type (FAT, CAT1, CAT2) with columns: | Course Code | Course Title | Date | Time | Venue | Seat No |. Then add a summary section with: Exam dates timeline, Reporting times, Important reminders. Use markdown formatting (bold headers, emphasis for important dates).`);
  }

  // Timetable
if (allData.timetable && intents.includes('gettimetable')) {
  dataContext += `\nTimetable Data: ${JSON.stringify(allData.timetable, null, 2)}`;
  promptSections.push(`For Timetable: Create day-wise tables (Monday-Friday) with columns: Time | Course | Venue | Faculty. Add a course summary with total classes per week and observations.`);
}
  
  // Build the final prompt
  let prompt = `The user asked: "${originalMessage}"

You have access to multiple data sources:
${dataContext}

FORMATTING INSTRUCTIONS:
${promptSections.join('\n')}

IMPORTANT:
- Present ALL the data the user requested
- Organize it clearly with headers for each section
- Keep it concise but comprehensive
- Add a brief summary at the start if multiple data types
- Use proper formatting for readability`;

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
          examSchedule: { data: null, timestamp: 0 },
          timetable: { data: null, timestamp: 0 }  
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
            case 'gettimetable':
  allData.timetable = await getTimetable(authData, session, sessionId);
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

        case 'gettimetable':
  try {
    const authData = await getAuthData(sessionId);
    allData.timetable = await getTimetable(authData, session, sessionId);
    response = await generateResponse(intent, allData.timetable, message, session);
  } catch (error) {
    response = "Sorry, I couldn't fetch your timetable right now. Please try again.";
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