const axios = require('axios');
const { wrapper } = require('axios-cookiejar-support');
const { CookieJar } = require('tough-cookie');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const { solveUsingViboot } = require('./captcha/captchaSolver');

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

async function loginToVTOP(username, password) {
  const MAX_CAPTCHA_ATTEMPTS = 3;
  
  for (let captchaAttempt = 1; captchaAttempt <= MAX_CAPTCHA_ATTEMPTS; captchaAttempt++) {
    try {
      const init = await client.get('https://vtop.vit.ac.in/vtop/open/page');
      let csrf = getCsrf(init.data);
      
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
      
      let captchaBuffer, setupHtml = setup.data, attempts = 0;
      
      while (!captchaBuffer && attempts++ < 10) {
        const $ = cheerio.load(setupHtml);
        const src = $('img.form-control.img-fluid.bg-light.border-0').attr('src');
        
        if (src?.startsWith('data:image')) {
          captchaBuffer = Buffer.from(src.split(',')[1], 'base64');
        } else {
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
      
      const dir = path.join(__dirname, 'sample-captchas');
      if (!fs.existsSync(dir)) fs.mkdirSync(dir);
      fs.writeFileSync(path.join(dir, `captcha-${Date.now()}.png`), captchaBuffer);
      
      const captcha = await solveUsingViboot(captchaBuffer);
      console.log('CAPTCHA solved:', captcha);
      
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
      
      if (finalUrl.includes('/vtop/login/error')) {
        console.log(`CAPTCHA incorrect (Attempt ${captchaAttempt}/${MAX_CAPTCHA_ATTEMPTS})`);
        if (captchaAttempt < MAX_CAPTCHA_ATTEMPTS) {
          await new Promise(resolve => setTimeout(resolve, 1000));
          continue;
        } else {
          console.log('Login failed after max attempts');
          return false;
        }
      }
      
      if (finalUrl.includes('/vtop/content') || finalUrl.includes('/vtop/student')) {
        console.log('Login successful');
        
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        const dashboardRes = await client.get('https://vtop.vit.ac.in/vtop/content');
        
        globalCsrf = getCsrf(dashboardRes.data);
        globalAuthID = dashboardRes.data.match(/\b\d{2}[A-Z]{3}\d{4}\b/)?.[0];
        
        // console.log('Auth data extracted');
        
        return true;
      } else {
        console.log('Unknown response');
        return false;
      }
      
    } catch (error) {
      console.error('Login error:', error.message);
      if (captchaAttempt >= MAX_CAPTCHA_ATTEMPTS) {
        return false;
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  return false;
}

async function getAuthData() {
  if (globalCsrf && globalAuthID) {
    return { csrfToken: globalCsrf, authorizedID: globalAuthID };
  }
  
  const res = await client.get('https://vtop.vit.ac.in/vtop/content');
  globalCsrf = getCsrf(res.data);
  globalAuthID = res.data.match(/\b\d{2}[A-Z]{3}\d{4}\b/)?.[0];
  
  return { csrfToken: globalCsrf, authorizedID: globalAuthID };
}

async function makeAuthenticatedRequest(url, payload, headers = {}) {
  const { csrfToken, authorizedID } = await getAuthData();
  
  return await client.post(url, payload, {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'X-Requested-With': 'XMLHttpRequest',
      ...headers
    }
  });
}

module.exports = {
  loginToVTOP,
  getAuthData,
  makeAuthenticatedRequest,
  client
};