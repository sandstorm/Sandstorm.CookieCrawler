const fs = require('fs');
const puppeteer = require('puppeteer');
const url = process.argv[2];
if (!url) {
    throw "Please provide URL as a first argument";
}

if (!fs.existsSync('results')){
    fs.mkdirSync('results');
}

function delay(time) {
    return new Promise(function (resolve) {
        setTimeout(resolve, time)
    });
}

async function cookies() {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    await page.goto(url);
    await delay(15000);
    //await page.screenshot({ path: 'screenshot.png' });
    const cookieData = await page._client.send('Network.getAllCookies');
    const localStorageData = await page.evaluate(() => {
        let keys = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          keys.push(key);
        }
        return keys;
    });

    console.log("Cookies: found " + (cookieData.cookies.length || 0));
    console.log("localStorage Items: found " + (localStorageData.length || 0));

    fs.writeFileSync(`results/${url.replace(/[^a-zA-Z ]/g, "")}.json`, JSON.stringify({
        cookieData: cookieData.cookies, 
        localStorageData: localStorageData
    }, null, 4));

    browser.close();
}

cookies();