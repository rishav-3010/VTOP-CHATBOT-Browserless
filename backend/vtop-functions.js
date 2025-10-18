const { client, getAuthData, getCached, setCached } = require('./vtop-auth');
const cheerio = require('cheerio');

async function getCGPA(authData) {
  try {
    const cached = getCached('cgpa');
    if (cached) return cached;

    console.log('Fetching CGPA...');
    
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
    
    setCached('cgpa', cgpaData);
    
    console.log('CGPA fetched');
    return cgpaData;
  } catch (error) {
    console.error('CGPA fetch error:', error.message);
    throw error;
  }
}

async function getAttendance(authData, semesterId = 'VL20252601') {
  try {
    const cached = getCached('attendance');
    if (cached) return cached;

    console.log('Fetching Attendance...');
    
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
    
    setCached('attendance', attendanceData);
    
    console.log('Attendance fetched');
    return attendanceData;
  } catch (error) {
    console.error('Attendance fetch error:', error.message);
    throw error;
  }
}

async function getMarks(authData, semesterId = 'VL20252601') {
  try {
    const cached = getCached('marks');
    if (cached) return cached;

    console.log('Fetching Marks...');
    
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
    
    setCached('marks', courses);
    
    console.log('Marks fetched');
    return courses;
  } catch (error) {
    console.error('Marks fetch error:', error.message);
    throw error;
  }
}

async function getAssignments(authData, semesterId = 'VL20252601') {
  try {
    const cached = getCached('assignments');
    if (cached) return cached;

    console.log('Fetching Assignments...');
    
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
        console.log(`Warning: Could not fetch assignments for ${subject.courseCode}`);
      }
    }
    
    setCached('assignments', { subjects });
    
    console.log('Assignments fetched');
    return { subjects };
  } catch (error) {
    console.error('Assignments fetch error:', error.message);
    throw error;
  }
}

async function getLoginHistory(authData) {
  try {
    const cached = getCached('loginHistory');
    if (cached) return cached;

    console.log('Fetching Login History...');
    
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
    
    setCached('loginHistory', loginHistory);
    
    console.log('Login History fetched');
    return loginHistory;
  } catch (error) {
    console.error('Login History fetch error:', error.message);
    throw error;
  }
}

async function getExamSchedule(authData, semesterId = 'VL20252601') {
  try {
    const cached = getCached('examSchedule');
    if (cached) return cached;

    console.log('Fetching Exam Schedule...');
    
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
    
    setCached('examSchedule', examSchedule);
    
    console.log('Exam Schedule fetched');
    return examSchedule;
  } catch (error) {
    console.error('Exam Schedule fetch error:', error.message);
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