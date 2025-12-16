// Tests for late-minute calculation using 08:00 start + 10-minute grace

function computeLateMinutesFromIso(iso){
  const d = new Date(iso);
  if(isNaN(d.getTime())) return 0;
  const minutes = d.getHours() * 60 + d.getMinutes();
  const scheduled = 8 * 60; // 08:00
  const grace = 10; // minutes
  if(minutes > (scheduled + grace)) return Math.max(0, minutes - scheduled);
  return 0;
}

const cases = [
  { t: '2025-12-02T08:05:00', expect: 0 },
  { t: '2025-12-02T08:10:00', expect: 0 },
  { t: '2025-12-02T08:11:00', expect: 11 },
  { t: '2025-12-02T09:00:00', expect: 60 },
  { t: '2025-12-02T07:59:00', expect: 0 },
  { t: '2025-12-02T08:30:00', expect: 30 }
];

console.log('Running late-minute calculation tests (08:00 start + 10min grace)...');
let passed = 0;
for(const c of cases){
  const got = computeLateMinutesFromIso(c.t);
  const ok = got === c.expect;
  console.log(`${c.t} -> late minutes = ${got} ${ok ? '✓' : '✗ (expected ' + c.expect + ')'}`);
  if(ok) passed++;
}
console.log(`${passed}/${cases.length} tests passed.`);
