export function isPickLocked(kickoffIso: string, now = new Date()): boolean {
  const kickoff = new Date(kickoffIso);

  if (Number.isNaN(kickoff.getTime())) {
    throw new Error('Invalid kickoff timestamp');
  }

  return now.getTime() >= kickoff.getTime();
}
