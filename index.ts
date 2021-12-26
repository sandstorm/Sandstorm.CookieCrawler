import * as fs from "fs";
import {chromium, Browser, Page} from "playwright";
import {cpuUsage} from 'os-utils';
import {MD5} from "crypto-js";
import {parseStringPromise} from "xml2js";
import got from "got";
const args = require('minimist')(process.argv.slice(2))
const humanizeDuration = require("humanize-duration");

import enGenerated from "./translations/en.generated.json";
import {CrawlerResults, CrawlerResultType} from "./types";

// DEFAULTS
const DEFAULT_TRANSLATIONS = ["de","en"];
const INITIAL_CHUNK_SIZE = 10; // how many urls will be processed at once
const MAX_CPU_USAGE = 0.9;
const HEADLESS = true;
// AGRGs
// `yarn run start https://sandstorm.de/sitemap.xml`
const sitemapUrl: string | null = args._[0];
// `yarn run start https://sandstorm.de/sitemap.xml --consent ".cm-btn-accept-all"`
const consentButtonSelector: string | null = args.consent;

console.log(sitemapUrl, consentButtonSelector);


// Autoscaling
let currentChunkSize: number = INITIAL_CHUNK_SIZE;
let lastCPUUsages: number[] = [];

// Checking ARGs
if (!sitemapUrl) {
    throw "Please provide Sitemap URL as a first argument";
}

// Creating folder structure
if (!fs.existsSync('results')){
    fs.mkdirSync('results');
}

// For collecting results
const crawlerResults: CrawlerResults = {};

// LETS GO
(async () => {
    const sitemapXML = await got(sitemapUrl);
    const sitemapJson = await parseStringPromise(sitemapXML.body);
    let urls: string[] = sitemapJson.urlset.url.map( (entry: any) => {
        return entry.loc[0];
    });

    const browser = await chromium.launch({
        headless: HEADLESS,
    });

    while(urls.length > 0) {
        await updateCurrentChunkSize();
        const currentChunk = urls.splice(0, currentChunkSize + 1);
        await console.log(`Working an new Chunk with length ${currentChunk.length}`);
        await processChunk(currentChunk, browser);
        await console.log(`Finished with Chunk`);
    }

    fs.writeFileSync(`results/${sitemapUrl}.json`, JSON.stringify(crawlerResults, null, 2));
    console.log(`FOUND ${Object.keys(crawlerResults).length} items (cookies, local storage entries).`);
})();

function updateCurrentChunkSize(){
    const cpuUsage = avgCPUUsage();
    if(cpuUsage <= MAX_CPU_USAGE) {
        if(cpuUsage <= 0.9) {
            currentChunkSize += 15;
        } else {
            currentChunkSize += 5;
        }
    } else {
        currentChunkSize -= 1;
    }
    resetLastCPUUsages();
}

function avgCPUUsage(){
    const length = lastCPUUsages.length;
    return lastCPUUsages.reduce((acc, current) => {
        return acc + current;
    }, 0) / length;
}

function resetLastCPUUsages(){
    lastCPUUsages = [];
}

function addCPUUsage() {
    cpuUsage((v) => {
        lastCPUUsages.push(v);
    });
}

async function processChunk(urls: string[], browser: Browser) {
    const cookiePromises: Promise<void>[] = [];
    for(let url of urls) {
        // running parallel
        cookiePromises.push(processPage(browser, url));
    }
    // but waiting for the chunk to finish before processing the next
    await Promise.all(cookiePromises);
}

async function processPage(browser: Browser, url: string) {
    const timestamp = await Date.now();
    // We create a new context for each url which does not have any cookies set so far
    // We also consent again for each page. This makes the code more robust when running
    // in parallel. A speed improvement by reusing a session is dwarfed by processing
    // pages in parallel.
    const context = await browser.newContext();
    const page = await context.newPage();

    // TODO: maybe later -> disable loading images -> might prevent iframes from setting cookies as they will break
    // happened for Vimeo and Youtube
    // await page.route('**/*', (route) => {
    //     return route.request().resourceType() === 'image'
    //         ? route.abort()
    //         : route.continue()
    // });

    // increased timeout, as some pages will take some time to load. This also depends on the time
    // of the day the pages is crawled.
    await page.goto(url, {timeout: 60000});

    addCPUUsage(); // adding measurements to later calculate avg

    if(consentButtonSelector) {
        const isCookieConsentOpen = await page.isVisible(consentButtonSelector);
        if(isCookieConsentOpen) {
            await page.click(consentButtonSelector);
        }
    }

    const pageProcessedAt = Date.now();

    addCPUUsage();// adding measurements to later calculate avg

    await page.waitForLoadState();
    await page.waitForLoadState("networkidle");

    await processCookies(page, pageProcessedAt);
    await processOrigins(page);

    await console.log(`${url} --> took ${Date.now() - timestamp}ms`);
    addCPUUsage(); // adding measurements to later calculate avg
    context.close();
}

async function processCookies(page: Page, processedAt: number) {
    const storageState = await page.context().storageState();

    storageState.cookies.forEach((cookie) => {
        const key = generateKeyForResult("cookie", cookie.domain, cookie.name);
        if(!crawlerResults[key]) {
            // expiresTimestamp timestamp in milliseconds
            // we let the crawler figure out when a cookie expires
            // this way we do not have to keep this information elsewhere
            const newExpiresTimestamp = cookie.expires > 0 ?
                cookie.expires * 1000 - processedAt:
                cookie.expires;
            crawlerResults[key] = {
                type: "cookie",
                name: cookie.name,
                domain: cookie.domain,
                path: cookie.path,
                count: 1,
                expiresTimestamp: newExpiresTimestamp,
                expiresReadable: getReadableDuration(newExpiresTimestamp),
                urls: [page.url()],
                translations: {en: enGenerated[cookie.name]}
            }
        } else {
            crawlerResults[key].count += 1;
            crawlerResults[key].urls.push(page.url());
        }
    })
}

// we currently support `localStorage`
async function processOrigins(page: Page) {
    const storageState = await page.context().storageState();
    storageState.origins.forEach(origin => {
        // this is the url that added the entry
        const originName = origin.origin;

        // TODO: Check -> Not sure if an origin can be more than a localStorage entry?
        // we should probably also crawl for sessionStorage entries, etc. if we want to get
        // all data that was persisted in the browser.
        origin.localStorage.forEach(localStorageEntry => {
            const key = generateKeyForResult("localStorage", originName, localStorageEntry.name);
            if(!crawlerResults[key]) {
                crawlerResults[key] = {
                    type: "localStorage",
                    origin: originName,
                    name: localStorageEntry.name,
                    count: 1,
                    urls: [page.url()],
                    translations: {en: enGenerated[localStorageEntry.name]}
                }
            } else {
                crawlerResults[key].count += 1;
                crawlerResults[key].urls.push(page.url());
            }
        });
    })
}

// As we open each page with a fresh context, we will not accumulate cookies until the end
// of the crawling but will get cookies over and over again. With the key we can decide
// if we have already seen a cookie.
// We will has a sting like this -> "cookiehttp://example.org_gat"
function generateKeyForResult(type: CrawlerResultType, origin: string, key: string) {
    return MD5(type + origin + key).toString();
}

// expiresTimestamp timestamp in milliseconds
function getReadableDuration(duration: number): {[lang: string]: string} {
    if(duration > 0) {
        return DEFAULT_TRANSLATIONS.reduce((acc, current) => {
            return {...acc, [current]: humanizeDuration(Math.floor(duration + 2), { largest: 1, round: true, language: current })};
        }, {})
    } else {
        // if no expiresTimestamp is set -1 will be returned, meaning the cookie will only live
        // for the time of the session
        return { en: "Session", de: "Session" };
    }
}
