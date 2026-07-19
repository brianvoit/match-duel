import { teamFlag, teamColor } from '@/lib/data/teamInfo';

/**
 * Renders a shareable match card to a PNG blob, drawn client-side on a canvas so
 * it works offline and needs no API calls. The background is a two-tone
 * horizontal gradient between the two teams' primary colours.
 */

export interface ShareGoal {
  side: 'HOME' | 'AWAY';
  player: string;
  minute: number;
  extraMinute?: number | null;
  /** API-Football detail, e.g. "Normal Goal" | "Penalty" | "Own Goal". */
  detail?: string | null;
}

export interface SharePicker {
  name: string;
  side: 'HOME' | 'AWAY' | null;
  /** The player's current tournament points total (their live standing). */
  currentPoints?: number;
  /**
   * Profile photo URL. Loaded with crossOrigin='anonymous' so painting it doesn't
   * taint the canvas (Supabase storage / Google avatars send CORS headers); a
   * failed/absent load falls back to the initial bubble.
   */
  avatarUrl?: string | null;
}

export interface ShareCardOptions {
  homeTeam: string;
  awayTeam: string;
  homeScore: number | null;
  awayScore: number | null;
  homePenScore?: number | null;
  awayPenScore?: number | null;
  /** SCHEDULED | LIVE | FINAL */
  status: string;
  kickoff: string;
  /** e.g. "Semi-Finals" */
  stageLabel: string;
  goals: ShareGoal[];
  /** The two duellists and the side each picked. */
  pickers: SharePicker[];
  /** Stage points on the table for this match. */
  pointsAtStake: number;
}

// ── Colour helpers ────────────────────────────────────────────────────────────

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

/** WCAG relative luminance (0 = black, 1 = white). */
function luminance(hex: string): number {
  const channel = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function mixToward(hex: string, target: [number, number, number], amount: number): string {
  const [r, g, b] = hexToRgb(hex);
  const m = (a: number, t: number) => Math.round(a + (t - a) * amount);
  const to2 = (v: number) => v.toString(16).padStart(2, '0');
  return `#${to2(m(r, target[0]))}${to2(m(g, target[1]))}${to2(m(b, target[2]))}`;
}

/**
 * Keep the team's hue but guarantee white text stays legible: light colours
 * (Brazil yellow, Argentina sky blue) get pulled toward black until they're dark
 * enough, and near-black colours get lifted slightly so the gradient reads.
 */
function gradientSafe(hex: string): string {
  let c = hex;
  let guard = 0;
  while (luminance(c) > 0.22 && guard++ < 12) c = mixToward(c, [0, 0, 0], 0.16);
  if (luminance(c) < 0.02) c = mixToward(c, [255, 255, 255], 0.14);
  return c;
}

/**
 * Mute the team colour toward a dark neutral so the card reads soft rather than
 * poster-bright — the hue still identifies the side, but it sits back behind the
 * text instead of competing with it.
 */
function faded(hex: string): string {
  return mixToward(gradientSafe(hex), [24, 25, 30], 0.5);
}

/** Truncate to fit a column, so a long name can't collide with the minute. */
function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxWidth) t = t.slice(0, -1);
  return `${t}…`;
}

// ── Drawing ───────────────────────────────────────────────────────────────────

const FONT = '"Segoe UI", system-ui, -apple-system, Roboto, sans-serif';
const EMOJI_FONT = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", system-ui, sans-serif';

function font(weight: number, size: number, family = FONT) {
  return `${weight} ${size}px ${family}`;
}

function goalLabel(g: ShareGoal): string {
  const min = g.extraMinute ? `${g.minute}+${g.extraMinute}'` : `${g.minute}'`;
  const d = (g.detail ?? '').toLowerCase();
  const tag = d.includes('penalty') ? ' (Pen.)' : d.includes('own') ? ' (OG)' : '';
  return `${g.player}${tag}|${min}`;
}

function statusLine(o: ShareCardOptions): string {
  if (o.status === 'FINAL') {
    const pens = o.homePenScore != null && o.awayPenScore != null;
    return pens ? `FT (${o.homePenScore}–${o.awayPenScore} pens)` : 'FT';
  }
  if (o.status === 'LIVE') return 'LIVE';
  return new Date(o.kickoff).toLocaleString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

/** Winning side once decided (penalty-aware), else null. */
function winningSide(o: ShareCardOptions): 'HOME' | 'AWAY' | null {
  if (o.status !== 'FINAL' || o.homeScore == null || o.awayScore == null) return null;
  if (o.homeScore !== o.awayScore) return o.homeScore > o.awayScore ? 'HOME' : 'AWAY';
  if (o.homePenScore != null && o.awayPenScore != null && o.homePenScore !== o.awayPenScore) {
    return o.homePenScore > o.awayPenScore ? 'HOME' : 'AWAY';
  }
  return null; // genuine draw
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function strikeThrough(ctx: CanvasRenderingContext2D, text: string, cx: number, y: number) {
  const w = ctx.measureText(text).width;
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(cx - w / 2 - 4, y - 12);
  ctx.lineTo(cx + w / 2 + 4, y - 12);
  ctx.stroke();
  ctx.restore();
}

/**
 * Load an avatar for painting onto the canvas. crossOrigin='anonymous' asks the
 * host for CORS headers so the canvas stays untainted and toBlob() keeps working;
 * any failure resolves to null so the caller draws the initial bubble instead.
 */
function loadAvatar(url: string | null | undefined): Promise<HTMLImageElement | null> {
  if (!url) return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

export async function renderMatchShareCard(o: ShareCardOptions): Promise<Blob> {
  const W = 1200;
  const SCALE = 2;

  // Goal rows drive the card height: with no goals the centre collapses to a
  // compact card; each goal — plus the half-time divider — adds a row so the
  // image grows to fit the whole story (extra-time and shootout goals included).
  const firstHalf = o.goals.filter((g) => g.minute <= 45);
  const secondHalf = o.goals.filter((g) => g.minute > 45);
  const htRow = secondHalf.length && firstHalf.length ? 1 : 0;
  const nRows = o.goals.length + htRow;
  const GOALS_TOP = 392;   // baseline of the first goal / HT row
  const ROW_H = 46;
  const stripH = 188;      // duel strip at the foot of the card
  const COMP_GAP = 40;     // room for the competition/round line above the strip
  const contentBottom = nRows > 0
    ? GOALS_TOP + (nRows - 1) * ROW_H + 22  // just past the last goal row
    : 356;                                  // just below the team names when empty
  const H = contentBottom + COMP_GAP + stripH;

  // Preload both avatars (CORS-safe) before we start painting the strip.
  const avatarByPicker = new Map<SharePicker, HTMLImageElement | null>();
  await Promise.all(o.pickers.map(async (p) => avatarByPicker.set(p, await loadAvatar(p.avatarUrl))));

  const canvas = document.createElement('canvas');
  canvas.width = W * SCALE;
  canvas.height = H * SCALE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is unavailable');
  ctx.scale(SCALE, SCALE);
  ctx.textBaseline = 'alphabetic';

  // ── Two-tone gradient on a diagonal (home colour → away colour) ────────────
  // Angled top-left → bottom-right, blending across the whole card so neither
  // colour sits as a flat block.
  const homeC = faded(teamColor(o.homeTeam));
  const awayC = faded(teamColor(o.awayTeam));
  const grad = ctx.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, homeC);
  grad.addColorStop(1, awayC);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // Gentle vertical depth so text never sits on a flat block.
  const veil = ctx.createLinearGradient(0, 0, 0, H);
  veil.addColorStop(0, 'rgba(0,0,0,0.10)');
  veil.addColorStop(0.55, 'rgba(0,0,0,0.02)');
  veil.addColorStop(1, 'rgba(0,0,0,0.24)');
  ctx.fillStyle = veil;
  ctx.fillRect(0, 0, W, H);

  const midX = W / 2;
  const homeX = 250;
  const awayX = W - 250;
  const win = winningSide(o);

  // ── Flags ──────────────────────────────────────────────────────────────────
  ctx.textAlign = 'center';
  ctx.font = font(400, 104, EMOJI_FONT);
  ctx.fillStyle = '#fff';
  ctx.fillText(teamFlag(o.homeTeam), homeX, 210);
  ctx.fillText(teamFlag(o.awayTeam), awayX, 210);

  // ── Score ──────────────────────────────────────────────────────────────────
  const score = o.homeScore == null || o.awayScore == null
    ? '–'
    : `${o.homeScore} – ${o.awayScore}`;
  ctx.font = font(800, 116, FONT);
  ctx.fillStyle = '#fff';
  ctx.fillText(score, midX, 208);

  // ── Status ─────────────────────────────────────────────────────────────────
  ctx.font = font(600, 30, FONT);
  ctx.fillStyle = 'rgba(255,255,255,0.82)';
  ctx.fillText(statusLine(o), midX, 262);

  // ── Team names (loser struck through, as on a finished scorebug) ───────────
  ctx.font = font(700, 44, FONT);
  ctx.fillStyle = '#fff';
  ctx.fillText(o.homeTeam, homeX, 320);
  ctx.fillText(o.awayTeam, awayX, 320);
  if (win === 'AWAY') strikeThrough(ctx, o.homeTeam, homeX, 320);
  if (win === 'HOME') strikeThrough(ctx, o.awayTeam, awayX, 320);

  // ── Goals, split by half (firstHalf/secondHalf computed above for sizing) ──
  let running = { h: 0, a: 0 };
  let y = GOALS_TOP;

  // The running score owns the exact centre; each scorer sits on their own
  // team's side of it, with the minute nearest the middle. GAP keeps the minute
  // clear of the score, and the name column is capped so it can't run into it.
  const SCORE_HALF = 58;
  const GAP = 18;

  const drawGoal = (g: ShareGoal) => {
    if (g.side === 'HOME') running.h += 1; else running.a += 1;
    const [name, min] = goalLabel(g).split('|');
    const dir = g.side === 'HOME' ? -1 : 1;
    const minuteEdge = midX + dir * (SCORE_HALF + GAP);

    ctx.font = font(500, 26, FONT);
    const minW = ctx.measureText(min).width;
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.textAlign = g.side === 'HOME' ? 'right' : 'left';
    ctx.fillText(min, minuteEdge, y);

    const nameEdge = minuteEdge + dir * (minW + GAP);
    ctx.font = font(500, 30, FONT);
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    // Room left between the name column and the card edge.
    const maxNameW = Math.abs(nameEdge - (g.side === 'HOME' ? 56 : W - 56));
    ctx.fillText(fitText(ctx, name, maxNameW), nameEdge, y);

    ctx.textAlign = 'center';
    ctx.font = font(700, 30, FONT);
    ctx.fillStyle = '#fff';
    ctx.fillText(`${running.h} - ${running.a}`, midX, y);
    y += 46;
  };

  for (const g of firstHalf) drawGoal(g);
  if (secondHalf.length && firstHalf.length) {
    ctx.textAlign = 'center';
    ctx.font = font(600, 24, FONT);
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fillText('— HT —', midX, y);
    y += 46;
  }
  for (const g of secondHalf) drawGoal(g);

  // ── Duel strip: who picked whom, their live totals, and what's on the table ─
  const stripY = H - stripH;
  ctx.fillStyle = 'rgba(0,0,0,0.38)';
  ctx.fillRect(0, stripY, W, stripH);
  ctx.fillStyle = 'rgba(255,255,255,0.16)';
  ctx.fillRect(0, stripY, W, 1);

  const bySide = (side: 'HOME' | 'AWAY') => o.pickers.find((p) => p.side === side) ?? null;

  const drawPicker = (side: 'HOME' | 'AWAY', cx: number) => {
    const p = bySide(side);
    const team = side === 'HOME' ? o.homeTeam : o.awayTeam;
    const won = win != null && win === side;
    const lost = win != null && win !== side;

    ctx.textAlign = 'center';
    ctx.globalAlpha = lost ? 0.55 : 1;

    // Profile photo clipped into a circle, or an initial bubble if none loaded.
    const cy = stripY + 46;
    const r = 24;
    const img = p ? avatarByPicker.get(p) : null;
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    if (img) {
      ctx.clip();
      ctx.drawImage(img, cx - r, cy - r, r * 2, r * 2);
      ctx.restore();
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.lineWidth = 2;
      ctx.strokeStyle = won ? '#fff' : 'rgba(255,255,255,0.45)';
      ctx.stroke();
    } else {
      ctx.fillStyle = won ? '#fff' : 'rgba(255,255,255,0.28)';
      ctx.fill();
      ctx.restore();
      ctx.font = font(800, 24, FONT);
      ctx.fillStyle = won ? '#111' : '#fff';
      ctx.fillText((p?.name ?? '?').trim().charAt(0).toUpperCase(), cx, cy + 9);
    }

    ctx.font = font(700, 26, FONT);
    ctx.fillStyle = '#fff';
    ctx.fillText(fitText(ctx, p?.name ?? '—', 320), cx, stripY + 90);

    // Current tournament points total (their standing), between name and team.
    ctx.font = font(800, 30, FONT);
    ctx.fillStyle = '#fff';
    ctx.fillText(p?.currentPoints != null ? `${p.currentPoints} pts` : '—', cx, stripY + 128);

    ctx.font = font(500, 21, FONT);
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillText(fitText(ctx, team, 320), cx, stripY + 158);
    ctx.globalAlpha = 1;
  };

  drawPicker('HOME', homeX);
  drawPicker('AWAY', awayX);

  // Centre pill: points on the table (or awarded, once decided).
  const pill = win ? `+${o.pointsAtStake}` : `${o.pointsAtStake} PTS`;
  ctx.font = font(800, 30, FONT);
  const pw = ctx.measureText(pill).width + 44;
  roundRect(ctx, midX - pw / 2, stripY + 56, pw, 52, 26);
  ctx.fillStyle = 'rgba(255,255,255,0.14)';
  ctx.fill();
  ctx.textAlign = 'center';
  ctx.fillStyle = '#fff';
  ctx.fillText(pill, midX, stripY + 92);
  ctx.font = font(500, 20, FONT);
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.fillText(win ? 'awarded' : 'on the table', midX, stripY + 132);

  // ── Competition + round ────────────────────────────────────────────────────
  ctx.font = font(600, 24, FONT);
  ctx.fillStyle = 'rgba(255,255,255,0.72)';
  ctx.textAlign = 'left';
  ctx.fillText('FIFA World Cup', 56, stripY - 34);
  ctx.textAlign = 'right';
  ctx.fillText(o.stageLabel, W - 56, stripY - 34);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Could not render the share image'))),
      'image/png',
    );
  });
}
