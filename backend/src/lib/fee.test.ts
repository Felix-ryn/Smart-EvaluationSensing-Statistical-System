import assert from "node:assert";
import { calculateParkingFee } from "./fee.js";

const rules = { firstHour: 2000, nextHour: 2000, maximumDaily: 20000 };

// 2h15m -> 3 started hours -> 2000 + 2*2000 = 6000
let r = calculateParkingFee(new Date("2026-01-01T10:00:00Z"), new Date("2026-01-01T12:15:00Z"), rules);
assert.strictEqual(r.durationMinutes, 135);
assert.strictEqual(r.durationLabel, "2h 15m");
assert.strictEqual(r.totalFee, 6000);

// exactly 1h -> 2000
r = calculateParkingFee(new Date("2026-01-01T10:00:00Z"), new Date("2026-01-01T11:00:00Z"), rules);
assert.strictEqual(r.totalFee, 2000);

// under an hour still charges first hour (started)
r = calculateParkingFee(new Date("2026-01-01T10:00:00Z"), new Date("2026-01-01T10:05:00Z"), rules);
assert.strictEqual(r.totalFee, 2000);

// zero/negative duration -> 0
r = calculateParkingFee(new Date("2026-01-01T10:00:00Z"), new Date("2026-01-01T10:00:00Z"), rules);
assert.strictEqual(r.totalFee, 0);

// long stay hits daily cap: 15h -> 2000+14*2000=30000, capped at 20000
r = calculateParkingFee(new Date("2026-01-01T00:00:00Z"), new Date("2026-01-01T15:00:00Z"), rules);
assert.strictEqual(r.totalFee, 20000);

// 25h = one capped full day (20000) + 1 started hour (2000) = 22000
r = calculateParkingFee(new Date("2026-01-01T00:00:00Z"), new Date("2026-01-02T01:00:00Z"), rules);
assert.strictEqual(r.totalFee, 22000);

// 2 full days = 2 * cap = 40000
r = calculateParkingFee(new Date("2026-01-01T00:00:00Z"), new Date("2026-01-03T00:00:00Z"), rules);
assert.strictEqual(r.totalFee, 40000);

console.log("fee.test.ts: all assertions passed");
