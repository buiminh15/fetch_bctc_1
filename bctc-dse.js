const axios = require('axios');
const cheerio = require('cheerio');
const { sendTelegramNotification } = require('./bot');
const { COMPANIES } = require('./constants/companies');
const { insertBCTC, filterNewNames } = require('./bctc');
const he = require('he');
console.log('📢 [bctc-cdn.js:7]', 'running');

const axiosRetry = require('axios-retry');

axiosRetry.default(axios, {
  retries: 3,
  retryDelay: axiosRetry.exponentialDelay,
  retryCondition: (error) => {
    // Retry nếu là network error, request idempotent, hoặc timeout
    return axiosRetry.isNetworkOrIdempotentRequestError(error) || error.code === 'ECONNABORTED';
  }
});

async function fetchAndExtractData() {
  try {
    const response = await axios.get('https://ir.dnse.com.vn/common/public-category/load-content?id=73', {
      headers: {
        'accept': 'text/html',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
      },
      timeout: 60000
    });

    const html = response.data;
    const $ = cheerio.load(html);
    const currentYear = new Date().getFullYear().toString();
    // Lấy tối đa 5 báo cáo mới nhất
    const names = [];
    $('.row > .item-col').each(function () {
      const quarter = $(this).find('h3.quarter-title').text().trim();
      $(this).find('ul li a').each(function () {
        const linkText = $(this).find('span.text-dark').text().trim();
        names.push(`${quarter}-${linkText}`);
      });
    });

    if (names.length === 0) {
      console.log('Không tìm thấy báo cáo tài chính nào.');
      return;
    }
    console.log('📢 [bctc-mbs.js:50]', names);
    // Lọc ra các báo cáo chưa có trong DB
    const newNames = await filterNewNames(names, COMPANIES.DSE);
    console.log('📢 [bctc-cdn.js:46]', newNames);
    if (newNames.length) {
      await insertBCTC(newNames, COMPANIES.DSE);

      // Gửi thông báo Telegram cho từng báo cáo mới
      await Promise.all(
        newNames.map(name => {
          return sendTelegramNotification(`Báo cáo tài chính của DSE ::: ${name}`);
        })
      );
      console.log(`Đã thêm ${newNames.length} báo cáo mới và gửi thông báo.`);
    } else {
      console.log('Không có báo cáo mới.');
    }
  } catch (error) {
    console.error('Error fetching HTML:', error);
    process.exit(1);
  }
}

fetchAndExtractData();