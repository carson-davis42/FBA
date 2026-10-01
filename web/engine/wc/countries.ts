/** D2 teamId -> fbawc teamId (the country the city is in). */
export const CITY_COUNTRY: Record<string, string> = {
  SJ: 'USA', MIA: 'USA', AUS: 'USA', OMA: 'USA', TAM: 'USA',
  EDM: 'CAN', OTT: 'CAN',
  MC: 'MEX', GUAD: 'MEX',
  REC: 'BRA', RIO: 'BRA', SP: 'BRA',
  BA: 'ARG',
  LON: 'ENG', LIV: 'ENG', MAN: 'ENG',
  EDI: 'SCOT', GLAS: 'SCOT',
  BEL: 'NI',
  DUB: 'IRE',
  PAR: 'FRA', LYON: 'FRA',
  MAD: 'SPA', BARC: 'SPA',
  ROME: 'ITA', MIL: 'ITA', NAP: 'ITA', FLO: 'ITA',
  BER: 'GER', FRAN: 'GER', HAM: 'GER', MUN: 'GER',
  AMS: 'NET', ROT: 'NET',
  BRUS: 'BEL',
  LUX: 'LUX',
  ZUR: 'SWIS',
  VIE: 'ARA', SALZ: 'ARA',
  BUD: 'HUN',
  ZAG: 'CRO',
  ATH: 'GRE',
  WAR: 'POL',
  KIEV: 'UKR',
  MOS: 'RUS', STP: 'RUS',
  COP: 'DEN',
  OSL: 'NOR',
  STO: 'SWE',
  LIS: 'PORT',
  IST: 'TUR',
  DBA: 'UAE',
  CAI: 'EGY',
  CAS: 'MOR',
  LAG: 'NIG',
  JOH: 'SA',
  MUM: 'IND',
  DHA: 'BANG',
  BEI: 'CHI', SHAN: 'CHI',
  TOK: 'JAP', OSA: 'JAP',
  SYD: 'AUS',
  ACK: 'NZ',
}

export function d2CitiesOf(countryId: string): string[] {
  return Object.keys(CITY_COUNTRY)
    .filter((k) => CITY_COUNTRY[k] === countryId)
    .sort()
}
