const { getClient, getAuthData } = require('./vtop-auth');
const cheerio = require('cheerio');

const CACHE_DURATION = 30 * 60 * 1000; // 30 minutes

function isCacheValid(session, key) {
  if (!session?.cache?.[key]) return false;
  return session.cache[key].data && (Date.now() - session.cache[key].timestamp) < CACHE_DURATION;
}

async function getCGPA(authData, session, sessionId) {
  try {
    if (isCacheValid(session, 'cgpa')) {
      console.log(`[${sessionId}] Cache hit: cgpa`);
      return session.cache.cgpa.data;
    }

    console.log(`[${sessionId}] Fetching CGPA...`);
    const client = getClient(sessionId);
    
    const res = await client.post(
      'https://vtop.vit.ac.in/vtop/get/dashboard/current/cgpa/credits',
      new URLSearchParams({
        authorizedID: authData.authorizedID,
        _csrf: authData.csrfToken,
        x: new Date().toUTCString()
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Referer': 'https://vtop.vit.ac.in/vtop/content',
          'X-Requested-With': 'XMLHttpRequest'
        }
      }
    );
    
    const $ = cheerio.load(res.data);
    const cgpaData = {};
    
    $('li.list-group-item').each((i, el) => {
      const label = $(el).find('span.card-title').text().trim();
      const value = $(el).find('span.fontcolor3 span').text().trim();
      if (label && value) {
        cgpaData[label] = value;
      }
    });
    
    if (session) {
      session.cache.cgpa = { data: cgpaData, timestamp: Date.now() };
      console.log(`[${sessionId}] Cache set: cgpa`);
    }
    
    console.log(`[${sessionId}] CGPA fetched for ${authData.authorizedID}`);
    return cgpaData;
  } catch (error) {
    console.error(`[${sessionId}] CGPA fetch error:`, error.message);
    throw error;
  }
}

async function getAttendance(authData, session, sessionId, semesterId = 'VL20252601') {
  try {
    if (isCacheValid(session, 'attendance')) {
      console.log(`[${sessionId}] Cache hit: attendance`);
      return session.cache.attendance.data;
    }

    console.log(`[${sessionId}] Fetching Attendance...`);
    const client = getClient(sessionId);
    
    const res = await client.post(
      'https://vtop.vit.ac.in/vtop/processViewStudentAttendance',
      new URLSearchParams({
        _csrf: authData.csrfToken,
        semesterSubId: semesterId,
        authorizedID: authData.authorizedID,
        x: new Date().toUTCString()
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Referer': 'https://vtop.vit.ac.in/vtop/content',
          'X-Requested-With': 'XMLHttpRequest'
        }
      }
    );
    
    const $ = cheerio.load(res.data);
    const attendanceData = [];
    
    $('#AttendanceDetailDataTable tbody tr').each((i, row) => {
      const cells = $(row).find('td');
      if (cells.length > 7) {
        const courseDetail = $(cells[2]).text().trim();
const attendedClasses = parseFloat($(cells[5]).text().trim());
const totalClasses = parseFloat($(cells[6]).text().trim());
const attendancePercentage = $(cells[7]).find('span span').text().trim() || $(cells[7]).text().trim();
const debarStatus = $(cells[8]).text().trim();

// Calculate classes needed/can skip for 75% attendance
let classesNeeded = 0;
let canSkip = 0;
let alertStatus = 'safe'; // 'safe', 'caution', 'danger'
let alertMessage = '';

const currentPercentage = attendedClasses / totalClasses;
const isLab = courseDetail.toLowerCase().includes('lab');

if (currentPercentage < 0.7401) {
  // Below 75% - calculate classes needed to reach 74.01%
  classesNeeded = Math.ceil((0.7401 * totalClasses - attendedClasses) / 0.2599);
  
  if (isLab) {
    classesNeeded = Math.ceil(classesNeeded / 2);
    alertMessage = `${classesNeeded} lab(s) should be attended`;
  } else {
    alertMessage = `${classesNeeded} class(es) should be attended`;
  }
  alertStatus = 'danger';
} else {
  // Above 75% - calculate classes that can be skipped
  canSkip = Math.floor((attendedClasses - 0.7401 * totalClasses) / 0.7401);
  
  if (isLab) {
    canSkip = Math.floor(canSkip / 2);
  }
  
  if (canSkip < 0) {
    canSkip = 0;
  }
  
  if (isLab) {
    alertMessage = `Only ${canSkip} lab(s) can be skipped`;
  } else {
    alertMessage = `Only ${canSkip} class(es) can be skipped`;
  }
  
  // Check if in caution zone (74.01% - 74.99%)
  if (currentPercentage >= 0.7401 && currentPercentage <= 0.7499) {
    alertStatus = 'caution';
  } else {
    alertStatus = 'safe';
  }
}

const attendance = {
  slNo: $(cells[0]).text().trim(),
  courseDetail: courseDetail,
  attendedClasses: attendedClasses.toString(),
  totalClasses: totalClasses.toString(),
  attendancePercentage: attendancePercentage,
  debarStatus: debarStatus,
  classesNeeded: classesNeeded,
  canSkip: canSkip,
  alertStatus: alertStatus,
  alertMessage: alertMessage,
  isLab: isLab
};
        if (attendance.slNo) {
          attendanceData.push(attendance);
        }
      }
    });
    
    if (session) {
      session.cache.attendance = { data: attendanceData, timestamp: Date.now() };
      console.log(`[${sessionId}] Cache set: attendance`);
    }
    
    console.log(`[${sessionId}] Attendance fetched for ${authData.authorizedID}`);
    return attendanceData;
  } catch (error) {
    console.error(`[${sessionId}] Attendance fetch error:`, error.message);
    throw error;
  }
}

async function getMarks(authData, session, sessionId, semesterId = 'VL20252601') {
  try {
    if (isCacheValid(session, 'marks')) {
      console.log(`[${sessionId}] Cache hit: marks`);
      return session.cache.marks.data;
    }

    console.log(`[${sessionId}] Fetching Marks...`);
    const client = getClient(sessionId);
    
    const res = await client.post(
      'https://vtop.vit.ac.in/vtop/examinations/doStudentMarkView',
      new URLSearchParams({
        _csrf: authData.csrfToken,
        semesterSubId: semesterId,
        authorizedID: authData.authorizedID,
        x: new Date().toUTCString()
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Referer': 'https://vtop.vit.ac.in/vtop/content',
          'X-Requested-With': 'XMLHttpRequest'
        }
      }
    );
    
    const $ = cheerio.load(res.data);
    const courses = [];
    const rows = $('tbody tr').toArray();
    
    for (let i = 0; i < rows.length; i++) {
      const row = $(rows[i]);
      if (!row.hasClass('tableContent') || row.find('.customTable-level1').length > 0) continue;
      
      const cells = row.find('td');
      const course = {
        slNo: $(cells[0]).text().trim(),
        courseCode: $(cells[2]).text().trim(),
        courseTitle: $(cells[3]).text().trim(),
        faculty: $(cells[6]).text().trim(),
        slot: $(cells[7]).text().trim(),
        marks: []
      };
      
      const nextRow = $(rows[i + 1]);
      const marksTable = nextRow.find('.customTable-level1 tbody');
      if (marksTable.length > 0) {
        marksTable.find('tr.tableContent-level1').each((j, markRow) => {
          const outputs = $(markRow).find('output');
          course.marks.push({
            title: $(outputs[1]).text().trim(),
            scored: $(outputs[5]).text().trim(),
            max: $(outputs[2]).text().trim(),
            weightage: $(outputs[6]).text().trim(),
            percent: $(outputs[3]).text().trim()
          });
        });
        i++;
      }
      courses.push(course);
    }
    
    if (session) {
      session.cache.marks = { data: courses, timestamp: Date.now() };
      console.log(`[${sessionId}] Cache set: marks`);
    }
    
    console.log(`[${sessionId}] Marks fetched for ${authData.authorizedID}`);
    return courses;
  } catch (error) {
    console.error(`[${sessionId}] Marks fetch error:`, error.message);
    throw error;
  }
}

async function getAssignments(authData, session, sessionId, semesterId = 'VL20252601') {
  try {
    if (isCacheValid(session, 'assignments')) {
      console.log(`[${sessionId}] Cache hit: assignments`);
      return session.cache.assignments.data;
    }

    console.log(`[${sessionId}] Fetching Assignments...`);
    const client = getClient(sessionId);
    
    const subRes = await client.post(
      'https://vtop.vit.ac.in/vtop/examinations/doDigitalAssignment',
      new URLSearchParams({
        authorizedID: authData.authorizedID,
        x: new Date().toUTCString(),
        semesterSubId: semesterId,
        _csrf: authData.csrfToken
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Referer': 'https://vtop.vit.ac.in/vtop/content',
          'X-Requested-With': 'XMLHttpRequest'
        }
      }
    );
    
    const $ = cheerio.load(subRes.data);
    const subjects = [];
    
    $('tbody tr.tableContent').each((i, row) => {
      const cells = $(row).find('td');
      const subject = {
        slNo: $(cells[0]).text().trim(),
        classNbr: $(cells[1]).text().trim(),
        courseCode: $(cells[2]).text().trim(),
        courseTitle: $(cells[3]).text().trim(),
        assignments: []
      };
      
      if (subject.slNo && subject.classNbr) {
        subjects.push(subject);
      }
    });
    
    for (const subject of subjects) {
      try {
        const aRes = await client.post(
          'https://vtop.vit.ac.in/vtop/examinations/processDigitalAssignment',
          new URLSearchParams({
            _csrf: authData.csrfToken,
            classId: subject.classNbr,
            authorizedID: authData.authorizedID,
            x: new Date().toUTCString()
          }),
          {
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              'Referer': 'https://vtop.vit.ac.in/vtop/content',
              'X-Requested-With': 'XMLHttpRequest'
            }
          }
        );
        
        const $a = cheerio.load(aRes.data);
        const tables = $a('table.customTable');
        
        if (tables.length > 1) {
          $a(tables[1]).find('tbody tr.tableContent').each((j, aRow) => {
            const aCells = $a(aRow).find('td');
            const dueDateStr = $a(aCells[4]).find('span').text().trim() || $a(aCells[4]).text().trim();

// Calculate days left
let daysLeft = null;
let status = '';
if (dueDateStr && dueDateStr !== '-') {
  try {
    // Parse date format: "DD-MMM-YYYY" (e.g., "22-Sep-2025")
    const dateMap = {
      Jan: '01', Feb: '02', Mar: '03', Apr: '04',
      May: '05', Jun: '06', Jul: '07', Aug: '08',
      Sep: '09', Sept: '09', Oct: '10', Nov: '11', Dec: '12'
    };
    
    const parts = dueDateStr.split('-');
    if (parts.length === 3) {
      const day = parts[0];
      const month = dateMap[parts[1]];
      const year = parts[2];
      
      const dueDate = new Date(`${year}-${month}-${day}`);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      dueDate.setHours(0, 0, 0, 0);
      
      const diffTime = dueDate - today;
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      daysLeft = diffDays;
      
      if (diffDays < 0) {
        status = `${Math.abs(diffDays)} days overdue`;
      } else if (diffDays === 0) {
        status = 'Due today!';
      } else {
        status = `${diffDays} days left`;
      }
    }
  } catch (error) {
    console.log(`[${sessionId}] Error parsing date: ${dueDateStr}`);
  }
}

const assignment = {
  slNo: $a(aCells[0]).text().trim(),
  title: $a(aCells[1]).text().trim(),
  dueDate: dueDateStr,
  daysLeft: daysLeft,
  status: status
};
            
            if (assignment.slNo && assignment.title && assignment.title !== 'Title') {
              subject.assignments.push(assignment);
            }
          });
        }
      } catch (error) {
        console.log(`[${sessionId}] Warning: Could not fetch assignments for ${subject.courseCode}`);
      }
    }
    
    const assignmentsData = { subjects };
    
    if (session) {
      session.cache.assignments = { data: assignmentsData, timestamp: Date.now() };
      console.log(`[${sessionId}] Cache set: assignments`);
    }
    
    console.log(`[${sessionId}] Assignments fetched for ${authData.authorizedID}`);
    return assignmentsData;
  } catch (error) {
    console.error(`[${sessionId}] Assignments fetch error:`, error.message);
    throw error;
  }
}

async function getLoginHistory(authData, session, sessionId) {
  try {
    if (isCacheValid(session, 'loginHistory')) {
      console.log(`[${sessionId}] Cache hit: loginHistory`);
      return session.cache.loginHistory.data;
    }

    console.log(`[${sessionId}] Fetching Login History...`);
    const client = getClient(sessionId);
    
    const res = await client.post(
      'https://vtop.vit.ac.in/vtop/show/login/history',
      new URLSearchParams({
        _csrf: authData.csrfToken,
        authorizedID: authData.authorizedID,
        x: new Date().toUTCString()
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Referer': 'https://vtop.vit.ac.in/vtop/content',
          'X-Requested-With': 'XMLHttpRequest'
        }
      }
    );
    
    const $ = cheerio.load(res.data);
    const loginHistory = [];
    
    $('tbody tr').each((i, row) => {
      const cells = $(row).find('td');
      if (cells.length > 0) {
        const entry = {
          date: $(cells[0]).text().trim(),
          time: $(cells[1]).text().trim(),
          ipAddress: $(cells[2]).text().trim(),
          status: $(cells[3]).text().trim()
        };
        if (entry.date) {
          loginHistory.push(entry);
        }
      }
    });
    
    if (session) {
      session.cache.loginHistory = { data: loginHistory, timestamp: Date.now() };
      console.log(`[${sessionId}] Cache set: loginHistory`);
    }
    
    console.log(`[${sessionId}] Login History fetched for ${authData.authorizedID}`);
    return loginHistory.slice(0, 10);
  } catch (error) {
    console.error(`[${sessionId}] Login History fetch error:`, error.message);
    throw error;
  }
}

async function getExamSchedule(authData, session, sessionId, semesterId = 'VL20252601') {
  try {
    if (isCacheValid(session, 'examSchedule')) {
      console.log(`[${sessionId}] Cache hit: examSchedule`);
      return session.cache.examSchedule.data;
    }

    console.log(`[${sessionId}] Fetching Exam Schedule...`);
    const client = getClient(sessionId);
    
    await client.post(
      'https://vtop.vit.ac.in/vtop/examinations/StudExamSchedule',
      new URLSearchParams({
        verifyMenu: 'true',
        authorizedID: authData.authorizedID,
        _csrf: authData.csrfToken,
        nocache: new Date().toUTCString()
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Referer': 'https://vtop.vit.ac.in/vtop/content',
          'X-Requested-With': 'XMLHttpRequest'
        }
      }
    );
    
    const res = await client.post(
      'https://vtop.vit.ac.in/vtop/examinations/doSearchExamScheduleForStudent',
      new URLSearchParams({
        authorizedID: authData.authorizedID,
        _csrf: authData.csrfToken,
        semesterSubId: semesterId
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Referer': 'https://vtop.vit.ac.in/vtop/examinations/StudExamSchedule',
          'X-Requested-With': 'XMLHttpRequest'
        }
      }
    );
    
    const $ = cheerio.load(res.data);
    const examSchedule = {
      FAT: [],
      CAT2: [],
      CAT1: []
    };
    
    let currentExamType = '';
    const rows = $('tbody tr.tableContent');
    
    rows.each((i, row) => {
      const cells = $(row).find('td');
      
      if (cells.length === 1 && $(cells[0]).hasClass('panelHead-secondary')) {
        currentExamType = $(cells[0]).text().trim();
        return;
      }
      
      if (cells.length < 13 || !currentExamType) return;
      
      const examInfo = {
        slNo: $(cells[0]).text().trim(),
        courseCode: $(cells[1]).text().trim(),
        courseTitle: $(cells[2]).text().trim(),
        courseType: $(cells[3]).text().trim(),
        classId: $(cells[4]).text().trim(),
        slot: $(cells[5]).text().trim(),
        examDate: $(cells[6]).text().trim(),
        examSession: $(cells[7]).text().trim(),
        reportingTime: $(cells[8]).text().trim(),
        examTime: $(cells[9]).text().trim(),
        venue: $(cells[10]).find('span').text().trim() || $(cells[10]).text().trim() || '-',
        seatLocation: $(cells[11]).find('span').text().trim() || $(cells[11]).text().trim() || '-',
        seatNo: $(cells[12]).find('span').text().trim() || $(cells[12]).text().trim() || '-'
      };
      
      if (examInfo.slNo && examInfo.courseCode) {
        if (currentExamType === 'FAT') {
          examSchedule.FAT.push(examInfo);
        } else if (currentExamType === 'CAT2') {
          examSchedule.CAT2.push(examInfo);
        } else if (currentExamType === 'CAT1') {
          examSchedule.CAT1.push(examInfo);
        }
      }
    });
    
    if (session) {
      session.cache.examSchedule = { data: examSchedule, timestamp: Date.now() };
      console.log(`[${sessionId}] Cache set: examSchedule`);
    }
    
    console.log(`[${sessionId}] Exam Schedule fetched for ${authData.authorizedID}`);
    return examSchedule;
  } catch (error) {
    console.error(`[${sessionId}] Exam Schedule fetch error:`, error.message);
    throw error;
  }
}

async function getTimetable(authData, session, sessionId, semesterId = 'VL20252601') {
  try {
    if (isCacheValid(session, 'timetable')) {
      console.log(`[${sessionId}] Cache hit: timetable`);
      return session.cache.timetable.data;
    }

    console.log(`[${sessionId}] Fetching Timetable...`);
    const client = getClient(sessionId);
    
    const res = await client.post(
      'https://vtop.vit.ac.in/vtop/processViewTimeTable',
      new URLSearchParams({
        _csrf: authData.csrfToken,
        semesterSubId: semesterId,
        authorizedID: authData.authorizedID,
        x: new Date().toUTCString()
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Referer': 'https://vtop.vit.ac.in/vtop/content',
          'X-Requested-With': 'XMLHttpRequest'
        }
      }
    );
    
    const $ = cheerio.load(res.data);
    const timetableData = {
      courses: [],
      schedule: {}
    };
    
    // Parse course details from table
    const table = $('tbody').first();
    const rows = table.find('tr');
    
    rows.each((i, row) => {
      const cells = $(row).find('td');
      
      // Skip rows with wrong number of columns or footer rows
      if (cells.length < 9) return;
      
      // Check if this is a total credits row
      const firstCellText = $(cells[0]).text().trim();
      if (firstCellText.includes('Total Number Of Credits')) return;
      
      // Skip header rows
      if ($(row).find('th').length > 0) return;
      
      const slNo = $(cells[0]).text().trim();
      
      // Only process rows with valid serial numbers
      if (!slNo || isNaN(parseInt(slNo))) return;
      
      // Column 2: Course code and title (index 2)
      const courseCodeTitle = $(cells[2]).find('p').first().text().trim();
      
      // Column 7: Slot and venue (index 7)
      const slotVenueCell = $(cells[7]);
      // Get all p tags and extract text
      const slotVenueParts = slotVenueCell.find('p').map((i, el) => $(el).text().trim()).get();
      const slotVenue = slotVenueParts.join(' ').replace(/\s+/g, ' ').trim();
      
      // Column 8: Faculty name and school (index 8)
      const facNameSchoolCell = $(cells[8]);
      const facNameSchoolParts = facNameSchoolCell.find('p').map((i, el) => $(el).text().trim()).get();
      const facNameSchool = facNameSchoolParts.join(' ').replace(/\s+/g, ' ').trim();
      
      if (!courseCodeTitle || courseCodeTitle === '') return;
      
      // Parse course code and title
      const codeTitle = courseCodeTitle.split('-');
      const courseCode = codeTitle[0] ? codeTitle[0].trim() : '';
      const courseTitle = codeTitle.slice(1).join('-').trim(); // Handle cases with multiple dashes
      
      // Parse slot and venue
      // Format: "G1+TG1 - SJT408" or "B1 - SJT607"
      let slot = '';
      let venue = '';
      
      if (slotVenue.includes('-')) {
        const parts = slotVenue.split('-');
        slot = parts[0].trim();
        venue = parts[1].trim();
      }
      
      // Parse faculty name and school
      let facName = '';
      let facSchool = '';
      
      if (facNameSchool.includes('-')) {
        const parts = facNameSchool.split('-');
        facName = parts[0].trim();
        facSchool = parts[1].trim();
      }
      
      console.log(`[${sessionId}] Parsed: ${courseCode} | Slot: ${slot} | Venue: ${venue}`);
      
      if (courseCode && slot && slot !== 'NIL' && venue !== 'NIL') {
        timetableData.courses.push({
          courseCode,
          courseTitle,
          slot,
          venue,
          facName,
          facSchool
        });
      }
    });
    
    // Slot timings mapping - EXACTLY from the extension
    const slotTimes = {
      // Theory slots - Morning
      'A1': [{ day: 'Monday', time: '08:00 - 09:00 AM' }, { day: 'Wednesday', time: '09:00 - 10:00 AM' }],
      'B1': [{ day: 'Tuesday', time: '08:00 - 09:00 AM' }, { day: 'Thursday', time: '09:00 - 10:00 AM' }],
      'C1': [{ day: 'Wednesday', time: '08:00 - 09:00 AM' }, { day: 'Friday', time: '09:00 - 10:00 AM' }],
      'D1': [{ day: 'Thursday', time: '08:00 - 10:00 AM' }, { day: 'Monday', time: '10:00 - 11:00 AM' }],
      'E1': [{ day: 'Friday', time: '08:00 - 10:00 AM' }, { day: 'Tuesday', time: '10:00 - 11:00 AM' }],
      'F1': [{ day: 'Monday', time: '09:00 - 10:00 AM' }, { day: 'Wednesday', time: '10:00 - 11:00 AM' }],
      'G1': [{ day: 'Tuesday', time: '09:00 - 10:00 AM' }, { day: 'Thursday', time: '10:00 - 11:00 AM' }],
      
      // Theory slots - Afternoon  
      'A2': [{ day: 'Monday', time: '02:00 - 03:00 PM' }, { day: 'Wednesday', time: '03:00 - 04:00 PM' }],
      'B2': [{ day: 'Tuesday', time: '02:00 - 03:00 PM' }, { day: 'Thursday', time: '03:00 - 04:00 PM' }],
      'C2': [{ day: 'Wednesday', time: '02:00 - 03:00 PM' }, { day: 'Friday', time: '03:00 - 04:00 PM' }],
      'D2': [{ day: 'Thursday', time: '02:00 - 04:00 PM' }, { day: 'Monday', time: '04:00 - 05:00 PM' }],
      'E2': [{ day: 'Friday', time: '02:00 - 04:00 PM' }, { day: 'Tuesday', time: '04:00 - 05:00 PM' }],
      'F2': [{ day: 'Monday', time: '03:00 - 04:00 PM' }, { day: 'Wednesday', time: '04:00 - 05:00 PM' }],
      'G2': [{ day: 'Tuesday', time: '03:00 - 04:00 PM' }, { day: 'Thursday', time: '04:00 - 05:00 PM' }],
      
      // Theory addon slots
      'TA1': [{ day: 'Friday', time: '10:00 - 11:00 AM' }],
      'TB1': [{ day: 'Monday', time: '11:00 - 12:00 PM' }],
      'TC1': [{ day: 'Tuesday', time: '11:00 - 12:00 PM' }],
      'TD1': [{ day: 'Friday', time: '12:00 - 01:00 PM' }],
      'TE1': [{ day: 'Thursday', time: '11:00 - 12:00 PM' }],
      'TF1': [{ day: 'Friday', time: '11:00 - 12:00 PM' }],
      'TG1': [{ day: 'Monday', time: '12:00 - 01:00 PM' }],
      'TAA1': [{ day: 'Tuesday', time: '12:00 - 01:00 PM' }],
      'TCC1': [{ day: 'Thursday', time: '12:00 - 01:00 PM' }],
      
      'TA2': [{ day: 'Friday', time: '04:00 - 05:00 PM' }],
      'TB2': [{ day: 'Monday', time: '05:00 - 06:00 PM' }],
      'TC2': [{ day: 'Tuesday', time: '05:00 - 06:00 PM' }],
      'TD2': [{ day: 'Wednesday', time: '05:00 - 06:00 PM' }],
      'TE2': [{ day: 'Thursday', time: '05:00 - 06:00 PM' }],
      'TF2': [{ day: 'Friday', time: '05:00 - 06:00 PM' }],
      'TG2': [{ day: 'Monday', time: '06:00 - 07:00 PM' }],
      'TAA2': [{ day: 'Tuesday', time: '06:00 - 07:00 PM' }],
      'TBB2': [{ day: 'Wednesday', time: '06:00 - 07:00 PM' }],
      'TCC2': [{ day: 'Thursday', time: '06:00 - 07:00 PM' }],
      'TDD2': [{ day: 'Friday', time: '06:00 - 07:00 PM' }],
      
      // Lab slots - Morning (only odd numbered labs are used)
      'L1': [{ day: 'Monday', time: '08:00 - 09:50 AM' }],
      'L3': [{ day: 'Monday', time: '09:51 - 11:40 AM' }],
      'L5': [{ day: 'Monday', time: '11:40 AM - 01:30 PM' }],
      'L7': [{ day: 'Tuesday', time: '08:00 - 09:50 AM' }],
      'L9': [{ day: 'Tuesday', time: '09:51 - 11:40 AM' }],
      'L11': [{ day: 'Tuesday', time: '11:40 AM - 01:30 PM' }],
      'L13': [{ day: 'Wednesday', time: '08:00 - 09:50 AM' }],
      'L15': [{ day: 'Wednesday', time: '09:51 - 11:40 AM' }],
      'L17': [{ day: 'Wednesday', time: '11:40 AM - 01:30 PM' }],
      'L19': [{ day: 'Thursday', time: '08:00 - 09:50 AM' }],
      'L21': [{ day: 'Thursday', time: '09:51 - 11:40 AM' }],
      'L23': [{ day: 'Thursday', time: '11:40 AM - 01:30 PM' }],
      'L25': [{ day: 'Friday', time: '08:00 - 09:50 AM' }],
      'L27': [{ day: 'Friday', time: '09:51 - 11:40 AM' }],
      'L29': [{ day: 'Friday', time: '11:40 AM - 01:30 PM' }],
      
      // Lab slots - Afternoon (only odd numbered labs are used)
      'L31': [{ day: 'Monday', time: '02:00 - 03:50 PM' }],
      'L33': [{ day: 'Monday', time: '03:51 - 05:40 PM' }],
      'L35': [{ day: 'Monday', time: '05:40 - 07:30 PM' }],
      'L37': [{ day: 'Tuesday', time: '02:00 - 03:50 PM' }],
      'L39': [{ day: 'Tuesday', time: '03:51 - 05:40 PM' }],
      'L41': [{ day: 'Tuesday', time: '05:40 - 07:30 PM' }],
      'L43': [{ day: 'Wednesday', time: '02:00 - 03:50 PM' }],
      'L45': [{ day: 'Wednesday', time: '03:51 - 05:40 PM' }],
      'L47': [{ day: 'Wednesday', time: '05:40 - 07:30 PM' }],
      'L49': [{ day: 'Thursday', time: '02:00 - 03:50 PM' }],
      'L51': [{ day: 'Thursday', time: '03:51 - 05:40 PM' }],
      'L53': [{ day: 'Thursday', time: '05:40 - 07:30 PM' }],
      'L55': [{ day: 'Friday', time: '02:00 - 03:50 PM' }],
      'L57': [{ day: 'Friday', time: '03:51 - 05:40 PM' }],
      'L59': [{ day: 'Friday', time: '05:40 - 07:30 PM' }],
      
      // Lab slots - Even numbers (L2, L4, etc. are paired with odd ones)
      'L2': [{ day: 'Monday', time: '08:00 - 09:50 AM' }],
      'L4': [{ day: 'Monday', time: '09:51 - 11:40 AM' }],
      'L6': [{ day: 'Monday', time: '11:40 AM - 01:30 PM' }],
      'L8': [{ day: 'Tuesday', time: '08:00 - 09:50 AM' }],
      'L10': [{ day: 'Tuesday', time: '09:51 - 11:40 AM' }],
      'L12': [{ day: 'Tuesday', time: '11:40 AM - 01:30 PM' }],
      'L14': [{ day: 'Wednesday', time: '08:00 - 09:50 AM' }],
      'L16': [{ day: 'Wednesday', time: '09:51 - 11:40 AM' }],
      'L18': [{ day: 'Wednesday', time: '11:40 AM - 01:30 PM' }],
      'L20': [{ day: 'Thursday', time: '08:00 - 09:50 AM' }],
      'L22': [{ day: 'Thursday', time: '09:51 - 11:40 AM' }],
      'L24': [{ day: 'Thursday', time: '11:40 AM - 01:30 PM' }],
      'L26': [{ day: 'Friday', time: '08:00 - 09:50 AM' }],
      'L28': [{ day: 'Friday', time: '09:51 - 11:40 AM' }],
      'L30': [{ day: 'Friday', time: '11:40 AM - 01:30 PM' }],
      'L32': [{ day: 'Monday', time: '02:00 - 03:50 PM' }],
      'L34': [{ day: 'Monday', time: '03:51 - 05:40 PM' }],
      'L36': [{ day: 'Monday', time: '05:40 - 07:30 PM' }],
      'L38': [{ day: 'Tuesday', time: '02:00 - 03:50 PM' }],
      'L40': [{ day: 'Tuesday', time: '03:51 - 05:40 PM' }],
      'L42': [{ day: 'Tuesday', time: '05:40 - 07:30 PM' }],
      'L44': [{ day: 'Wednesday', time: '02:00 - 03:50 PM' }],
      'L46': [{ day: 'Wednesday', time: '03:51 - 05:40 PM' }],
      'L48': [{ day: 'Wednesday', time: '05:40 - 07:30 PM' }],
      'L50': [{ day: 'Thursday', time: '02:00 - 03:50 PM' }],
      'L52': [{ day: 'Thursday', time: '03:51 - 05:40 PM' }],
      'L54': [{ day: 'Thursday', time: '05:40 - 07:30 PM' }],
      'L56': [{ day: 'Friday', time: '02:00 - 03:50 PM' }],
      'L58': [{ day: 'Friday', time: '03:51 - 05:40 PM' }],
      'L60': [{ day: 'Friday', time: '05:40 - 07:30 PM' }]
    };
    
    // Build schedule organized by day
    timetableData.schedule = {
      Monday: [],
      Tuesday: [],
      Wednesday: [],
      Thursday: [],
      Friday: []
    };
    
    timetableData.courses.forEach(course => {
      const slots = course.slot.split('+');
      
      slots.forEach(slot => {
        const slotInfo = slotTimes[slot];
        if (slotInfo) {
          slotInfo.forEach(timeSlot => {
            timetableData.schedule[timeSlot.day].push({
              courseCode: course.courseCode,
              courseTitle: course.courseTitle,
              slot: slot,
              time: timeSlot.time,
              venue: course.venue,
              faculty: course.facName
            });
          });
        } else {
          console.log(`[${sessionId}] Warning: Unknown slot "${slot}" for course ${course.courseCode}`);
        }
      });
    });
    
    // Sort each day's classes by time
    Object.keys(timetableData.schedule).forEach(day => {
      timetableData.schedule[day].sort((a, b) => {
        const timeA = a.time.split(' - ')[0];
        const timeB = b.time.split(' - ')[0];
        return timeA.localeCompare(timeB);
      });
    });
    
    if (session) {
      session.cache.timetable = { data: timetableData, timestamp: Date.now() };
      console.log(`[${sessionId}] Cache set: timetable`);
    }
    
    console.log(`[${sessionId}] Timetable fetched for ${authData.authorizedID}`);
    console.log(`[${sessionId}] Total courses parsed: ${timetableData.courses.length}`);
    return timetableData;
  } catch (error) {
    console.error(`[${sessionId}] Timetable fetch error:`, error.message);
    throw error;
  }
}

module.exports = {
  getCGPA,
  getAttendance,
  getMarks,
  getAssignments,
  getLoginHistory,
  getExamSchedule,
  getTimetable
};
