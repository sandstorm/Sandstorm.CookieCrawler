export type CookieNameDetail = {
	platform: string,
	category: string,
	description: string
}

export type CookieNameDetails = {
	[cookieName: string]: CookieNameDetail
}

export type CrawlerResultType = "cookie"|"localStorage" | "3rdPartyUrl";

export type CrawlerCookieResult = {
	type: "cookie",
	name: string,
	domain: string,
	path: string,
	expiresTimestamp: number,
	expiresReadable: {[lang: string]: string},
	count: number,
	urls: string[],
	translations: {[lang: string]: CookieNameDetail} | null
}


export type Crawler3rdPartyResult = {
	type: "3rdPartyUrl",
	origin: string,
	href: string,
	count: number,
	urls: string[],
}

export type CrawlerLocalStorageResult = {
	type: "localStorage",
	name: string,
	origin: string,
	count: number,
	urls: string[],
	translations: {[lang: string]: CookieNameDetail} | null
}

export type CrawlerResults = {
	[key: string]: CrawlerCookieResult | CrawlerLocalStorageResult | Crawler3rdPartyResult
}
