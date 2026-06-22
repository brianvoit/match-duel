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
