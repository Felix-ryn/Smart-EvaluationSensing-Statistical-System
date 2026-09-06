export interface ParkingRules {
  firstHour: number; // fee for first hour (or first started hour)
  nextHour: number; // fee per subsequent started hour
  maximumDaily: number; // cap per 24h
}

export interface FeeResult {
  durationMinutes: number;
  durationLabel: string; // "2h 15m"
  baseFee: number;
  totalFee: number;
}

/** Calculate parking fee. Any started hour is charged in full. Daily cap applies per 24h. */
export function calculateParkingFee(
  checkIn: Date,
  checkOut: Date,
  rules: ParkingRules,
): FeeResult {
  const ms = Math.max(0, checkOut.getTime() - checkIn.getTime());
  const durationMinutes = Math.round(ms / 60000);
  const hours = Math.ceil(durationMinutes / 60); // started hour = full hour

  let baseFee = 0;
  if (hours >= 1) baseFee = rules.firstHour + (hours - 1) * rules.nextHour;

  // apply daily cap per full 24h block
  const days = Math.floor(durationMinutes / (24 * 60));
  const cap = (days + 1) * rules.maximumDaily;
  const totalFee = Math.min(baseFee, cap);

  const h = Math.floor(durationMinutes / 60);
  const m = durationMinutes % 60;
  const durationLabel = h > 0 ? `${h}h ${m}m` : `${m}m`;

  return { durationMinutes, durationLabel, baseFee, totalFee };
}
