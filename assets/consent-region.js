// Country choices shared by the service and the cookie banner.
const OPT_IN_COUNTRIES = new Set('AT BE BG HR CY CZ DK EE FI FR DE GR HU IE IT LV LT LU MT NL PL PT RO SK SI ES SE IS LI NO GB CH CA BR AX GF GP MQ RE YT MF'.split(' '));
const CANADA = new Set('Atikokan Coral_Harbour Blanc-Sablon Cambridge_Bay Creston Dawson Dawson_Creek Edmonton Fort_Nelson Glace_Bay Goose_Bay Halifax Inuvik Iqaluit Moncton Montreal Nipigon Pangnirtung Rainy_River Rankin_Inlet Regina Resolute St_Johns Swift_Current Thunder_Bay Toronto Vancouver Whitehorse Winnipeg Yellowknife'.split(' '));
const BRAZIL = new Set('Araguaina Bahia Belem Boa_Vista Campo_Grande Cuiaba Eirunepe Fortaleza Maceio Manaus Noronha Porto_Acre Porto_Velho Recife Rio_Branco Santarem Sao_Paulo'.split(' '));
export function countryDefaults(value) {
  const country = typeof value === 'string' && /^[A-Z]{2}$/.test(value) && value !== 'XX' ? value : 'XX';
  const granted = country !== 'XX' && !OPT_IN_COUNTRIES.has(country);
  return { country, marketingDefault: granted, analyticsDefault: granted };
}
export function bannerTimeZone(zone) {
  if (typeof zone !== 'string' || !zone || zone === 'UTC' || zone === 'Etc/Unknown') return true;
  if (zone.startsWith('Europe/') || ['Atlantic/Reykjavik', 'Atlantic/Azores', 'Atlantic/Madeira', 'Atlantic/Canary', 'Arctic/Longyearbyen', 'Asia/Nicosia', 'Asia/Famagusta', 'America/Cayenne', 'America/Guadeloupe', 'America/Martinique', 'America/Marigot', 'Indian/Reunion', 'Indian/Mayotte'].includes(zone) || zone.startsWith('Canada/') || zone.startsWith('Brazil/')) return true;
  const [area, name] = zone.split('/');
  return area === 'America' && (CANADA.has(name) || BRAZIL.has(name));
}
