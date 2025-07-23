const axios = require('axios');
const { sendTelegramNotification } = require('./bot');
const { COMPANIES } = require('./constants/companies');
const { insertBCTC, filterNewNames } = require('./bctc');
console.log('📢 [bctc-geg.js:5]', 'running');

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
    const response = await axios.post(
      'https://api.iseebooks.vn//api/article/search',
      {
        page: 1,
        pageSize: 10,
        home_flag: true,
        article_title: "",
        article_type_rid: "99cd5537-9fef-4faa-97ea-7f499352a5cf"
      },
      {
        headers: {
          'Accept': 'application/json',
          'Accept-Language': 'en-US,en;q=0.9',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'Content-Type': 'application/json',
          'Origin': 'https://iseebooks.vn',
          'Pragma': 'no-cache',
          'Referer': 'https://iseebooks.vn/',
          'Sec-Fetch-Dest': 'empty',
          'Sec-Fetch-Mode': 'cors',
          'Sec-Fetch-Site': 'same-site',
          'Sec-GPC': '1',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
          'sec-ch-ua': '"Not)A;Brand";v="8", "Chromium";v="138", "Brave";v="138"',
          'sec-ch-ua-mobile': '?0',
          'sec-ch-ua-platform': '"Windows"'
        }
      }
    );

    const currentYear = new Date().getFullYear().toString();
    // response.data là object JSON, thường có dạng { data: [ ... ], ... }
    const items = response.data.Data || [];

    const names = items.filter(item => item.article_title && item.article_title.trim().toLowerCase().includes(currentYear)).map(item => item.article_title && item.article_title.trim()).filter(Boolean);

    if (names.length === 0) {
      console.log('Không tìm thấy báo cáo tài chính nào.');
      return;
    }

    // Lọc ra các báo cáo chưa có trong DB
    const newNames = await filterNewNames(names, COMPANIES.GEG);
    console.log('📢 [bctc-geg.js:44]', newNames);
    if (newNames.length) {
      await insertBCTC(newNames, COMPANIES.GEG);

      // Gửi thông báo Telegram cho từng báo cáo mới
      await Promise.all(
        newNames.map(name =>
          sendTelegramNotification(`Báo cáo tài chính của GEG::: ${name}`)
        )
      );
      console.log(`Đã thêm ${newNames.length} báo cáo mới và gửi thông báo.`);
    } else {
      console.log('Không có báo cáo mới.');
    }
  } catch (error) {
    console.error('Error fetching API:', error.message);
    process.exit(1);
  }
}

fetchAndExtractData();