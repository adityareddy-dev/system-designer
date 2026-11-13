import assert from 'node:assert/strict';
import { countryDefaults, bannerTimeZone } from '../assets/consent-region.js';
for (const cc of 'AT BE BG HR CY CZ DK EE FI FR DE GR HU IE IT LV LT LU MT NL PL PT RO SK SI ES SE IS LI NO GB CH CA BR'.split(' ')) assert.equal(countryDefaults(cc).marketingDefault, false, cc);
for (const cc of ['AX', 'GF', 'GP', 'MQ', 'RE', 'YT', 'MF']) {
  assert.equal(countryDefaults(cc).marketingDefault, false, cc);
  assert.equal(countryDefaults(cc).analyticsDefault, false, cc);
}
for (const cc of ['US', 'IN', 'AU', 'JP', 'ZA']) assert.equal(countryDefaults(cc).marketingDefault, true, cc);
for (const cc of [null, '', 'XX', 'T1', 'invalid']) assert.equal(countryDefaults(cc).marketingDefault, false, String(cc));
for (const tz of ['Europe/London', 'Europe/Berlin', 'Atlantic/Reykjavik', 'Atlantic/Canary', 'Atlantic/Madeira', 'Atlantic/Azores', 'Asia/Nicosia', 'Asia/Famagusta', 'Arctic/Longyearbyen', 'America/Coral_Harbour', 'Canada/Eastern', 'America/Toronto', 'America/Vancouver', 'America/St_Johns', 'America/Glace_Bay', 'America/Atikokan', 'America/Resolute', 'America/Sao_Paulo', 'America/Manaus', 'America/Noronha', 'Brazil/East']) assert.equal(bannerTimeZone(tz), true, tz);
for (const tz of ['America/Chicago', 'Asia/Kolkata', 'Australia/Sydney']) assert.equal(bannerTimeZone(tz), false, tz);
for (const tz of ['America/Cayenne', 'America/Guadeloupe', 'America/Martinique', 'America/Marigot', 'Indian/Reunion', 'Indian/Mayotte']) assert.equal(bannerTimeZone(tz), true, tz);
console.log('Consent countries and browser time zones passed.');
