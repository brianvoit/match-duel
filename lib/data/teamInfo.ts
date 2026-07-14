export const TEAM_INFO: Record<string, { flag: string; code: string }> = {
  // ── Americas ────────────────────────────────────────────────────────────────
  'United States':            { flag: '🇺🇸', code: 'USA' },
  'USA':                      { flag: '🇺🇸', code: 'USA' },  // API-Football alias
  'Mexico':                   { flag: '🇲🇽', code: 'MEX' },
  'Canada':                   { flag: '🇨🇦', code: 'CAN' },
  'Brazil':                   { flag: '🇧🇷', code: 'BRA' },
  'Argentina':                { flag: '🇦🇷', code: 'ARG' },
  'Colombia':                 { flag: '🇨🇴', code: 'COL' },
  'Ecuador':                  { flag: '🇪🇨', code: 'ECU' },
  'Uruguay':                  { flag: '🇺🇾', code: 'URU' },
  'Chile':                    { flag: '🇨🇱', code: 'CHI' },
  'Peru':                     { flag: '🇵🇪', code: 'PER' },
  'Paraguay':                 { flag: '🇵🇾', code: 'PAR' },
  'Venezuela':                { flag: '🇻🇪', code: 'VEN' },
  'Bolivia':                  { flag: '🇧🇴', code: 'BOL' },
  'Panama':                   { flag: '🇵🇦', code: 'PAN' },
  'Costa Rica':               { flag: '🇨🇷', code: 'CRC' },
  'Honduras':                 { flag: '🇭🇳', code: 'HON' },
  'Jamaica':                  { flag: '🇯🇲', code: 'JAM' },
  'Trinidad and Tobago':      { flag: '🇹🇹', code: 'TTO' },
  'Cuba':                     { flag: '🇨🇺', code: 'CUB' },
  'Haiti':                    { flag: '🇭🇹', code: 'HAI' },
  'Guatemala':                { flag: '🇬🇹', code: 'GUA' },
  'El Salvador':              { flag: '🇸🇻', code: 'SLV' },
  'Curaçao':                  { flag: '🇨🇼', code: 'CUW' },
  // ── Europe ──────────────────────────────────────────────────────────────────
  'France':                   { flag: '🇫🇷', code: 'FRA' },
  'Spain':                    { flag: '🇪🇸', code: 'ESP' },
  'Germany':                  { flag: '🇩🇪', code: 'GER' },
  'England':                  { flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', code: 'ENG' },
  'Portugal':                 { flag: '🇵🇹', code: 'POR' },
  'Netherlands':              { flag: '🇳🇱', code: 'NED' },
  'Belgium':                  { flag: '🇧🇪', code: 'BEL' },
  'Italy':                    { flag: '🇮🇹', code: 'ITA' },
  'Croatia':                  { flag: '🇭🇷', code: 'CRO' },
  'Serbia':                   { flag: '🇷🇸', code: 'SRB' },
  'Switzerland':              { flag: '🇨🇭', code: 'SUI' },
  'Austria':                  { flag: '🇦🇹', code: 'AUT' },
  'Denmark':                  { flag: '🇩🇰', code: 'DEN' },
  'Poland':                   { flag: '🇵🇱', code: 'POL' },
  'Scotland':                 { flag: '🏴󠁧󠁢󠁳󠁣󠁴󠁿', code: 'SCO' },
  'Wales':                    { flag: '🏴󠁧󠁢󠁷󠁬󠁳󠁿', code: 'WAL' },
  'Czech Republic':           { flag: '🇨🇿', code: 'CZE' },
  'Czechia':                  { flag: '🇨🇿', code: 'CZE' },  // FIFA official name
  'Slovenia':                 { flag: '🇸🇮', code: 'SVN' },
  'Slovakia':                 { flag: '🇸🇰', code: 'SVK' },
  'Romania':                  { flag: '🇷🇴', code: 'ROU' },
  'Hungary':                  { flag: '🇭🇺', code: 'HUN' },
  'Ukraine':                  { flag: '🇺🇦', code: 'UKR' },
  'Turkey':                   { flag: '🇹🇷', code: 'TUR' },
  'Türkiye':                  { flag: '🇹🇷', code: 'TUR' },  // FIFA official name
  'Albania':                  { flag: '🇦🇱', code: 'ALB' },
  'Sweden':                   { flag: '🇸🇪', code: 'SWE' },
  'Norway':                   { flag: '🇳🇴', code: 'NOR' },
  'Greece':                   { flag: '🇬🇷', code: 'GRE' },
  'Bosnia and Herzegovina':   { flag: '🇧🇦', code: 'BIH' },
  'Bosnia & Herzegovina':     { flag: '🇧🇦', code: 'BIH' },  // API-Football alias
  'Georgia':                  { flag: '🇬🇪', code: 'GEO' },
  'Iceland':                  { flag: '🇮🇸', code: 'ISL' },
  'Finland':                  { flag: '🇫🇮', code: 'FIN' },
  'Bulgaria':                 { flag: '🇧🇬', code: 'BUL' },
  // ── Africa ──────────────────────────────────────────────────────────────────
  'Morocco':                  { flag: '🇲🇦', code: 'MAR' },
  'Senegal':                  { flag: '🇸🇳', code: 'SEN' },
  'Nigeria':                  { flag: '🇳🇬', code: 'NGA' },
  'Egypt':                    { flag: '🇪🇬', code: 'EGY' },
  'Cameroon':                 { flag: '🇨🇲', code: 'CMR' },
  'Algeria':                  { flag: '🇩🇿', code: 'ALG' },
  'Tunisia':                  { flag: '🇹🇳', code: 'TUN' },
  'Ivory Coast':              { flag: '🇨🇮', code: 'CIV' },
  "Côte d'Ivoire":            { flag: '🇨🇮', code: 'CIV' },  // API-Football alias
  'South Africa':             { flag: '🇿🇦', code: 'RSA' },
  'Mali':                     { flag: '🇲🇱', code: 'MLI' },
  'Ghana':                    { flag: '🇬🇭', code: 'GHA' },
  'Congo DR':                 { flag: '🇨🇩', code: 'COD' },
  'DR Congo':                 { flag: '🇨🇩', code: 'COD' },
  'Cape Verde':               { flag: '🇨🇻', code: 'CPV' },
  'Cape Verde Islands':       { flag: '🇨🇻', code: 'CPV' },  // API-Football alias
  'Cabo Verde':               { flag: '🇨🇻', code: 'CPV' },  // FIFA official name
  // ── Asia ────────────────────────────────────────────────────────────────────
  'Japan':                    { flag: '🇯🇵', code: 'JPN' },
  'South Korea':              { flag: '🇰🇷', code: 'KOR' },
  'Korea Republic':           { flag: '🇰🇷', code: 'KOR' },  // API-Football alias
  'Saudi Arabia':             { flag: '🇸🇦', code: 'KSA' },
  'Australia':                { flag: '🇦🇺', code: 'AUS' },
  'Iran':                     { flag: '🇮🇷', code: 'IRN' },
  'IR Iran':                  { flag: '🇮🇷', code: 'IRN' },  // FIFA official name
  'Qatar':                    { flag: '🇶🇦', code: 'QAT' },
  'Jordan':                   { flag: '🇯🇴', code: 'JOR' },
  'Uzbekistan':               { flag: '🇺🇿', code: 'UZB' },
  'Iraq':                     { flag: '🇮🇶', code: 'IRQ' },
  'Oman':                     { flag: '🇴🇲', code: 'OMA' },
  'Bahrain':                  { flag: '🇧🇭', code: 'BHR' },
  'Indonesia':                { flag: '🇮🇩', code: 'IDN' },
  'Palestine':                { flag: '🇵🇸', code: 'PLE' },
  // ── Oceania ─────────────────────────────────────────────────────────────────
  'New Zealand':              { flag: '🇳🇿', code: 'NZL' },
  // ── Placeholder / unknown ───────────────────────────────────────────────────
  'Winner UEFA Playoff A':    { flag: '🏳️', code: 'UPO' },
  'Winner UEFA Playoff B':    { flag: '🏳️', code: 'UPO' },
  'Winner UEFA Playoff C':    { flag: '🏳️', code: 'UPO' },
  'Winner UEFA Playoff D':    { flag: '🏳️', code: 'UPO' },
  'Winner FIFA Playoff 1':    { flag: '🏳️', code: 'FPO' },
  'Winner FIFA Playoff 2':    { flag: '🏳️', code: 'FPO' },
  'TBD':                      { flag: '🏳️', code: 'TBD' },
};

/**
 * Primary identity colour per team, keyed by code so name aliases (USA /
 * United States, Czechia / Czech Republic …) share one entry. Used for the
 * two-tone gradient on the shareable match card.
 *
 * These are the most *recognisable* colour for each side rather than a literal
 * shirt colour — sides whose kit is white (England, Germany, New Zealand) would
 * otherwise wash the card out. Light picks (Brazil, Argentina) are fine: the
 * card measures luminance and flips to dark text where needed.
 */
const TEAM_COLORS: Record<string, string> = {
  // Americas
  USA: '#0A3161', MEX: '#006847', CAN: '#D52B1E', BRA: '#FEDD00', ARG: '#6CACE4',
  COL: '#FCD116', ECU: '#FFDD00', URU: '#4A8FD4', CHI: '#D52B1E', PER: '#D91023',
  PAR: '#D52B1E', VEN: '#7B1113', BOL: '#007934', PAN: '#D21034', CRC: '#C8102E',
  HON: '#0073CF', JAM: '#009B3A', TTO: '#CE1126', CUB: '#002A8F', HAI: '#00209F',
  GUA: '#4997D0', SLV: '#0F47AF', CUW: '#002B7F',
  // Europe
  FRA: '#0055A4', ESP: '#C60B1E', GER: '#1C1C1C', ENG: '#CE1124', POR: '#C5282F',
  NED: '#FF6C00', BEL: '#C8102E', ITA: '#0066CC', CRO: '#DA1E28', SRB: '#C6363C',
  SUI: '#DA291C', AUT: '#ED2939', DEN: '#C8102E', POL: '#DC143C', SCO: '#0065BD',
  WAL: '#C8102E', CZE: '#11457E', SVN: '#0F4C81', SVK: '#0B4EA2', ROU: '#FCD116',
  HUN: '#CD2A3E', UKR: '#FFD500', TUR: '#E30A17', ALB: '#E41E20', SWE: '#FECC00',
  NOR: '#BA0C2F', GRE: '#0D5EAF', BIH: '#002F6C', GEO: '#DA291C', ISL: '#003897',
  FIN: '#003580', BUL: '#00966E',
  // Africa
  MAR: '#C1272D', SEN: '#00853F', NGA: '#008751', EGY: '#C8102E', CMR: '#007A5E',
  ALG: '#006233', TUN: '#E70013', CIV: '#FF8200', RSA: '#007A4D', MLI: '#14B53A',
  GHA: '#006B3F', COD: '#007FFF', CPV: '#003893',
  // Asia
  JPN: '#0A2472', KOR: '#C8102E', KSA: '#006C35', AUS: '#FFCD00', IRN: '#DA0000',
  QAT: '#8A1538', JOR: '#007A3D', UZB: '#1EB53A', IRQ: '#007A3D', OMA: '#C8102E',
  BHR: '#CE1126', IDN: '#CE1126', PLE: '#007A3D',
  // Oceania
  NZL: '#00247D',
  // Placeholders
  UPO: '#4A5568', FPO: '#4A5568', TBD: '#4A5568',
};

/** Primary identity colour for a team (hex). Falls back to a neutral slate. */
export function teamColor(teamName: string): string {
  return TEAM_COLORS[teamCode(teamName)] ?? '#4A5568';
}

export function teamCode(teamName: string): string {
  if (TEAM_INFO[teamName]) return TEAM_INFO[teamName].code;
  if (teamName.startsWith('TBD')) return 'TBD';
  if (teamName.startsWith('Winner UEFA')) return 'UPO';
  if (teamName.startsWith('Winner FIFA')) return 'FPO';
  // Knockout bracket placeholders → compact bracket notation (1A, 2B, 3RD, M73…).
  const winGroup = teamName.match(/^Winner Group ([A-L])$/);
  if (winGroup) return `1${winGroup[1]}`;
  const runGroup = teamName.match(/^Runner-up Group ([A-L])$/);
  if (runGroup) return `2${runGroup[1]}`;
  if (teamName === '3rd Place') return '3RD';
  const winMatch = teamName.match(/^Winner (\w+)$/);
  if (winMatch) return winMatch[1].toUpperCase();
  const loseMatch = teamName.match(/^Loser (\w+)$/);
  if (loseMatch) return loseMatch[1].toUpperCase();
  return teamName.slice(0, 3).toUpperCase();
}

export function teamFlag(teamName: string): string {
  if (TEAM_INFO[teamName]) return TEAM_INFO[teamName].flag;
  return '🏳️';
}
