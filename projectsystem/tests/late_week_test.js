// Test computeLateFromAttendance logic (08:00 start + 10-min grace)
// This is a small standalone test replicating the logic used by admin.js

function computeLateForWeek(items, empId){
  const scheduled = 8*60; const grace = 10;
  let totalLateMinutes = 0;
  items.forEach(rec => {
    if(String(rec.id) !== String(empId)) return;
    try{
      let inDt = null;
      if(rec.timeInISO) inDt = new Date(rec.timeInISO);
      else if(rec.timeIn && rec.date){ const ref = new Date(rec.date + 'T00:00:00'); const m = rec.timeIn.match(/(\d{1,2}):(\d{2})(?:\s*(am|pm))?/i); if(m){ let hh=Number(m[1]); const mm=Number(m[2]); const ampm=m[3]?m[3].toLowerCase():null; if(ampm){ if(ampm==='pm'&&hh!==12) hh+=12; if(ampm==='am'&&hh===12) hh=0; } inDt=new Date(ref.getTime()); inDt.setHours(hh,mm,0,0); } }
      if(inDt && !isNaN(inDt.getTime())){
        const minutes = inDt.getHours() * 60 + inDt.getMinutes();
        if(minutes > (scheduled + grace)) totalLateMinutes += Math.max(0, minutes - scheduled);
      }
    }catch(e){}
  });
  return totalLateMinutes;
}

const items = [
  { id: '9395', date: '2025-12-15', timeIn: '8:13 am', timeOut: '6:14 pm', timeInISO: '2025-12-15T08:13:00' }
];
console.log('Testing: employee 9395 with time-in 08:13');
const late = computeLateForWeek(items, '9395');
console.log('Computed totalLateMinutes =', late, '(expected 13)');
