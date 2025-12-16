// Tests for computePerformanceForWeek-like logic

function computePerformanceFromItems(items, empId){
  const scheduled = 8*60; const grace = 10; const expectedDays = 6;
  const seenDates = new Set();
  const lateDates = new Set();

  items.forEach(rec => {
    if(String(rec.id) !== String(empId)) return;
    let dayKey = rec.date || null;
    if(!dayKey){ if(rec.timeInISO){ const d = new Date(rec.timeInISO); if(!isNaN(d.getTime())) dayKey = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; } else if(rec.timeOutISO){ const d = new Date(rec.timeOutISO); if(!isNaN(d.getTime())) dayKey = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; } }
    if(!dayKey) return;
    seenDates.add(dayKey);
    // late check
    let inDt = null;
    if(rec.timeInISO) inDt = new Date(rec.timeInISO);
    else if(rec.timeIn && rec.date){ const ref = new Date(rec.date + 'T00:00:00'); const m = rec.timeIn.match(/(\d{1,2}):(\d{2})(?:\s*(am|pm))?/i); if(m){ let hh=Number(m[1]); const mm=Number(m[2]); const ampm=m[3]?m[3].toLowerCase():null; if(ampm){ if(ampm==='pm'&&hh!==12) hh+=12; if(ampm==='am'&&hh===12) hh=0; } inDt=new Date(ref.getTime()); inDt.setHours(hh,mm,0,0); } }
    if(inDt && !isNaN(inDt.getTime())){ const minutes = inDt.getHours()*60 + inDt.getMinutes(); if(minutes > (scheduled + grace)) lateDates.add(dayKey); }
  });

  const presentDays = seenDates.size;
  const lateDays = lateDates.size;
  const absentDays = Math.max(0, expectedDays - presentDays);

  let status = 'No data';
  if(presentDays >= expectedDays){
    if(lateDays === 0) status = 'Perfect attendance';
    else if(lateDays <= 1) status = 'Minor lates';
    else if(lateDays <= 3) status = 'Few lates';
    else status = 'Frequently late';
  } else {
    if(absentDays >= Math.ceil(expectedDays * 0.5)) status = 'Poor attendance';
    else if(lateDays >= 3) status = 'Frequently late';
    else if(lateDays > 0) status = 'Irregular attendance';
    else status = 'Some absences';
  }

  return { status, presentDays, absentDays, lateDays };
}

// helper to create a date string
function dstr(y,m,d){ return `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`; }

const tests = [];

// 1) Perfect: 6 present, all on-time
const itemsPerfect = [];
for(let i=1;i<=6;i++){ itemsPerfect.push({ id: 'A', date: dstr(2025,12,i), timeIn: '8:00 am', timeInISO: `2025-12-${String(i).padStart(2,'0')}T08:00:00` }); }
tests.push({name:'Perfect attendance', items: itemsPerfect, emp: 'A', expect: 'Perfect attendance'});

// 2) Few lates: 6 present, 2 late
const itemsFewLates = [];
for(let i=1;i<=6;i++){ const late = (i===2||i===5); itemsFewLates.push({ id: 'B', date: dstr(2025,12,i), timeIn: late ? '8:13 am' : '7:58 am', timeInISO: `2025-12-${String(i).padStart(2,'0')}T${late?'08:13:00':'07:58:00'}` }); }
tests.push({name:'Few lates', items: itemsFewLates, emp: 'B', expect: 'Few lates'});

// 3) Poor attendance: only 2 present
const itemsPoor = [ { id: 'C', date: dstr(2025,12,1), timeIn: '8:00 am', timeInISO: '2025-12-01T08:00:00' }, { id: 'C', date: dstr(2025,12,2), timeIn: '8:00 am', timeInISO: '2025-12-02T08:00:00' } ];
tests.push({name:'Poor attendance', items: itemsPoor, emp: 'C', expect: 'Poor attendance'});

// 4) Frequently late: 6 present, 4 late
const itemsFreqLate = [];
for(let i=1;i<=6;i++){ const late = (i<=4); itemsFreqLate.push({ id: 'D', date: dstr(2025,12,i), timeIn: late ? '8:20 am' : '8:00 am', timeInISO: `2025-12-${String(i).padStart(2,'0')}T${late?'08:20:00':'08:00:00'}` }); }
tests.push({name:'Frequently late', items: itemsFreqLate, emp: 'D', expect: 'Frequently late'});

// 5) Irregular: 5 present, 1 late -> irregular
const itemsIrregular = [];
for(let i=1;i<=5;i++){ const late = (i===3); itemsIrregular.push({ id: 'E', date: dstr(2025,12,i), timeIn: late ? '8:15 am' : '8:00 am', timeInISO: `2025-12-${String(i).padStart(2,'0')}T${late?'08:15:00':'08:00:00'}` }); }
tests.push({name:'Irregular attendance', items: itemsIrregular, emp: 'E', expect: 'Irregular attendance'});

console.log('Running employee performance tests...');
let passed = 0;
tests.forEach(t=>{
  const out = computePerformanceFromItems(t.items, t.emp);
  const ok = out.status === t.expect;
  console.log(`${t.name}: expected=${t.expect} got=${out.status} (present=${out.presentDays}, late=${out.lateDays}, absent=${out.absentDays}) ${ok? '✓':'✗'}`);
  if(ok) passed++;
});
console.log(`${passed}/${tests.length} tests passed.`);
