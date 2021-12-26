# Sandstorm Cookie Crawler

This repo is currently WIP.

## The goal

We are aiming for a pragmatic approach for updating the cookie listing in the privacy statement of a webpage. 

For now we want the crawler to create a json file containing that information. This file can then be part of the next deployment and the cookie listing will be updated accordingly.

We also plan to provide a Neos plugin so the editor can place the listing anywhere on the page.

So stay tuned ;)

If you have any ideas or want to contribute please get in touch.

## Install

`mvm use && yarn`

## Start

`yarn run start https://some-url.com/sitemap.xml --consent ".cm-btn-accept-all"`

## Updating Cookie Descriptions

`yarn run update:cookies`

## Thoughts / Further development

### High Priority

* Neos Plugin as a separate repo to display Cookies in the data privacy statement
* some mechanism to add custom descriptions that will override the already provided ones
* some mechanism to provide cookies and local storage items manually in a different file that will we merged with the crawled result -> manually provide information will override crawled information
  * a simple feature to get cookies documented, that only show up behind a login
  * the crawler currently misses cookies that are set on interaction with an iframe -> this might be a temporary solution
* some mechanism to automatically translate cookie information -> should be a step of `yarn run update:cookies` -> Why should anybody need to translate this information? -> try some translation APIs

### Low Priority

* some mechanisms to crawl cookies behind a login
* mechanism to add additional cookies to a crawler result if one was found -> maybe an elegant way to add cookies that would normally be added on interaction -> e.g. add additional Youtube cookies if one "trigger" Cookie is present

## Cookie-Details

Please support: https://github.com/jkwakman/Open-Cookie-Database and add details there.
