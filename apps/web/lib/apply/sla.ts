/** Soft ops SLA for pending applications (business hours not modelled). */
export const APPLICATION_SLA_HOURS = 48;

export function applicationAgeHours(createdAt: Date, now = new Date()): number {
  return Math.max(0, (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60));
}

export function formatApplicationAge(createdAt: Date, now = new Date()): string {
  const hours = applicationAgeHours(createdAt, now);
  if (hours < 24) {
    const h = Math.max(1, Math.round(hours));
    return `${h}h`;
  }
  const days = Math.floor(hours / 24);
  const rem = Math.round(hours % 24);
  return rem > 0 ? `${days}d ${rem}h` : `${days}d`;
}

export function isApplicationOverSla(createdAt: Date, now = new Date()): boolean {
  return applicationAgeHours(createdAt, now) >= APPLICATION_SLA_HOURS;
}
