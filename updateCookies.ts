import {get} from 'https';
import * as fs from 'fs';
import {parse} from 'csv-parse/sync';
import {CookieNameDetails} from "./types";

const OPEN_COOKIE_DATABASE = "https://raw.githubusercontent.com/jkwakman/Open-Cookie-Database/master/open-cookie-database.csv";
const OPEN_COOKIE_DATABASE_FILE_NAME = "open-cookie-database.csv"

get(OPEN_COOKIE_DATABASE,(res) => {
	// Image will be stored at this path
	const path = `${__dirname}/${OPEN_COOKIE_DATABASE_FILE_NAME}`;
	const filePath = fs.createWriteStream(path);
	res.pipe(filePath);
	filePath.on('finish',() => {
		filePath.close();
		console.log('Download Completed');
		processCSV();
	})
});

processCSV();

function processCSV(){
	const rawCSV = fs.readFileSync(OPEN_COOKIE_DATABASE_FILE_NAME, 'utf8');
	const parsedCSV = parse(rawCSV, {
		columns: true,
		skip_empty_lines: true
	});
	const cookieTranslations = parsedCSV.reduce((acc: CookieNameDetails, current: {[key: string]: {}}) => {
		const name = current["Cookie / Data Key name"];
		return {
			...acc,
			[`${name}`]: {
				// we do not need all information as we already get some by
				// crawling.
				"platform": current["Platform"],
				"category": current["Category"],
				"description": current["Description"],
			}
		}
	}, {});
	fs.writeFile('translations/en.generated.json', JSON.stringify(cookieTranslations, null, 2), function (err) {
		if (err) return console.log(err);
		console.log('DONE');
	});
}

