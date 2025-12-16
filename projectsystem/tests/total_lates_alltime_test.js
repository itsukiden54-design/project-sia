// Tests computeAllTimeLates() behavior - simple scenarios
const attendance = [
  { id: 'A', date: '2025-12-01', timeInISO: '2025-12-01T08:13:00' },
  { id: 'B', date: '2025-12-01', timeInISO: '2025-12-01T08:13:00' },
  { id: 'A', date: '2025-12-02', timeInISO: '2025-12-02T08:11:00' },
  { id: 'C', date: '2025-12-02', timeInISO: '2025-12-02T08:09:00' }, // within grace
  { id: 'D', date: '2025-12-03', timeInISO: '2025-12-03T09:00:00' }
];

function computeAllTimeLates(items){
  const scheduled = 8*60; const grace = 10;
  let count = 0; let totalMinutes = 0; const seen = new Set();
  items.forEach(rec=>{
    try{
      if(!rec) return;
      let inDt = null;
      if(rec.timeInISO) inDt = new Date(rec.timeInISO);
      else if(rec.timeIn && rec.date){ const ref = new Date(rec.date + 'T00:00:00'); const m = rec.timeIn.match(/(\d{1,2}):(\d{2})(?:\s*(am|pm))?/i); if(m){ let hh=Number(m[1]); const mm=Number(m[2]); const ampm=m[3]?m[3].toLowerCase():null; if(ampm){ if(ampm==='pm'&&hh!==12) hh+=12; if(ampm==='am'&&hh===12) hh=0; } inDt = new Date(ref.getTime()); inDt.setHours(hh,mm,0,0); } }
      if(inDt && !isNaN(inDt.getTime())){
        const minutes=inDt.getHours()*60 + inDt.getMinutes();
        if(minutes > (scheduled + grace)){
          count++; const lateMin = Math.max(0, minutes - scheduled); totalMinutes += lateMin; if(rec.id) seen.add(String(rec.id));
        }
      }
    }catch(e){}
  });
  return { count, uniqueEmployees: seen.size, totalMinutes };
}

console.log('Running all-time lates test...');
const res = computeAllTimeLates(attendance);
console.log(res);
console.log('Expect: count 4 instances (A,B,A,D) -> 4 instances; uniqueEmployees 3 (A,B,D); totalMinutes: A(13)+B(13)+A(11)+D(60)=97');
