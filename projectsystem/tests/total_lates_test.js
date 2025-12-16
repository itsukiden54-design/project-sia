// Tests for total lates aggregation (counts and minutes)

function computeTotalLates(items){
  const scheduled = 8*60; const grace = 10;
  let count=0; let totalMinutes=0; const seen=new Set();
  items.forEach(rec=>{
    try{
      let inDt = null;
      if(rec.timeInISO) inDt = new Date(rec.timeInISO);
      else if(rec.timeIn && rec.date){ const ref=new Date(rec.date+'T00:00:00'); const m = rec.timeIn.match(/(\d{1,2}):(\d{2})(?:\s*(am|pm))?/i); if(m){ let hh=Number(m[1]); const mm=Number(m[2]); const ampm=m[3]?m[3].toLowerCase():null; if(ampm){ if(ampm==='pm'&&hh!==12) hh+=12; if(ampm==='am'&&hh===12) hh=0; } inDt=new Date(ref.getTime()); inDt.setHours(hh,mm,0,0);} }
      if(inDt && !isNaN(inDt.getTime())){
        const minutes=inDt.getHours()*60 + inDt.getMinutes();
        if(minutes > (scheduled + grace)){
          count++;
          const lateMin = minutes - scheduled;
          totalMinutes += lateMin;
          if(rec.id) seen.add(String(rec.id));
        }
      }
    }catch(e){}
  });
  return { count, uniqueEmployees: seen.size, totalMinutes };
}

const items = [
  { id: 'EMP1', date: '2025-12-15', timeInISO: '2025-12-15T08:13:00' },
  { id: 'EMP2', date: '2025-12-15', timeInISO: '2025-12-15T08:13:00' },
  { id: 'EMP1', date: '2025-12-16', timeInISO: '2025-12-16T08:11:00' },
  { id: 'EMP3', date: '2025-12-16', timeInISO: '2025-12-16T08:09:00' } // within grace, ignore
];

console.log('Running total lates test...');
const res = computeTotalLates(items);
console.log(res);
// expected: count=3 (two on 15, one on 16 for EMP1), uniqueEmployees=2 (EMP1 & EMP2), totalMinutes = 13 + 13 + 11 = 37
console.log('expected: { count: 3, uniqueEmployees: 2, totalMinutes: 37 }');
