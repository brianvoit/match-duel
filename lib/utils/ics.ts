import { teamCode } from '@/lib/data/teamInfo';

export interface IcsFixture {
  id: string;
  homeTeam: string;
  awayTeam: string;
  startsAt: string; // ISO string (UTC)
  groupName: string | null;
  venue: string | null;
  city: string | null;
  myPickSide: 'HOME' | 'AWAY' | null;
  opponentPickSide: 'HOME' | 'AWAY' | null;
}

/** Format a Date as ICS UTC timestamp: 20260612T180000Z */
function icsDate(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/** Escape text for ICS property values (RFC 5545 §3.3.11) */
function esc(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

/** Build a single VEVENT block */
function buildEvent(fixture: IcsFixture, dtstamp: string): string {
  const start = new Date(fixture.startsAt);
  const end = new Date(start.getTime() + 2 * 60 * 60 * 1000); // +2 hours

  const homeCode = teamCode(fixture.homeTeam);
  const awayCode = teamCode(fixture.awayTeam);
  const summary = `${homeCode} vs ${awayCode}`;

  // Build description lines
  const descLines: string[] = [
    `${fixture.homeTeam} vs ${fixture.awayTeam}`,
  ];
  if (fixture.groupName) descLines.push(`Group ${fixture.groupName}`);
  if (fixture.venue && fixture.city) descLines.push(`${fixture.venue} · ${fixture.city}`);
  else if (fixture.venue) descLines.push(fixture.venue);
  else if (fixture.city) descLines.push(fixture.city);

  if (fixture.myPickSide || fixture.opponentPickSide) {
    descLines.push('');
    if (fixture.myPickSide) {
      const myTeam = fixture.myPickSide === 'HOME' ? fixture.homeTeam : fixture.awayTeam;
      descLines.push(`Your pick: ${myTeam}`);
    }
    if (fixture.opponentPickSide) {
      const oppTeam = fixture.opponentPickSide === 'HOME' ? fixture.homeTeam : fixture.awayTeam;
      descLines.push(`Opponent pick: ${oppTeam}`);
    }
  }

  const description = esc(descLines.join('\n'));

  const locationParts = [fixture.venue, fixture.city].filter(Boolean);
  const location = locationParts.length ? esc(locationParts.join(', ')) : '';

  const lines = [
    'BEGIN:VEVENT',
    `UID:wcp26-${fixture.id}@worldcuppickem`,
    `DTSTAMP:${dtstamp}`,
    `DTSTART:${icsDate(start)}`,
    `DTEND:${icsDate(end)}`,
    `SUMMARY:${esc(summary)}`,
    `DESCRIPTION:${description}`,
  ];
  if (location) lines.push(`LOCATION:${location}`);
  lines.push('END:VEVENT');

  return lines.join('\r\n');
}

/** Build a complete VCALENDAR string for one or more fixtures */
export function buildIcs(fixtures: IcsFixture[], calName = "World Cup Pick'Em"): string {
  const dtstamp = icsDate(new Date());

  const events = fixtures.map((f) => buildEvent(f, dtstamp)).join('\r\n');

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:-//World Cup Pick'Em//EN`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${esc(calName)}`,
    events,
    'END:VCALENDAR',
  ].join('\r\n');
}
