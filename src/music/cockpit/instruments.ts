/** Both the windshield compass and console gauge share this dial calibration. */
export function gaugeNeedleAngle(value: number) {
  const normalized = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0
  return -110 + normalized * 220
}
