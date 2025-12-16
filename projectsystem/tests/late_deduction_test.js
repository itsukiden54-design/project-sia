// Test calculateLateDeduction-style math in node
function calculateLateDeduction(weeklySalary, lateHours, lateMinutes) {
  const totalLateMinutes = (lateHours * 60) + lateMinutes;
  if (weeklySalary <= 0 || totalLateMinutes <= 0) return 0;
  const dailySalary = weeklySalary / 6;
  const hourlyRate = dailySalary / 8;
  const perMinute = hourlyRate / 60;
  const deduction = totalLateMinutes * perMinute;
  return Math.round(deduction * 100) / 100;
}

const tests = [
  { weekly: 3060, minutesLate: 11, expect: null }, // compute and show
  { weekly: 3060, minutesLate: 0, expect: 0 },
  { weekly: 3060, minutesLate: 60, expect: null },
  { weekly: 510*6, minutesLate: 11, expect: null }
];

console.log('Running late deduction tests...');
for(const t of tests){
  const hours = Math.floor(t.minutesLate / 60);
  const mins = t.minutesLate % 60;
  const got = calculateLateDeduction(t.weekly, hours, mins);
  console.log(`weekly=${t.weekly} late=${t.minutesLate}min => deduction=₱${got.toFixed(2)}` + (t.expect !== null ? (got === t.expect ? ' ✓' : ' ✗ (expected ' + t.expect + ')' ) : ''));
}
