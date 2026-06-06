const PALETTE = [
  'linear-gradient(135deg, #3b82f6, #2563eb)',  // blue
  'linear-gradient(135deg, #8b5cf6, #7c3aed)',  // violet
  'linear-gradient(135deg, #10b981, #059669)',  // emerald
  'linear-gradient(135deg, #f59e0b, #d97706)',  // amber
  'linear-gradient(135deg, #ef4444, #dc2626)',  // red
  'linear-gradient(135deg, #ec4899, #db2777)',  // pink
  'linear-gradient(135deg, #06b6d4, #0891b2)',  // cyan
  'linear-gradient(135deg, #f97316, #ea580c)',  // orange
];

/** Returns a deterministic gradient background for an avatar based on any stable seed (email, userId, etc.). */
export function avatarColor(seed: string | null | undefined): string {
  if (!seed) return PALETTE[0];
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return PALETTE[hash % PALETTE.length];
}
