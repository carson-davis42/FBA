/** Eight regions of North America, for how close a college is to an FBA team (a region, not a distance, so Honolulu is not at a disadvantage). */
export type Region = 'New England' | 'Mid-Atlantic' | 'Southeast' | 'Great Lakes' | 'Plains' | 'Southwest' | 'Mountain' | 'Pacific';

const STATES: Record<Region, string> = {
  'New England': 'CT ME MA NH RI VT',
  'Mid-Atlantic': 'NY NJ PA DE MD DC VA WV',
  Southeast: 'NC SC GA FL AL MS TN KY LA AR',
  'Great Lakes': 'OH MI IN IL WI MN ON',
  Plains: 'IA MO KS NE SD ND',
  Southwest: 'TX OK AZ NM',
  Mountain: 'CO UT ID MT WY NV',
  Pacific: 'CA OR WA HI AK BC',
};
const STATE_REGION = new Map<string, Region>(
  (Object.entries(STATES) as [Region, string][]).flatMap(([region, list]) => list.split(' ').map(s => [s, region] as const)),
);

/** Regions next to each other: a college in a neighbouring region still counts for a little. */
const NEIGHBOURS: Record<Region, Region[]> = {
  'New England': ['Mid-Atlantic'],
  'Mid-Atlantic': ['New England', 'Southeast', 'Great Lakes'],
  Southeast: ['Mid-Atlantic', 'Great Lakes', 'Plains', 'Southwest'],
  'Great Lakes': ['Mid-Atlantic', 'Southeast', 'Plains'],
  Plains: ['Great Lakes', 'Southeast', 'Southwest', 'Mountain'],
  Southwest: ['Southeast', 'Plains', 'Mountain', 'Pacific'],
  Mountain: ['Plains', 'Southwest', 'Pacific'],
  Pacific: ['Mountain', 'Southwest'],
};
export const areNeighbours = (a: Region, b: Region): boolean => NEIGHBOURS[a].includes(b);

/** The state each college is in. */
const COLLEGE_STATE: Record<string, string> = {
  Baylor: 'TX', BYU: 'UT', Houston: 'TX', 'Iowa State': 'IA', Kansas: 'KS', 'Kansas State': 'KS', Oklahoma: 'OK', 'Oklahoma State': 'OK', TCU: 'TX', Texas: 'TX', 'Texas Tech': 'TX', 'West Virginia': 'WV',
  Clemson: 'SC', Duke: 'NC', 'Florida State': 'FL', Louisville: 'KY', Miami: 'FL', 'NC State': 'NC', 'North Carolina': 'NC', 'Notre Dame': 'IN', Syracuse: 'NY', Virginia: 'VA', 'Virginia Tech': 'VA', 'Wake Forest': 'NC',
  Butler: 'IN', Creighton: 'NE', Davidson: 'NC', DePaul: 'IL', Georgetown: 'DC', Marquette: 'WI', Providence: 'RI', 'Seton Hall': 'NJ', 'St.John\'s': 'NY', UConn: 'CT', Villanova: 'PA', Xavier: 'OH',
  Alabama: 'AL', Arkansas: 'AR', Auburn: 'AL', Florida: 'FL', Georgia: 'GA', Kentucky: 'KY', LSU: 'LA', 'Mississippi State': 'MS', Missouri: 'MO', 'Ole Miss': 'MS', Tennessee: 'TN', 'Texas A&M': 'TX',
  Illinois: 'IL', Indiana: 'IN', Iowa: 'IA', Maryland: 'MD', Michigan: 'MI', 'Michigan State': 'MI', Minnesota: 'MN', Northwestern: 'IL', 'Ohio State': 'OH', 'Penn State': 'PA', Purdue: 'IN', Wisconsin: 'WI',
  Akron: 'OH', Cincinnati: 'OH', FAU: 'FL', 'Georgia Tech': 'GA', Memphis: 'TN', Rice: 'TX', SMU: 'TX', Toledo: 'OH', Tulane: 'LA', UAB: 'AL', UCF: 'FL', 'Wichita State': 'KS',
  Arizona: 'AZ', 'Arizona State': 'AZ', Colorado: 'CO', Gonzaga: 'WA', Oregon: 'OR', 'Oregon State': 'OR', Stanford: 'CA', UCLA: 'CA', USC: 'CA', Utah: 'UT', Washington: 'WA', 'Washington State': 'WA',
  'Boston College': 'MA', Buffalo: 'NY', Dayton: 'OH', 'East Carolina': 'NC', 'Loyola-Chicago': 'IL', Nebraska: 'NE', Pitt: 'PA', Rutgers: 'NJ', 'South Carolina': 'SC', 'St.Joseph\'s': 'PA', Vanderbilt: 'TN', VCU: 'VA',
  Army: 'NY', Belmont: 'TN', Colgate: 'NY', Howard: 'DC', Lehigh: 'PA', Liberty: 'VA', 'Murray State': 'KY', Navy: 'MD', 'Norfolk State': 'VA', 'Saint Mary\'s': 'CA', 'Saint Peter\'s': 'NJ', Vermont: 'VT',
  'Boston U': 'MA', Delaware: 'DE', 'Delaware State': 'DE', Drake: 'IA', 'George Washington': 'DC', 'Indiana State': 'IN', 'Middle Tennessee': 'TN', Northeastern: 'MA', 'Rhode Island': 'RI', Richmond: 'VA', UMBC: 'MD', Winthrop: 'SC',
  'Cleveland State': 'OH', Iona: 'NY', IUPUI: 'IN', 'North Dakota State': 'ND', 'Northern Kentucky': 'KY', Oakland: 'MI', 'Santa Clara': 'CA', 'South Dakota State': 'SD', 'St.Bonaventure': 'NY', 'UC Irvine': 'CA', Wofford: 'SC', 'Wright State': 'OH',
  Brown: 'RI', Cal: 'CA', Chicago: 'IL', Columbia: 'NY', Cornell: 'NY', Dartmouth: 'NH', Harvard: 'MA', MIT: 'MA', Penn: 'PA', Princeton: 'NJ', UCSB: 'CA', Yale: 'CT',
  'Abilene Christian': 'TX', 'McNeese State': 'LA', 'North Texas': 'TX', 'Oral Roberts': 'OK', 'Sam Houston State': 'TX', Samford: 'AL', Southern: 'LA', 'Stephen F Austin': 'TX', 'Texas A&M CC': 'TX', 'Texas Southern': 'TX', 'Texas State': 'TX', UTSA: 'TX',
  'Alabama State': 'AL', 'Arkansas Pine Bluff': 'AR', 'Arkansas State': 'AR', Chattanooga: 'TN', ETSU: 'TN', Furman: 'SC', 'Georgia State': 'GA', 'Grambling State': 'LA', 'Jackson State': 'MS', 'James Madison': 'VA', 'South Florida': 'FL', 'Western Kentucky': 'KY',
  'Eastern Washington': 'WA', Evansville: 'IN', 'High Point': 'NC', 'Kennesaw State': 'GA', Longwood: 'VA', Montana: 'MT', 'Montana State': 'MT', 'Portland State': 'OR', 'San Francisco': 'CA', Stetson: 'FL', 'UC San Diego': 'CA', 'Weber State': 'UT',
  'Air Force': 'CO', 'Boise State': 'ID', 'Colorado State': 'CO', 'Fresno State': 'CA', Nevada: 'NV', 'New Mexico': 'NM', 'New Mexico State': 'NM', 'San Diego State': 'CA', 'San Jose State': 'CA', UNLV: 'NV', 'Utah State': 'UT', Wyoming: 'WY',
  'Appalachian State': 'NC', 'Arkansas Little Rock': 'AR', 'Grand Canyon': 'AZ', 'Kent State': 'OH', 'Morehead State': 'KY', 'Northern Illinois': 'IL', Ohio: 'OH', Omaha: 'NE', 'Saint Louis': 'MO', 'SIU Edwardsville': 'IL', 'Southeastern Missouri State': 'MO', Troy: 'AL',
  Bryant: 'RI', Duquesne: 'PA', 'Fairleigh Dickinson': 'NJ', 'George Mason': 'VA', Lipscomb: 'TN', 'Long Island': 'NY', Marist: 'NY', Quinnipiac: 'CT', 'Robert Morris': 'PA', UMass: 'MA', 'UNC Asheville': 'NC', 'UNC Wilmington': 'NC',
};

const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9&]/g, '');
const COLLEGE_REGION = new Map<string, Region>(Object.entries(COLLEGE_STATE).map(([name, st]) => [key(name), STATE_REGION.get(st)!]));
/** Spellings the bios use that differ from a college's name here. */
const COLLEGE_ALIAS: Record<string, string> = { lousiville: 'louisville', pittsburgh: 'pitt' };

/** The region of a college by name (bio spellings too), or null for an unknown school. */
export function collegeRegion(name: string): Region | null {
  const k = key(name);
  return COLLEGE_REGION.get(COLLEGE_ALIAS[k] ?? k) ?? null;
}

const FULL_STATE: Record<string, string> = {
  Connecticut: 'CT', Maine: 'ME', Massachusetts: 'MA', 'New Hampshire': 'NH', 'Rhode Island': 'RI', Vermont: 'VT', 'New York': 'NY', 'New Jersey': 'NJ', Pennsylvania: 'PA', Delaware: 'DE', Maryland: 'MD',
  Virginia: 'VA', 'West Virginia': 'WV', 'North Carolina': 'NC', 'South Carolina': 'SC', Georgia: 'GA', Florida: 'FL', Alabama: 'AL', Mississippi: 'MS', Tennessee: 'TN', Kentucky: 'KY', Louisiana: 'LA', Arkansas: 'AR',
  Ohio: 'OH', Michigan: 'MI', Indiana: 'IN', Illinois: 'IL', Wisconsin: 'WI', Minnesota: 'MN', Ontario: 'ON', Iowa: 'IA', Missouri: 'MO', Kansas: 'KS', Nebraska: 'NE', 'South Dakota': 'SD', 'North Dakota': 'ND',
  Texas: 'TX', Oklahoma: 'OK', Arizona: 'AZ', 'New Mexico': 'NM', Colorado: 'CO', Utah: 'UT', Idaho: 'ID', Montana: 'MT', Wyoming: 'WY', Nevada: 'NV', California: 'CA', Oregon: 'OR', Washington: 'WA', Hawaii: 'HI', Alaska: 'AK', BC: 'BC',
};

/** The region of an FBA franchise from its city text ("Atlanta, Georgia", "Toronto, Ontario, Canada", "Washington DC, USA"). */
export function cityRegion(city: string): Region | null {
  const parts = city.split(',').map(p => p.trim());
  if (/^Washington DC/i.test(parts[0])) return STATE_REGION.get('DC') ?? null;
  for (const part of [...parts].reverse()) {
    const st = FULL_STATE[part];
    if (st) return STATE_REGION.get(st) ?? null;
  }
  return null;
}
