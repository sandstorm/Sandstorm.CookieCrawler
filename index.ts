import {parseStringPromise} from "xml2js";
import got from "got";
import * as fs from "fs";
import {chromium, Cookie, Browser, ElementHandle} from "playwright";
const humanizeDuration = require("humanize-duration");

const CHUNK_SIZE = 10;
const HEADLESS = true;
//const CONSENT_BUTTON_SELECTOR = ".cm-btn-accept-all"
const CONSENT_BUTTON_SELECTOR = ".cn-ok .cm-btn-success"

async function waitFor(duration: number) {
    return new Promise((resolve) => {
        setTimeout(resolve, duration);
    });
}

type CookieCrawlerResult = {
    [key: string]: {
        name: string,
        domain: string,
        path: string,
        duration: number,
        durationReadable?: string,
        count: number,
        urls: string[]
    }
}

type WrappedCookie = {
    // ms
    crawledAt: number
    cookie: Cookie
    foundForUrl: string
}

const sitemapUrl = process.argv[2];

if (!sitemapUrl) {
    throw "Please provide Sitemap URL as a first argument";
}

if (!fs.existsSync('results')){
    fs.mkdirSync('results');
}

const cookieCrawlerResult: CookieCrawlerResult = {};

(async () => {
    const sitemapXML = await got(sitemapUrl);
    const sitemapJson = await parseStringPromise(sitemapXML.body);
    let urls: string[] = sitemapJson.urlset.url.map( (entry: any) => {
        return entry.loc[0];
    })

    const urlChunks = ((urls: string[])=>{
        let result = []
        let arrayCopy = [...urls]
        while (arrayCopy.length > 0) {
            result.push(arrayCopy.splice(0, CHUNK_SIZE))
        }
        return result
    })(urls);

    const browser = await chromium.launch({
        headless: HEADLESS,
    });

    let allWrappedCookies: WrappedCookie[] = [];

    for(let i=0; i<urlChunks.length; i++) {
        await console.log(`Starting with Chunk ${i+1} of ${urlChunks.length}`);
        allWrappedCookies = [...allWrappedCookies, ...await processChunk(urlChunks[i], browser)];
        await console.log(`Finished with Chunk ${i+1} of ${urlChunks.length}`);
    }

    allWrappedCookies.forEach(wrappedCookie => {
        addCookieResult(wrappedCookie);
    })

    console.log(cookieCrawlerResult);
    console.log(Object.keys(cookieCrawlerResult));
})();

async function processChunk(urls: string[], browser: Browser): Promise<WrappedCookie[]> {
    const cookiePromises: Promise<WrappedCookie[]>[] = [];

    for(let url of urls) {
        // running parallel
        // speed improvement 5x
        cookiePromises.push(processPage(browser, url));
    }
    return Promise.all(cookiePromises).then((result) => {
        return result.flat();
    });
}

async function processPage(browser: Browser, url: string): Promise<WrappedCookie[]> {
    const timestamp = await Date.now();
    const context = await browser.newContext();
    const page = await context.newPage();
    // disable loading images
    // speed improvement 2x
    // await page.route('**/*', (route) => {
    //     return route.request().resourceType() === 'image'
    //         ? route.abort()
    //         : route.continue()
    // });
    await page.goto(url, {timeout: 60000});
    const isCookieConsentOpen = await page.isVisible(CONSENT_BUTTON_SELECTOR);
    if(isCookieConsentOpen) {
        await page.click(CONSENT_BUTTON_SELECTOR);
    }

    await page.waitForLoadState();
    await page.waitForLoadState("networkidle");

    // await page.route('**/*', (route) => {
    //     console.log(route.request().resourceType());
    // });

    // const iFrames = await page.$$("iframe");
    // for(let iFrame of iFrames) {
    //     await iFrame.hover({force: true});
    //     const contentFrame = await iFrame?.contentFrame();
    //     if(contentFrame) {
    //         const button = await contentFrame.$(".ytp-large-play-button");
    //         if (button) {
    //             await button.hover({force: true});
    //             await waitFor(1000);
    //             await button.click({force: true});
    //             await waitFor(1000);
    //         }
    //     }
    // }

    const crawledAt = Date.now();
    const cookies = await page.context().cookies();
    await console.log(`${url} --> took ${Date.now() - timestamp}ms`);
    context.close();
    return cookies.map(cookie => {
        return {
            cookie,
            crawledAt,
            foundForUrl: url
        }
    });
}

function addCookieResult(wrappedCookie: WrappedCookie ) {
    const id = getCookieId(wrappedCookie.cookie);
    const newDuration = wrappedCookie.cookie.expires > 0 ?
        wrappedCookie.cookie.expires*1000 - wrappedCookie.crawledAt:
        wrappedCookie.cookie.expires;

    const alreadyCrawledCookie = cookieCrawlerResult[id];
    if(!alreadyCrawledCookie) {
        cookieCrawlerResult[id] = {
            name: wrappedCookie.cookie.name,
            domain: wrappedCookie.cookie.domain,
            path: wrappedCookie.cookie.path,
            count: 1,
            duration: newDuration,
            durationReadable: getReadableDuration(newDuration),
            urls: [wrappedCookie.foundForUrl]
        }
    } else {
        alreadyCrawledCookie.duration = Math.max(alreadyCrawledCookie.duration, newDuration);
        alreadyCrawledCookie.count = alreadyCrawledCookie.count + 1;
        alreadyCrawledCookie.urls = [...alreadyCrawledCookie.urls, wrappedCookie.foundForUrl];
        alreadyCrawledCookie.durationReadable = getReadableDuration(alreadyCrawledCookie.duration);
    }
}

function getCookieId(cookie: Cookie) {
    return `${cookie.name}-${cookie.domain}-${cookie.path}-${cookie.sameSite}`;
}

function getReadableDuration(duration: number) {
    return humanizeDuration(Math.floor(duration), { largest: 1, round: true });
}
