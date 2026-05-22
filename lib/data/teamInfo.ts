export const TEAM_INFO: Record<string, { flag: string; code: string }> = {
  'Mexico':                  { flag: '🇲🇽', code: 'MEX' },
  'South Africa':            { flag: '🇿🇦', code: 'RSA' },
  'South Korea':             { flag: '🇰🇷', code: 'KOR' },
  'Czech Republic':          { flag: '🇨🇿', code: 'CZE' },
  'Canada':                  { flag: '🇨🇦', code: 'CAN' },
  'Bosnia and Herzegovina':  { flag: '🇧🇦', code: 'BIH' },
  'Qatar':                   { flag: '🇶🇦', code: 'QAT' },
  'Switzerland':             { flag: '🇨🇭', code: 'SUI' },
  'Brazil':                  { flag: '🇧🇷', code: 'BRA' },
  'Morocco':                 { flag: '🇲🇦', code: 'MAR' },
  'Haiti':                   { flag: '🇭🇹', code: 'HAI' },
  'Scotland':                { flag: '🏴󠁧󠁢󠁳󠁣󠁴󠁿', code: 'SCO' },
  'United States':           { flag: '🇺🇸', code: 'USA' },
  'Paraguay':                { flag: '🇵🇾', code: 'PAR' },
  'Australia':               { flag: '🇦🇺', code: 'AUS' },
  'Turkey':                  { flag: '🇹🇷', code: 'TUR' },
  'Germany':                 { flag: '🇩🇪', code: 'GER' },
  'Curaçao':                 { flag: '🇨🇼', code: 'CUW' },
  'Ivory Coast':             { flag: '🇨🇮', code: 'CIV' },
  'Ecuador':                 { flag: '🇪🇨', code: 'ECU' },
  'Netherlands':             { flag: '🇳🇱', code: 'NED' },
  'Japan':                   { flag: '🇯🇵', code: 'JPN' },
  'Sweden':                  { flag: '🇸🇪', code: 'SWE' },
  'Algeria':                 { flag: '🇩🇿', code: 'ALG' },
  'Argentina':               { flag: '🇦🇷', code: 'ARG' },
  'Austria':                 { flag: '🇦🇹', code: 'AUT' },
  'Belgium':                 { flag: '🇧🇪', code: 'BEL' },
  'Cape Verde':              { flag: '🇨🇻', code: 'CPV' },
  'Colombia':                { flag: '🇨🇴', code: 'COL' },
  'Croatia':                 { flag: '🇭🇷', code: 'CRO' },
  'Egypt':                   { flag: '🇪🇬', code: 'EGY' },
  'England':                 { flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', code: 'ENG' },
  'France':                  { flag: '🇫🇷', code: 'FRA' },
  'Ghana':                   { flag: '🇬🇭', code: 'GHA' },
  'Iran':                    { flag: '🇮🇷', code: 'IRN' },
  'Jordan':                  { flag: '🇯🇴', code: 'JOR' },
  'New Zealand':             { flag: '🇳🇿', code: 'NZL' },
  'Norway':                  { flag: '🇳🇴', code: 'NOR' },
  'Panama':                  { flag: '🇵🇦', code: 'PAN' },
  'Portugal':                { flag: '🇵🇹', code: 'POR' },
  'Saudi Arabia':            { flag: '🇸🇦', code: 'KSA' },
  'Senegal':                 { flag: '🇸🇳', code: 'SEN' },
  'Spain':                   { flag: '🇪🇸', code: 'ESP' },
  'Tunisia':                 { flag: '🇹🇳', code: 'TUN' },
  'Uruguay':                 { flag: '🇺🇾', code: 'URU' },
  'Uzbekistan':              { flag: '🇺🇿', code: 'UZB' },
  'Winner UEFA Playoff A':   { flag: '🏳️', code: 'UPO' },
  'Winner UEFA Playoff B':   { flag: '🏳️', code: 'UPO' },
  'Winner UEFA Playoff C':   { flag: '🏳️', code: 'UPO' },
  'Winner UEFA Playoff D':   { flag: '🏳️', code: 'UPO' },
  'Winner FIFA Playoff 1':   { flag: '🏳️', code: 'FPO' },
  'Winner FIFA Playoff 2':   { flag: '🏳️', code: 'FPO' },
  'TBD':                     { flag: '🏳️', code: 'TBD' },
};

export function teamCode(teamName: string): string {
  if (TEAM_INFO[teamName]) return TEAM_INFO[teamName].code;
  if (teamName.startsWith('TBD')) return 'TBD';
  if (teamName.startsWith('Winner UEFA')) return 'UPO';
  if (teamName.startsWith('Winner FIFA')) return 'FPO';
  return teamName.slice(0, 3).toUpperCase();
}

export function teamFlag(teamName: string): string {
  if (TEAM_INFO[teamName]) return TEAM_INFO[teamName].flag;
  return '🏳️';
}
