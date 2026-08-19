export function annualTargetIncomeEur(
  holdings: { amountEur: number; targetYieldPct: string | number }[]
): number {
  const total = holdings.reduce((sum, h) => {
    const pct = typeof h.targetYieldPct === "string" ? Number(h.targetYieldPct) : h.targetYieldPct;
    if (!Number.isFinite(pct)) return sum;
    return sum + (h.amountEur * pct) / 100;
  }, 0);
  return Math.round(total);
}

export function totalCommittedEur(holdings: { amountEur: number }[]): number {
  return holdings.reduce((sum, h) => sum + h.amountEur, 0);
}
