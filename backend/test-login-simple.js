// vtop-login-with-retry.js
require('dotenv').config();
const axios = require('axios');
const { wrapper } = require('axios-cookiejar-support');
const { CookieJar } = require('tough-cookie');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const { solveUsingViboot } = require('./captcha/captchaSolver');

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
      
      // Save & Solve CAPTCHA
      const dir = path.join(__dirname, 'sample-captchas');
      if (!fs.existsSync(dir)) fs.mkdirSync(dir);
      const captchaFilename = `captcha-attempt${captchaAttempt}-${Date.now()}.png`;
      fs.writeFileSync(path.join(dir, captchaFilename), captchaBuffer);
      
      const captcha = await solveUsingViboot(captchaBuffer);
      console.log('   🧠 Solved as:', captcha);
      console.log('   💾 Saved as:', captchaFilename);
      
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
        console.log('📍 Loading dashboard...');
        const dashboardRes = await client.get('https://vtop.vit.ac.in/vtop/content');
        
        fs.writeFileSync(path.join(__dirname, 'dashboard.html'), dashboardRes.data);
        console.log('   💾 Dashboard saved to: dashboard.html');
        
        // Extract auth data
        globalCsrf = getCsrf(dashboardRes.data);
        globalAuthID = dashboardRes.data.match(/\b\d{2}[A-Z]{3}\d{4}\b/)?.[0];
        
        console.log('   🔑 Authorized ID:', globalAuthID);
        console.log('   🔑 CSRF Token:', globalCsrf);
        
        return true;
      } else {
        console.log('\n⚠️  Unknown response - check dashboard.html');
        fs.writeFileSync(path.join(__dirname, 'unknown-response.html'), loginRes.data);
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
    
    if (!csrfToken || !authorizedID) {
      console.log('❌ Missing auth data');
      return;
    }
    
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

(async () => {
  if (await login()) {
    await getCGPA();
    await getAttendance();
    await getMarks();
    await getAssignments();
    console.log('\n✅ All done! Press Ctrl+C to exit');
    setInterval(() => {}, 30000);
  } else {
    console.log('\n❌ Login failed after all attempts');
  }
})();
