/** Band 1 (most frequent) is 0, the last band is 1; unknown entries use their own value. */
export function bandDifficulty(
  band: number | undefined,
  bandCount: number,
  unknownDifficulty: number,
): number {
  if (band === undefined) return unknownDifficulty;
  return (band - 1) / (bandCount - 1);
}

export function linearDifficulty(
  value: number,
  easy: number,
  hard: number,
): number {
  return Math.min(1, Math.max(0, (value - easy) / (hard - easy)));
}

export function meanOrZero(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/** Weighted mean over the weights above 0; a null with such a weight is a bug. */
export function combineScores<Name extends string>(
  subScores: Readonly<Record<Name, number | null>>,
  weights: Readonly<Record<Name, number>>,
): number {
  let weighted = 0;
  let total = 0;
  for (const name of Object.keys(weights) as Name[]) {
    const weight = weights[name];
    if (weight <= 0) continue;
    const subScore = subScores[name];
    if (subScore === null) {
      throw new Error(`sub-score "${name}" has a weight but no value`);
    }
    weighted += weight * subScore;
    total += weight;
  }
  return weighted / total;
}

/** Thresholds are ascending; a score equal to a threshold belongs to the level above. */
export function selectLevel(
  score: number,
  levels: readonly string[],
  thresholds: readonly number[],
): string {
  const index = thresholds.filter((threshold) => score >= threshold).length;
  return levels[Math.min(index, levels.length - 1)] ?? "";
}
