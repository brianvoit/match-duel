import { describe, expect, it } from 'vitest';
import { orderByFixtureSides, sideForApiTeam } from '@/lib/domain/teamSides';

type Lineup = { team: string; xi: string };
const nameOf = (l: Lineup) => l.team;

describe('orderByFixtureSides', () => {
  it('reversed knockout: API [away, home] maps to our [home, away]', () => {
    // Our fixture is Argentina (home) v England (away); API returns England first.
    const api: Lineup[] = [
      { team: 'England', xi: 'Kane' },
      { team: 'Argentina', xi: 'Messi' },
    ];
    const [home, away] = orderByFixtureSides(api, nameOf, 'Argentina', 'England');
    expect(home?.xi).toBe('Messi');
    expect(away?.xi).toBe('Kane');
  });

  it('normal order is preserved', () => {
    const api: Lineup[] = [
      { team: 'Argentina', xi: 'Messi' },
      { team: 'England', xi: 'Kane' },
    ];
    const [home, away] = orderByFixtureSides(api, nameOf, 'Argentina', 'England');
    expect(home?.xi).toBe('Messi');
    expect(away?.xi).toBe('Kane');
  });

  it('matches across API name variants (code, not exact name)', () => {
    // API "Czech Republic" vs our "Czechia"; "Korea Republic" vs "South Korea".
    const api: Lineup[] = [
      { team: 'Korea Republic', xi: 'Son' },
      { team: 'Czech Republic', xi: 'Soucek' },
    ];
    const [home, away] = orderByFixtureSides(api, nameOf, 'Czechia', 'South Korea');
    expect(home?.xi).toBe('Soucek');
    expect(away?.xi).toBe('Son');
  });

  it('stand-in id (neither matches) falls back to API order', () => {
    const api: Lineup[] = [
      { team: 'Brazil', xi: 'a' },
      { team: 'Spain', xi: 'b' },
    ];
    const [home, away] = orderByFixtureSides(api, nameOf, 'Argentina', 'England');
    expect(home?.xi).toBe('a');
    expect(away?.xi).toBe('b');
  });

  it('only one side identifiable: the other takes the remaining lineup', () => {
    const api: Lineup[] = [
      { team: 'Argentina', xi: 'Messi' },
      { team: 'Some Stand-in', xi: 'x' },
    ];
    const [home, away] = orderByFixtureSides(api, nameOf, 'Argentina', 'England');
    expect(home?.xi).toBe('Messi');
    expect(away?.xi).toBe('x');
  });
});

describe('sideForApiTeam', () => {
  it('maps each side by identity regardless of orientation', () => {
    expect(sideForApiTeam('Argentina', 'Argentina', 'England')).toBe('HOME');
    expect(sideForApiTeam('England', 'Argentina', 'England')).toBe('AWAY');
    // Reversed fixture (our home = England): the API's "Argentina" is our away.
    expect(sideForApiTeam('Argentina', 'England', 'Argentina')).toBe('AWAY');
  });

  it('collapses API name variants via code', () => {
    expect(sideForApiTeam('Czech Republic', 'Czechia', 'South Korea')).toBe('HOME');
    expect(sideForApiTeam('Korea Republic', 'Czechia', 'South Korea')).toBe('AWAY');
  });

  it('returns null when neither side matches (stand-in id)', () => {
    expect(sideForApiTeam('Brazil', 'Argentina', 'England')).toBeNull();
    expect(sideForApiTeam('', 'Argentina', 'England')).toBeNull();
  });
});
