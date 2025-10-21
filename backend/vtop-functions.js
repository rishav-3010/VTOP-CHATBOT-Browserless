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
        const attendance = {
          slNo: $(cells[0]).text().trim(),
          courseDetail: $(cells[2]).text().trim(),
          attendedClasses: $(cells[5]).text().trim(),
          totalClasses: $(cells[6]).text().trim(),
          attendancePercentage: $(cells[7]).find('span span').text().trim() || $(cells[7]).text().trim(),
          debarStatus: $(cells[8]).text().trim()
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
            const assignment = {
              slNo: $a(aCells[0]).text().trim(),
              title: $a(aCells[1]).text().trim(),
              dueDate: $a(aCells[4]).find('span').text().trim() || $a(aCells[4]).text().trim()
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

module.exports = {
  getCGPA,
  getAttendance,
  getMarks,
  getAssignments,
  getLoginHistory,
  getExamSchedule
};
