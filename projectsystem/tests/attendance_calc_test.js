// Simple node test for computeNetMinutesBetween logic
function computeNetMinutesBetween(inDt, outDt){
  if(!inDt || !outDt || isNaN(inDt.getTime()) || isNaN(outDt.getTime())) return 0;
  if(outDt.getTime() < inDt.getTime()) outDt = new Date(outDt.getTime() + 24*3600*1000);
  let totalMin = Math.max(0, Math.round((outDt.getTime() - inDt.getTime()) / (1000*60)));
  const startDay = new Date(inDt.getFullYear(), inDt.getMonth(), inDt.getDate());
  const endDay = new Date(outDt.getFullYear(), outDt.getMonth(), outDt.getDate());
  for(let d = new Date(startDay.getTime()); d.getTime() <= endDay.getTime(); d.setDate(d.getDate()+1)){
    const lunchStart = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0, 0);
    const lunchEnd = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 13, 0, 0, 0);
    const overlapStart = new Date(Math.max(inDt.getTime(), lunchStart.getTime()));
    const overlapEnd = new Date(Math.min(outDt.getTime(), lunchEnd.getTime()));
    if(overlapEnd.getTime() > overlapStart.getTime()){
      const overlapMinutes = Math.round((overlapEnd.getTime() - overlapStart.getTime()) / (1000*60));
      totalMin = Math.max(0, totalMin - overlapMinutes);
    }
  }
  return totalMin;
}

function minutesToHoursStr(m){
  const h = Math.floor(m/60);
  const mins = m % 60;
  return `${h}h ${mins}m`;
}

const tests = [
  {in: '2025-11-30T08:00:00', out: '2025-11-30T17:00:00', expectNetMin: 8*60, expectPayMin: 8*60},
  {in: '2025-11-30T11:00:00', out: '2025-11-30T12:30:00', expectNetMin: 60, expectPayMin: 60},
  {in: '2025-11-30T12:00:00', out: '2025-11-30T13:00:00', expectNetMin: 0, expectPayMin: 0},
  {in: '2025-11-30T23:00:00', out: '2025-12-01T06:00:00', expectNetMin: 7*60, expectPayMin: 7*60},
  {in: '2025-11-30T11:00:00', out: '2025-11-30T14:00:00', expectNetMin: 2*60, expectPayMin: 2*60},
  {in: '2025-11-30T06:00:00', out: '2025-11-30T20:00:00', expectNetMin: 13*60, expectPayMin: 8*60},
];

console.log('Running attendance calc tests...');
let passed = 0;
for(const t of tests){
  const inDt = new Date(t.in);
  const outDt = new Date(t.out);
  const net = computeNetMinutesBetween(inDt, outDt);
  const pay = Math.min(net, 8*60);
  const ok = net === t.expectNetMin && pay === t.expectPayMin;
  console.log(`IN=${t.in} OUT=${t.out} -> net=${minutesToHoursStr(net)} paid=${minutesToHoursStr(pay)} ${ok? '✓' : '✗'}`);
  if(ok) passed++;
}
console.log(`${passed}/${tests.length} tests passed.`);
