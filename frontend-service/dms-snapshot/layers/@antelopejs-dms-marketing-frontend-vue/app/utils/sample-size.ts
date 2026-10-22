/** z for a two-sided 95% test and for 80% power, the usual A/B defaults. */
const Z_ALPHA = 1.96
const Z_POWER = 0.8416

/**
 * Sessions each arm needs before a relative lift of `lift` on a conversion
 * rate of `rate` can be told from noise (two-proportion test, 95% / 80%).
 */
export function sampleSizePerArm(rate: number, lift: number): number {
  const p1 = rate
  const p2 = Math.min(rate * (1 + lift), 1)
  const variance = p1 * (1 - p1) + p2 * (1 - p2)
  const effect = (p2 - p1) ** 2
  return effect > 0
    ? ((Z_ALPHA + Z_POWER) ** 2 * variance) / effect
    : Number.POSITIVE_INFINITY
}
