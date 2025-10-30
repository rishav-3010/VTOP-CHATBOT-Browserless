// vtop-login-with-retry.js
require('dotenv').config();
const axios = require('axios');
const { wrapper } = require('axios-cookiejar-support');
const { CookieJar } = require('tough-cookie');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const { solveUsingViboot } = require('./captcha/captchaSolver');
const readline = require('readline');

const username = process.env.VTOP_USERNAME;
const password = process.env.VTOP_PASSWORD;

const jar = new CookieJar();
const client = wrapper(axios.create({
  jar,
  withCredentials: true,
  maxRedirects: 5,
  validateStatus: () => true,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1'
  }
}));

let globalCsrf = null;
let globalAuthID = null;

const getCsrf = (html) => {
  const $ = cheerio.load(html);
  return $('meta[name="_csrf"]').attr('content') || $('input[name="_csrf"]').val();
};

const getAuthData = async () => {
  if (globalCsrf && globalAuthID) return { csrfToken: globalCsrf, authorizedID: globalAuthID };
  
  const res = await client.get('https://vtop.vit.ac.in/vtop/content');
  const $ = cheerio.load(res.data);
  globalCsrf = getCsrf(res.data);
  globalAuthID = res.data.match(/\b\d{2}[A-Z]{3}\d{4}\b/)?.[0];
  return { csrfToken: globalCsrf, authorizedID: globalAuthID };
};

async function login() {
  console.log('🚀 Starting login...\n');
  
  const MAX_CAPTCHA_ATTEMPTS = 3;
  
  for (let captchaAttempt = 1; captchaAttempt <= MAX_CAPTCHA_ATTEMPTS; captchaAttempt++) {
    try {
      console.log(`\n${'='.repeat(50)}`);
      console.log(`🔄 CAPTCHA ATTEMPT ${captchaAttempt}/${MAX_CAPTCHA_ATTEMPTS}`);
      console.log('='.repeat(50));
      
      // Step 1: Initial page
      console.log('📍 Step 1: Loading initial page');
      const init = await client.get('https://vtop.vit.ac.in/vtop/open/page');
      let csrf = getCsrf(init.data);
      
      // Step 2: Setup
      console.log('📍 Step 2: Calling prelogin setup');
      const setup = await client.post(
        'https://vtop.vit.ac.in/vtop/prelogin/setup',
        new URLSearchParams({ _csrf: csrf, flag: 'VTOP' }),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Referer': 'https://vtop.vit.ac.in/vtop/open/page',
            'Origin': 'https://vtop.vit.ac.in'
          }
        }
      );
      csrf = getCsrf(setup.data) || csrf;
      
      // Step 3: Get CAPTCHA
      console.log('📍 Step 3: Finding CAPTCHA');
      let captchaBuffer, setupHtml = setup.data, attempts = 0;
      
      while (!captchaBuffer && attempts++ < 10) {
        const $ = cheerio.load(setupHtml);
        const src = $('img.form-control.img-fluid.bg-light.border-0').attr('src');
        
        if (src?.startsWith('data:image')) {
          captchaBuffer = Buffer.from(src.split(',')[1], 'base64');
          console.log(`   ✅ CAPTCHA found on attempt ${attempts}`);
        } else {
          console.log(`   ❌ Reloading (${attempts}/10)`);
          const retry = await client.post(
            'https://vtop.vit.ac.in/vtop/prelogin/setup',
            new URLSearchParams({ _csrf: csrf, flag: 'VTOP' }),
            {
              headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Referer': 'https://vtop.vit.ac.in/vtop/open/page',
                'Origin': 'https://vtop.vit.ac.in'
              }
            }
          );
          setupHtml = retry.data;
          csrf = getCsrf(setupHtml) || csrf;
        }
      }
      
      if (!captchaBuffer) throw new Error('CAPTCHA not found');
      
      
      const captcha = await solveUsingViboot(captchaBuffer);
      console.log('   🧠 Solved as:', captcha);
      
      // Step 4: Submit login
      console.log('\n📍 Step 4: Submitting login');
      const loginRes = await client.post(
        'https://vtop.vit.ac.in/vtop/login',
        new URLSearchParams({
          _csrf: csrf,
          username: username,
          password: password,
          captchaStr: captcha
        }),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Referer': 'https://vtop.vit.ac.in/vtop/open/page',
            'Origin': 'https://vtop.vit.ac.in'
          }
        }
      );
      
      const finalUrl = loginRes.request?.res?.responseUrl || loginRes.config.url;
      console.log('   Status:', loginRes.status);
      console.log('   Final URL:', finalUrl);
      
      // Check for error URL (wrong CAPTCHA)
      if (finalUrl.includes('/vtop/login/error')) {
        console.log(`\n❌ CAPTCHA INCORRECT (Attempt ${captchaAttempt}/${MAX_CAPTCHA_ATTEMPTS})`);
        
        if (captchaAttempt < MAX_CAPTCHA_ATTEMPTS) {
          console.log('🔄 Retrying with new CAPTCHA...');
          await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
          continue; // Retry
        } else {
          console.log('\n❌ LOGIN FAILED - Max CAPTCHA attempts reached');
          return false;
        }
      }
      
      // Check for success (redirected to content/dashboard)
      if (finalUrl.includes('/vtop/content') || finalUrl.includes('/vtop/student')) {
        console.log('\n🎉 ✅ LOGIN SUCCESSFUL!');
        
        // Wait for server to settle
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Fetch dashboard
        const dashboardRes = await client.get('https://vtop.vit.ac.in/vtop/content');
        
        // Extract auth data
        globalCsrf = getCsrf(dashboardRes.data);
        globalAuthID = dashboardRes.data.match(/\b\d{2}[A-Z]{3}\d{4}\b/)?.[0];
        
        console.log('   🔑 Authorized ID:', globalAuthID);
        console.log('   🔑 CSRF Token:', globalCsrf);
        
        return true;
      } else {
        return false;
      }
      
    } catch (error) {
      console.error(`\n❌ Error on attempt ${captchaAttempt}:`, error.message);
      if (captchaAttempt >= MAX_CAPTCHA_ATTEMPTS) {
        return false;
      }
      console.log('🔄 Retrying...');
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  return false;
}

async function getCGPA() {
  try {
    console.log('\n📊 Fetching CGPA...');
    const { csrfToken, authorizedID } = await getAuthData();
    
    
    const res = await client.post(
      'https://vtop.vit.ac.in/vtop/get/dashboard/current/cgpa/credits',
      new URLSearchParams({
        authorizedID,
        _csrf: csrfToken,
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
    console.log('═'.repeat(50));
    $('li.list-group-item').each((i, el) => {
      const label = $(el).find('span.card-title').text().trim();
      const value = $(el).find('span.fontcolor3 span').text().trim();
      if (label && value) console.log(`${label.padEnd(30)} ${value}`);
    });
    console.log('═'.repeat(50));
  } catch (error) {
    console.error('❌ CGPA fetch error:', error.message);
  }
}

async function getAttendance(semId = 'VL20252601') {
  try {
    console.log('\n📊 ATTENDANCE:');
    const { csrfToken, authorizedID } = await getAuthData();
    
    const res = await client.post(
      'https://vtop.vit.ac.in/vtop/processViewStudentAttendance',
      new URLSearchParams({
        _csrf: csrfToken,
        semesterSubId: semId,
        authorizedID,
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
    $('#AttendanceDetailDataTable tbody tr').each((i, row) => {
      const cells = $(row).find('td');
      if (cells.length > 7) {
        const course = $(cells[2]).text().trim();
        const attended = $(cells[5]).text().trim();
        const total = $(cells[6]).text().trim();
        const percent = $(cells[7]).find('span span').text().trim() || $(cells[7]).text().trim();
        const status = parseFloat(percent) >= 75 ? '✅' : '⚠️';
        console.log(`${status} ${course}: ${attended}/${total} (${percent}%)`);
      }
    });
  } catch (error) {
    console.error('❌ Attendance error:', error.message);
  }
}

async function getMarks(semId = 'VL20252601') {
  try {
    console.log('\n🎯 MARKS:');
    const { csrfToken, authorizedID } = await getAuthData();
    
    const res = await client.post(
      'https://vtop.vit.ac.in/vtop/examinations/doStudentMarkView',
      new URLSearchParams({
        _csrf: csrfToken,
        semesterSubId: semId,
        authorizedID,
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
    const rows = $('tbody tr');
    
    for (let i = 0; i < rows.length; i++) {
      const row = $(rows[i]);
      if (!row.hasClass('tableContent')) continue;
      
      const cells = row.find('td');
      const courseCode = $(cells[2]).text().trim();
      const courseTitle = $(cells[3]).text().trim();
      
      if (courseCode) {
        console.log(`\n📚 ${courseCode} - ${courseTitle}`);
        
        const nextRow = $(rows[i + 1]);
        nextRow.find('.customTable-level1 tr.tableContent-level1').each((j, markRow) => {
          const outputs = $(markRow).find('output');
          const title = $(outputs[1]).text().trim();
          const scored = $(outputs[5]).text().trim();
          const max = $(outputs[2]).text().trim();
          const weightage = $(outputs[6]).text().trim();
          if (title) {
            const pct = ((parseFloat(scored) / parseFloat(max)) * 100).toFixed(1);
            console.log(`   ${title}: ${scored}/${max} (${pct}%) → ${weightage}`);
          }
        });
        i++;
      }
    }
  } catch (error) {
    console.error('❌ Marks error:', error.message);
  }
}

async function getAssignments(semId = 'VL20252601') {
  try {
    console.log('\n📋 ASSIGNMENTS:');
    const { csrfToken, authorizedID } = await getAuthData();
    
    const res = await client.post(
      'https://vtop.vit.ac.in/vtop/examinations/doDigitalAssignment',
      new URLSearchParams({
        authorizedID,
        x: new Date().toUTCString(),
        semesterSubId: semId,
        _csrf: csrfToken
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
    
    for (const row of $('tbody tr.tableContent').toArray()) {
      const cells = $(row).find('td');
      const classNbr = $(cells[1]).text().trim();
      const courseCode = $(cells[2]).text().trim();
      const courseTitle = $(cells[3]).text().trim();
      
      if (!classNbr) continue;
      
      console.log(`\n📚 ${courseCode} - ${courseTitle}`);
      
      try {
        const aRes = await client.post(
          'https://vtop.vit.ac.in/vtop/examinations/processDigitalAssignment',
          new URLSearchParams({
            _csrf: csrfToken,
            classId: classNbr,
            authorizedID,
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
        let foundAny = false;
        
        if (tables.length > 1) {
          $a(tables[1]).find('tbody tr.tableContent').each((i, aRow) => {
            const aCells = $a(aRow).find('td');
            const title = $a(aCells[1]).text().trim();
            const due = $a(aCells[4]).find('span').text().trim() || $a(aCells[4]).text().trim();
            if (title && title !== 'Title') {
              console.log(`   📝 ${title} - Due: ${due}`);
              foundAny = true;
            }
          });
        }
        
        if (!foundAny) console.log('   ⏳ No assignments found');
      } catch (error) {
        console.log('   ❌ Error fetching assignments');
      }
    }
  } catch (error) {
    console.error('❌ Assignments error:', error.message);
  }
}
async function getLeaveHistory() {
  try {
    console.log('\n🏠 LEAVE HISTORY:');
    const { csrfToken, authorizedID } = await getAuthData();
    
    if (!csrfToken || !authorizedID) {
      console.log('❌ Missing auth data');
      return;
    }
    
    // Step 1: Navigate to leave request section
    await client.post(
      'https://vtop.vit.ac.in/vtop/hostels/student/leave/1',
      new URLSearchParams({
        verifyMenu: 'true',
        authorizedID,
        _csrf: csrfToken
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Referer': 'https://vtop.vit.ac.in/vtop/content',
          'X-Requested-With': 'XMLHttpRequest'
        }
      }
    );
    
    // Wait a bit for server to process
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Step 2: Fetch leave history
    const res = await client.post(
      'https://vtop.vit.ac.in/vtop/hostels/student/leave/6',
      new URLSearchParams({
        _csrf: csrfToken,
        authorizedID,
        history: '',
        form: 'undefined',
        control: 'history'
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Referer': 'https://vtop.vit.ac.in/vtop/hostels/student/leave/1',
          'X-Requested-With': 'XMLHttpRequest'
        }
      }
    );
    
    const $ = cheerio.load(res.data);
    let count = 0;
    
    // Try to find the table
    const table = $('#LeaveHistoryTable');
    if (table.length === 0) {
      console.log('⚠️  LeaveHistoryTable not found in response');
      return;
    }
    
    const allRows = $('#LeaveHistoryTable tbody tr');
    
    // Header
    console.log('═'.repeat(120));
    console.log('  #  │ Place                    │ Reason                   │ Type              │ From → To                    │ Status');
    console.log('═'.repeat(120));
    
    $('#LeaveHistoryTable tbody tr').each((i, row) => {
      const allCells = $(row).find('td');
      
      // Skip the first hidden cell, use indices 1-6 instead of 0-5
      if (allCells.length >= 7) {
        const place = $(allCells[1]).text().trim();
        const reason = $(allCells[2]).text().trim();
        const type = $(allCells[3]).text().trim();
        const from = $(allCells[4]).text().trim();
        const to = $(allCells[5]).text().trim();
        const status = $(allCells[6]).text().trim();
        
        if (place) {
          count++;
          const statusIcon = status.includes('APPROVED') && !status.includes('CANCELLED') ? '✅' : 
                            status.includes('CANCELLED') ? '❌' : '⏳';
          
          // Format dates to be more compact
          const fromDate = from.replace(/-202[0-9]/, '').replace(' ', '@').substring(0, 11);
          const toDate = to.replace(/-202[0-9]/, '').replace(' ', '@').substring(0, 11);
          
          // Truncate long text
          const shortPlace = place.length > 22 ? place.substring(0, 19) + '...' : place;
          const shortReason = reason.length > 22 ? reason.substring(0, 19) + '...' : reason;
          const shortType = type.length > 16 ? type.substring(0, 13) + '...' : type;
          const shortStatus = status.length > 45 ? status.substring(0, 42) + '...' : status;
          
          console.log(
            ` ${String(count).padStart(2)} ${statusIcon} │ ` +
            `${shortPlace.padEnd(24)} │ ` +
            `${shortReason.padEnd(24)} │ ` +
            `${shortType.padEnd(17)} │ ` +
            `${fromDate} → ${toDate.padEnd(11)} │ ` +
            `${shortStatus}`
          );
        }
      }
    });
    
    console.log('═'.repeat(120));
    
    if (count === 0) {
      console.log('⏳ No leave records found in table');
    } else {
      console.log(`📊 Total leaves found: ${count}`);
    }
  } catch (error) {
    console.error('❌ Leave History error:', error.message);
    console.error('   Full error:', error);
  }
}

async function getGrades(semesterId = 'VL20242505') {
  try {
    console.log('\n🎓 GRADES:');
    const { csrfToken, authorizedID } = await getAuthData();
    
    if (!csrfToken || !authorizedID) {
      console.log('❌ Missing auth data');
      return;
    }
    
    // Step 1: Navigate to grades page
    await client.post(
      'https://vtop.vit.ac.in/vtop/examinations/examGradeView/StudentGradeView',
      new URLSearchParams({
        verifyMenu: 'true',
        authorizedID,
        _csrf: csrfToken
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Referer': 'https://vtop.vit.ac.in/vtop/content',
          'X-Requested-With': 'XMLHttpRequest'
        }
      }
    );
    
    // Wait a bit for server to process
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Step 2: Fetch grades for semester
    const res = await client.post(
      'https://vtop.vit.ac.in/vtop/examinations/examGradeView/doStudentGradeView',
      new URLSearchParams({
        authorizedID,
        _csrf: csrfToken,
        semesterSubId: semesterId
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Referer': 'https://vtop.vit.ac.in/vtop/examinations/examGradeView/StudentGradeView',
          'X-Requested-With': 'XMLHttpRequest'
        }
      }
    );
    
    const $ = cheerio.load(res.data);
    
    let count = 0;
    let gpa = '';
    
    console.log('═'.repeat(120));
    console.log('📚 SEMESTER GRADES');
    console.log('═'.repeat(120));
    
    // Try different table selectors
    const tables = $('table');
    let targetTable = null;
    
    // Find the table with grades
    tables.each((i, table) => {
      const headerText = $(table).find('th').text();
      if (headerText.includes('Course Code') || headerText.includes('Grade')) {
        targetTable = $(table);
      }
    });
    
    if (!targetTable) {
      targetTable = $('table.table-hover, table.table-bordered').first();
    }
    
    targetTable.find('tbody tr').each((i, row) => {
      const cells = $(row).find('td');
      
      // Check if this is the GPA row
      if (cells.length === 1 && $(cells[0]).attr('colspan')) {
        gpa = $(cells[0]).text().trim();
        return;
      }
      
      // Skip rows with less than 11 cells or header rows
      if (cells.length < 11) return;
      
      const slNo = $(cells[0]).text().trim();
      
      // Skip header rows and empty rows
      if (!slNo || slNo === 'Sl.No.' || isNaN(parseInt(slNo))) return;
      
      const courseCode = $(cells[1]).text().trim();
      const courseTitle = $(cells[2]).text().trim();
      const courseType = $(cells[3]).text().trim();
      const creditsL = $(cells[4]).text().trim();
      const creditsP = $(cells[5]).text().trim();
      const creditsJ = $(cells[6]).text().trim();
      const creditsC = $(cells[7]).text().trim();
      const gradingType = $(cells[8]).text().trim();
      const total = $(cells[9]).text().trim();
      const grade = $(cells[10]).text().trim();
      
      if (courseCode) {
        count++;
        
        // Determine status icon based on grade
        const statusIcon = grade === 'S' ? '🌟' : 
                          grade === 'A' ? '✅' : 
                          grade === 'B' ? '👍' :
                          grade === 'C' ? '📘' :
                          grade === 'D' ? '📙' :
                          grade === 'E' ? '⚠️' :
                          grade === 'F' ? '❌' : '📝';
        
        // Truncate long course titles
        const shortTitle = courseTitle.length > 35 ? courseTitle.substring(0, 32) + '...' : courseTitle;
        const shortType = courseType.length > 12 ? courseType.substring(0, 9) + '...' : courseType;
        
        console.log(
          `\n${String(count).padStart(2)} ${statusIcon} ${courseCode.padEnd(10)} - ${shortTitle.padEnd(35)}`
        );
        console.log(
          `   📖 Type: ${shortType.padEnd(12)} │ ` +
          `Credits: ${creditsC.padEnd(3)} │ ` +
          `Total: ${total.padEnd(3)} │ ` +
          `Grade: ${grade}`
        );
      }
    });
    
    console.log('\n' + '═'.repeat(120));
    
    if (count === 0) {
      console.log('⏳ No grade records found');
      console.log('\n🔍 Debug info:');
      console.log(`   Response length: ${res.data.length}`);
      console.log(`   Tables found: ${tables.length}`);
      console.log(`   First 500 chars of response:`);
      console.log(res.data.substring(0, 500));
    } else {
      if (gpa) {
        console.log(`\n🎯 ${gpa}`);
      }
      console.log(`📊 Total courses: ${count}`);
    }
    
  } catch (error) {
    console.error('❌ Grades fetch error:', error.message);
  }
}
async function getPaymentHistory() {
  try {
    console.log('\n💳 PAYMENT HISTORY:');
    const { csrfToken, authorizedID } = await getAuthData();
    
    if (!csrfToken || !authorizedID) {
      console.log('❌ Missing auth data');
      return;
    }
    
    // Fetch payment receipts
    const res = await client.post(
      'https://vtop.vit.ac.in/vtop/finance/getStudentReceipts',
      new URLSearchParams({
        verifyMenu: 'true',
        authorizedID,
        _csrf: csrfToken
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
    let count = 0;
    let totalAmount = 0;
    
    // Header
    console.log('═'.repeat(120));
    console.log('  #  │ Invoice Number   │ Receipt Number │ Date           │ Amount        │ Campus');
    console.log('═'.repeat(120));
    
    $('table tbody tr').each((i, row) => {
      // Skip header row
      if ($(row).hasClass('table-info')) return;
      
      const cells = $(row).find('td');
      
      if (cells.length >= 5) {
        const invoiceNum = $(cells[0]).text().trim();
        const receiptNum = $(cells[1]).text().trim();
        const date = $(cells[2]).text().trim();
        const amount = $(cells[3]).text().trim();
        const campus = $(cells[4]).text().trim();
        
        if (invoiceNum) {
          count++;
          const amountVal = parseFloat(amount.replace(/,/g, '')) || 0;
          totalAmount += amountVal;
          
          // Format amount with commas
          const formattedAmount = '₹' + amountVal.toLocaleString('en-IN', { minimumFractionDigits: 0 });
          
          console.log(
            ` ${String(count).padStart(2)} │ ` +
            `${invoiceNum.padEnd(16)} │ ` +
            `${receiptNum.padEnd(14)} │ ` +
            `${date.padEnd(14)} │ ` +
            `${formattedAmount.padEnd(13)} │ ` +
            `${campus}`
          );
        }
      }
    });
    
    console.log('═'.repeat(120));
    
    if (count === 0) {
      console.log('⏳ No payment records found');
    } else {
      const formattedTotal = '₹' + totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 0 });
      console.log(`💰 Total Amount Paid: ${formattedTotal}`);
      console.log(`📊 Total Transactions: ${count}`);
    }
  } catch (error) {
    console.error('❌ Payment History error:', error.message);
  }
}

async function getTimetable(semesterId = 'VL20252601') {
  try {
    console.log('\n📅 TIMETABLE:');
    const { csrfToken, authorizedID } = await getAuthData();
    
    if (!csrfToken || !authorizedID) {
      console.log('❌ Missing auth data');
      return;
    }
    
    // Step 1: Navigate to timetable page
    await client.post(
      'https://vtop.vit.ac.in/vtop/academics/common/StudentTimeTable',
      new URLSearchParams({
        verifyMenu: 'true',
        authorizedID,
        _csrf: csrfToken
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Referer': 'https://vtop.vit.ac.in/vtop/content',
          'X-Requested-With': 'XMLHttpRequest'
        }
      }
    );
    
    // Wait a bit for server to process
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Step 2: Fetch timetable for semester
    const res = await client.post(
      'https://vtop.vit.ac.in/vtop/processViewTimeTable',
      new URLSearchParams({
        _csrf: csrfToken,
        semesterSubId: semesterId,
        authorizedID
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Referer': 'https://vtop.vit.ac.in/vtop/academics/common/StudentTimeTable',
          'X-Requested-With': 'XMLHttpRequest'
        }
      }
    );
    
    const $ = cheerio.load(res.data);
    
    const days = ['MON', 'TUE', 'WED', 'THU', 'FRI'];
    const schedule = {};
    
    // Parse timetable
    $('table tbody tr').each((i, row) => {
      const cells = $(row).find('td');
      const dayCell = $(cells[0]).text().trim();
      const typeCell = $(cells[1]).text().trim();
      
      // Check if this is a day row (has day name in first cell)
      if (days.includes(dayCell) && typeCell === 'THEORY') {
        if (!schedule[dayCell]) schedule[dayCell] = [];
        
        // Parse theory slots (skip first 2 cells - day and type)
        for (let j = 2; j < cells.length; j++) {
          const cell = $(cells[j]);
          const bgcolor = cell.attr('bgcolor');
          const text = cell.text().trim();
          
          // Check if it's a scheduled class (pink background)
          if (bgcolor === '#FC6C85' && text && text !== '-' && text !== 'Lunch') {
            // Parse format: SLOT-COURSE_CODE-TYPE-VENUE-SECTION
            const parts = text.split('-');
            if (parts.length >= 4) {
              schedule[dayCell].push({
                slot: parts[0],
                courseCode: parts[1],
                type: parts[2],
                venue: parts[3],
                section: parts[4] || 'ALL'
              });
            }
          }
        }
      }
      
      // Check for LAB row for the same day
      if (days.includes(dayCell) && typeCell === 'LAB') {
        // Parse lab slots
        for (let j = 2; j < cells.length; j++) {
          const cell = $(cells[j]);
          const bgcolor = cell.attr('bgcolor');
          const text = cell.text().trim();
          
          if (bgcolor === '#FC6C85' && text && text !== '-' && text !== 'Lunch') {
            const parts = text.split('-');
            if (parts.length >= 4) {
              schedule[dayCell].push({
                slot: parts[0],
                courseCode: parts[1],
                type: parts[2],
                venue: parts[3],
                section: parts[4] || 'ALL'
              });
            }
          }
        }
      }
    });
    
    // Display timetable
    for (const day of days) {
      if (schedule[day] && schedule[day].length > 0) {
        console.log(`\n${'═'.repeat(100)}`);
        console.log(`📆 ${day}`);
        console.log('═'.repeat(100));
        
        schedule[day].forEach(item => {
          const icon = item.type === 'LO' ? '🔬' : '📚';
          console.log(`\n${icon} ${item.slot} - ${item.courseCode}`);
          console.log(`   📍 ${item.venue}`);
          console.log(`   👥 ${item.section}`);
        });
      }
    }
    
    console.log(`\n${'═'.repeat(100)}`);
    
    // Summary
    const totalClasses = Object.values(schedule).reduce((sum, classes) => sum + classes.length, 0);
    console.log(`\n📊 Total classes this week: ${totalClasses}`);
    
  } catch (error) {
    console.error('❌ Timetable fetch error:', error.message);
  }
}

async function getProctorDetails() {
  try {
    console.log('\n👨‍🏫 PROCTOR DETAILS:');
    const { csrfToken, authorizedID } = await getAuthData();
    
    if (!csrfToken || !authorizedID) {
      console.log('❌ Missing auth data');
      return;
    }
    
    // Fetch proctor details
    const res = await client.post(
      'https://vtop.vit.ac.in/vtop/proctor/viewProctorDetails',
      new URLSearchParams({
        verifyMenu: 'true',
        authorizedID,
        _csrf: csrfToken
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
    
    console.log('═'.repeat(80));
    
    // Parse the table
    $('table.table tbody tr').each((i, row) => {
      const cells = $(row).find('td');
      
      if (cells.length >= 2) {
        const label = $(cells[0]).text().trim();
        const value = $(cells[1]).text().trim();
        
        // Skip the image row
        if (label && value && !label.includes('Image')) {
          console.log(`${label}: ${value}`);
        }
      }
    });
    
    console.log('═'.repeat(80));
    
  } catch (error) {
    console.error('❌ Proctor Details fetch error:', error.message);
  }
}

async function getExamSchedule(semesterId = 'VL20252601') {
  try {
    console.log('\n📝 EXAM SCHEDULE:');
    const { csrfToken, authorizedID } = await getAuthData();
    
    if (!csrfToken || !authorizedID) {
      console.log('❌ Missing auth data');
      return;
    }
    
    // Step 1: Navigate to exam schedule page
    await client.post(
      'https://vtop.vit.ac.in/vtop/examinations/StudExamSchedule',
      new URLSearchParams({
        verifyMenu: 'true',
        authorizedID,
        _csrf: csrfToken
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Referer': 'https://vtop.vit.ac.in/vtop/content',
          'X-Requested-With': 'XMLHttpRequest'
        }
      }
    );
    
    // Wait a bit for server to process
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Step 2: Fetch exam schedule for semester
    const res = await client.post(
      'https://vtop.vit.ac.in/vtop/examinations/doSearchExamScheduleForStudent',
      new URLSearchParams({
        authorizedID,
        _csrf: csrfToken,
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
    
    // Organize exams by type (CAT1, CAT2, FAT)
    const examsByType = {
      'CAT1': [],
      'CAT2': [],
      'FAT': []
    };
    
    let currentExamType = null;
    
    // Parse the table
    $('table.customTable tbody tr').each((i, row) => {
      const cells = $(row).find('td');
      
      // Check if this is an exam type header
      if (cells.length === 1 && $(cells[0]).hasClass('panelHead-secondary')) {
        currentExamType = $(cells[0]).text().trim();
        return;
      }
      
      // Skip table header rows
      if ($(row).hasClass('tableHeader')) return;
      
      // Parse exam data rows
      if (cells.length >= 13 && currentExamType) {
        const slNo = $(cells[0]).text().trim();
        
        if (slNo && !isNaN(slNo)) {
          const exam = {
            courseCode: $(cells[1]).text().trim(),
            courseTitle: $(cells[2]).text().trim(),
            slot: $(cells[5]).text().trim(),
            examDate: $(cells[6]).text().trim(),
            session: $(cells[7]).text().trim(),
            reportingTime: $(cells[8]).text().trim(),
            examTime: $(cells[9]).text().trim(),
            venue: $(cells[10]).text().trim(),
            seatLocation: $(cells[11]).text().trim(),
            seatNo: $(cells[12]).text().trim()
          };
          
          if (examsByType[currentExamType]) {
            examsByType[currentExamType].push(exam);
          }
        }
      }
    });
    
    // Display exams by type
    for (const [examType, exams] of Object.entries(examsByType)) {
      if (exams.length > 0) {
        console.log(`\n${'═'.repeat(100)}`);
        console.log(`📋 ${examType} EXAMS`);
        console.log('═'.repeat(100));
        
        exams.forEach((exam, idx) => {
          const examIcon = examType === 'FAT' ? '🎯' : '📝';
          const hasVenue = exam.venue !== '-';
          
          console.log(`\n${examIcon} Exam ${idx + 1}: ${exam.courseCode} - ${exam.courseTitle}`);
          console.log(`   📅 Date: ${exam.examDate}`);
          console.log(`   ⏰ Time: ${exam.examTime} (Report at ${exam.reportingTime})`);
          console.log(`   🕐 Session: ${exam.session}`);
          console.log(`   📍 Slot: ${exam.slot}`);
          
          if (hasVenue) {
            console.log(`   🏛️  Venue: ${exam.venue}`);
            console.log(`   💺 Seat: ${exam.seatLocation} - Seat No. ${exam.seatNo}`);
          } else {
            console.log(`   ⏳ Venue: Not assigned yet`);
          }
        });
        
        console.log(`\n${'─'.repeat(100)}`);
        console.log(`📊 Total ${examType} exams: ${exams.length}`);
      }
    }
    
    console.log(`\n${'═'.repeat(100)}`);
    
    // Overall summary
    const totalExams = Object.values(examsByType).reduce((sum, exams) => sum + exams.length, 0);
    console.log(`\n📈 SUMMARY: ${totalExams} total exams scheduled`);
    console.log(`   CAT1: ${examsByType.CAT1.length} | CAT2: ${examsByType.CAT2.length} | FAT: ${examsByType.FAT.length}`);
    
  } catch (error) {
    console.error('❌ Exam Schedule fetch error:', error.message);
  }
}

async function getGradeHistory() {
  try {
    console.log('\n🎓 GRADE HISTORY:');
    const { csrfToken, authorizedID } = await getAuthData();
    
    if (!csrfToken || !authorizedID) {
      console.log('❌ Missing auth data');
      return;
    }
    
    // Fetch grade history
    const res = await client.post(
      'https://vtop.vit.ac.in/vtop/examinations/examGradeView/StudentGradeHistory',
      new URLSearchParams({
        verifyMenu: 'true',
        authorizedID,
        _csrf: csrfToken
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
    
    // Grade counters
    const gradeCount = {
      'S': 0,
      'A': 0,
      'B': 0,
      'C': 0,
      'D': 0,
      'E': 0,
      'F': 0,
      'P': 0,
      'N': 0
    };
    
    let totalCredits = 0;
    let earnedCredits = 0;
    let courseCount = 0;
    
    // Parse the effective grades table
    console.log('═'.repeat(130));
    console.log('📚 COURSE HISTORY');
    console.log('═'.repeat(130));
    
    $('table.customTable tbody tr.tableContent').each((i, row) => {
      const cells = $(row).find('td');
      
      // Skip if this is a detail view row or has wrong number of cells
      if ($(row).attr('id')?.includes('detailsView') || cells.length < 9) return;
      
      const slNo = $(cells[0]).text().trim();
      
      // Only process rows with valid serial numbers
      if (slNo && !isNaN(slNo)) {
        const courseCode = $(cells[1]).text().trim();
        const courseTitle = $(cells[2]).text().trim();
        const courseType = $(cells[3]).text().trim();
        const credits = $(cells[4]).text().trim();
        const grade = $(cells[5]).text().trim();
        const examMonth = $(cells[6]).text().trim();
        const resultDeclared = $(cells[7]).text().trim();
        const distribution = $(cells[8]).text().trim();
        
        if (courseCode) {
          courseCount++;
          
          // Count credits
          const creditVal = parseFloat(credits) || 0;
          totalCredits += creditVal;
          
          // Count grade
          if (grade && grade !== '-' && gradeCount.hasOwnProperty(grade)) {
            gradeCount[grade]++;
            
            // Count earned credits (exclude F and N grades)
            if (grade !== 'F' && grade !== 'N') {
              earnedCredits += creditVal;
            }
          }
          
          // Determine grade icon
          const gradeIcon = grade === 'S' ? '🌟' :
                            grade === 'A' ? '✅' :
                            grade === 'B' ? '👍' :
                            grade === 'C' ? '📘' :
                            grade === 'D' ? '📙' :
                            grade === 'E' ? '⚠️' :
                            grade === 'F' ? '❌' :
                            grade === 'P' ? '✔️' : '📝';
          
          // Truncate long titles
          const shortTitle = courseTitle.length > 36 ? courseTitle.substring(0, 33) + '...' : courseTitle;
          const shortType = courseType.length > 4 ? courseType.substring(0, 4) : courseType;
          const shortDist = distribution.length > 8 ? distribution.substring(0, 8) : distribution;
          
          console.log(
            ` ${String(courseCount).padStart(2)} ${gradeIcon} │ ` +
            `${courseCode.padEnd(10)} │ ` +
            `${shortTitle.padEnd(36)} │ ` +
            `${shortType.padEnd(4)} │ ` +
            `${credits.padEnd(4)} │ ` +
            `${grade.padEnd(2)} │ ` +
            `${examMonth.padEnd(9)} │ ` +
            `${shortDist.padEnd(8)}`
          );
        }
      }
    });
    
    console.log('═'.repeat(130));
    
    // Extract CGPA details from the CGPA Details table
    let cgpa = '0.00';
    $('table.table.table-hover.table-bordered tbody tr').each((i, row) => {
      const cells = $(row).find('td');
      if (cells.length >= 3) {
        cgpa = $(cells[2]).text().trim();
      }
    });
    
    // Display summary
    console.log('\n📊 GRADE DISTRIBUTION:');
    console.log('─'.repeat(80));
    
    // Display grade counts in a formatted way
    const gradeDisplay = [];
    for (const [grade, count] of Object.entries(gradeCount)) {
      if (count > 0) {
        const icon = grade === 'S' ? '🌟' : 
                    grade === 'A' ? '✅' : 
                    grade === 'B' ? '👍' :
                    grade === 'C' ? '📘' :
                    grade === 'D' ? '📙' :
                    grade === 'E' ? '⚠️' :
                    grade === 'F' ? '❌' :
                    grade === 'P' ? '✔️' : '📝';
        gradeDisplay.push(`${icon} ${grade}: ${count}`);
      }
    }
    
    // Print grade counts in rows of 5
    for (let i = 0; i < gradeDisplay.length; i += 5) {
      console.log('   ' + gradeDisplay.slice(i, i + 5).join('  │  '));
    }
    
    console.log('─'.repeat(80));
    console.log(`\n🎯 CGPA: ${cgpa}`);
    console.log(`📚 Total Courses: ${courseCount}`);
    console.log(`📊 Total Credits Registered: ${totalCredits.toFixed(1)}`);
    console.log(`✅ Credits Earned: ${earnedCredits.toFixed(1)}`);
    
    // Parse curriculum details
    console.log('\n📋 CURRICULUM PROGRESS:');
    console.log('─'.repeat(80));
    
    $('table.customTable').eq(1).find('tbody tr.tableContent').each((i, row) => {
      const cells = $(row).find('td');
      if (cells.length === 3) {
        const type = $(cells[0]).find('span').first().text().trim();
        const required = $(cells[1]).text().trim();
        const earned = $(cells[2]).text().trim();
        
        if (type && !type.includes('Total Credits')) {
          const status = parseFloat(earned) >= parseFloat(required) ? '✅' : '⏳';
          const shortType = type.length > 45 ? type.substring(0, 42) + '...' : type;
          console.log(`   ${status} ${shortType.padEnd(48)} ${earned.padStart(5)}/${required.padStart(5)}`);
        }
      }
    });
    
    console.log('─'.repeat(80));
    
  } catch (error) {
    console.error('❌ Grade History fetch error:', error.message);
  }
}

async function getCounsellingRank() {
  try {
    console.log('\n🏠 COUNSELLING RANK DETAILS:');
    const { csrfToken, authorizedID } = await getAuthData();
    
    if (!csrfToken || !authorizedID) {
      console.log('❌ Missing auth data');
      return;
    }
    
    // Fetch counselling rank details
    const res = await client.post(
      'https://vtop.vit.ac.in/vtop/hostels/counsellingSlotTimings',
      new URLSearchParams({
        verifyMenu: 'true',
        authorizedID,
        _csrf: csrfToken
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
    
    // Extract counselling details from the table
    const details = {};
    
    $('table.table-success tbody tr').each((i, row) => {
      const cells = $(row).find('td');
      if (cells.length === 2) {
        const label = $(cells[0]).text().trim();
        const value = $(cells[1]).text().trim();
        details[label] = value;
      }
    });
    
    console.log('═'.repeat(60));
    
    if (details['Counselling Rank']) {
      console.log(`🎯 Counselling Rank: ${details['Counselling Rank']}`);
      console.log(`👥 Group: ${details['Group']}`);
      console.log(`🎫 Slot: ${details['Slot']}`);
      console.log(`⏰ Report Time: ${details['Report Time']}`);
      console.log(`📍 Venue: ${details['Venue']}`);
      console.log(`📅 Counseling Date: ${details['Counseling Date']}`);
    } else {
      console.log('⏳ No counselling rank details available');
    }
    
    console.log('═'.repeat(60));
    
  } catch (error) {
    console.error('❌ Counselling Rank fetch error:', error.message);
  }
}

function getUserInput(prompt) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

async function getFacultyInfo() {
  try {
    console.log('\n👨‍🏫 FACULTY INFORMATION:');
    const { csrfToken, authorizedID } = await getAuthData();
    
    if (!csrfToken || !authorizedID) {
      console.log('❌ Missing auth data');
      return;
    }
    
    // Step 1: Navigate to faculty search page
    await client.post(
      'https://vtop.vit.ac.in/vtop/hrms/employeeSearchForStudent',
      new URLSearchParams({
        verifyMenu: 'true',
        authorizedID,
        _csrf: csrfToken
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Referer': 'https://vtop.vit.ac.in/vtop/content',
          'X-Requested-With': 'XMLHttpRequest'
        }
      }
    );
    
    // Wait a bit for server to process
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Step 2: Get faculty name from user
    const facultyName = await getUserInput('Enter Faculty Name (minimum 3 characters): ');
    
    if (facultyName.length < 3) {
      console.log('❌ Please enter at least 3 characters');
      return;
    }
    
    console.log(`\n🔍 Searching for: ${facultyName}`);
    
    // Step 3: Search for faculty
    const searchRes = await client.post(
      'https://vtop.vit.ac.in/vtop/hrms/EmployeeSearchForStudent',
      new URLSearchParams({
        _csrf: csrfToken,
        authorizedID,
        x: new Date().toUTCString(),
        empId: facultyName.toLowerCase()
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Referer': 'https://vtop.vit.ac.in/vtop/hrms/employeeSearchForStudent',
          'X-Requested-With': 'XMLHttpRequest'
        }
      }
    );
    
    // Parse search results
    const $search = cheerio.load(searchRes.data);
    
    // Check if results found
    const tableRows = $search('table tbody tr').length;
    if (tableRows <= 1) { // Only header row
      console.log('❌ No faculty found. Please check the name and try again.');
      return;
    }
    
    // Display search results
    console.log('═'.repeat(100));
    console.log('SEARCH RESULTS:');
    console.log('═'.repeat(100));
    
    const faculties = [];
    let index = 0;
    
    $search('table tbody tr').each((i, row) => {
      // Skip header row
      if (i === 0) return;
      
      const cells = $search(row).find('td');
      if (cells.length >= 4) {
        const name = $search(cells[0]).text().trim();
        const designation = $search(cells[1]).text().trim();
        const school = $search(cells[2]).text().trim();
        const button = $search(cells[3]).find('button');
        const empId = button.attr('id') || button.attr('onclick')?.match(/getEmployeeIdNo\(["']([^"']+)["']\)/)?.[1];
        
        if (name && empId) {
          faculties.push({ name, designation, school, empId });
          console.log(`\n${index + 1}. ${name}`);
          console.log(`   🏢 ${designation}`);
          console.log(`   🎓 ${school}`);
          index++;
        }
      }
    });
    
    console.log('═'.repeat(100));
    
    if (faculties.length === 0) {
      console.log('❌ No faculty found. Please check the name and try again.');
      return;
    }
    
    // If multiple results, ask user to select
    let selectedFaculty;
    if (faculties.length > 1) {
      const selection = await getUserInput(`\nSelect faculty number (1-${faculties.length}): `);
      const selectedIndex = parseInt(selection) - 1;
      
      if (selectedIndex < 0 || selectedIndex >= faculties.length) {
        console.log('❌ Invalid selection');
        return;
      }
      selectedFaculty = faculties[selectedIndex];
    } else {
      selectedFaculty = faculties[0];
    }
    
    console.log('\n✅ Fetching details...\n');
    
    // Step 4: Get faculty details
    const detailsRes = await client.post(
      'https://vtop.vit.ac.in/vtop/hrms/EmployeeSearch1ForStudent',
      new URLSearchParams({
        _csrf: csrfToken,
        authorizedID,
        x: new Date().toUTCString(),
        empId: selectedFaculty.empId
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Referer': 'https://vtop.vit.ac.in/vtop/hrms/employeeSearchForStudent',
          'X-Requested-With': 'XMLHttpRequest'
        }
      }
    );
    
    const $ = cheerio.load(detailsRes.data);
    
    // Extract faculty details
    const details = {};
    
    $('table.table-bordered').first().find('tbody tr').each((i, row) => {
      const cells = $(row).find('td');
      if (cells.length >= 2) {
        const label = $(cells[0]).find('b').text().trim();
        const value = $(cells[1]).text().trim();
        
        if (label && value && !label.includes('Image')) {
          details[label] = value;
        }
      }
    });
    
    // Extract open hours
    const openHours = [];
    $('table.table-bordered').last().find('tbody tr').each((i, row) => {
      const cells = $(row).find('td');
      if (cells.length >= 2) {
        const day = $(cells[0]).text().trim();
        const timing = $(cells[1]).text().trim();
        if (day && timing) {
          openHours.push({ day, timing });
        }
      }
    });
    
    // Display faculty information
    console.log('═'.repeat(80));
    console.log(`👤 ${details['Name of the Faculty '] || selectedFaculty.name}`);
    console.log('═'.repeat(80));
    console.log(`🏢 Designation: ${details['Designation'] || selectedFaculty.designation}`);
    console.log(`🏛️  Department: ${details['Name of Department'] || 'N/A'}`);
    console.log(`🎓 School: ${details['School / Centre Name'] || selectedFaculty.school}`);
    console.log(`📧 Email: ${details['E-Mail Id'] || 'N/A'}`);
    console.log(`📍 Cabin: ${details['Cabin Number'] || 'N/A'}`);
    
    if (openHours.length > 0) {
      console.log('\n⏰ OPEN HOURS:');
      console.log('─'.repeat(80));
      openHours.forEach(hour => {
        console.log(`   ${hour.day}: ${hour.timing}`);
      });
    }
    
    console.log('═'.repeat(80));
    
  } catch (error) {
    console.error('❌ Faculty Info fetch error:', error.message);
  }
}


(async () => {
  if (await login()) {
    // await getCGPA();
    // await getAttendance();
    // await getMarks();
    // await getAssignments();
    // await getLeaveHistory();
    // await getGrades();
    await getPaymentHistory();
    // await getTimetable();
    // await getProctorDetails();
    // await getExamSchedule();
    // await getGradeHistory();
    await getCounsellingRank();
    // await getFacultyInfo();
    console.log('\n✅ All done! Press Ctrl+C to exit');
    setInterval(() => {}, 30000);
  } else {
    console.log('\n❌ Login failed after all attempts');
  }
})();