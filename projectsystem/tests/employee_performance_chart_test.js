// Tests for computeEmployeeMetricsForWeek logic

function computeEmployeeMetricsFromWeekItems(items, employees){
  const expectedDays = 6;
  const map = Object.create(null);
  items.forEach(rec => {
    if(!rec || !rec.id) return;
    const id = String(rec.id);
    let dayKey = rec.date || null;
    if(!dayKey){ if(rec.timeInISO){ const d=new Date(rec.timeInISO); if(!isNaN(d.getTime())) dayKey = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; } else if(rec.timeOutISO){ const d=new Date(rec.timeOutISO); if(!isNaN(d.getTime())) dayKey = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; } }
    if(!dayKey) return;
    if(!map[id]) map[id] = { days: Object.create(null) };
    let inMinutes = null;
    if(rec.timeInISO){ const d = new Date(rec.timeInISO); if(!isNaN(d.getTime())) inMinutes = d.getHours()*60 + d.getMinutes(); }
    else if(rec.timeIn){ const m = rec.timeIn.match(/(\d{1,2}):(\d{2})(?:\s*(am|pm))?/i); if(m){ let hh=Number(m[1]); const mm=Number(m[2]); const ampm=m[3]?m[3].toLowerCase():null; if(ampm){ if(ampm==='pm'&&hh!==12) hh+=12; if(ampm==='am'&&hh===12) hh=0; } inMinutes = hh*60 + mm; } }
    if(inMinutes === null) return;
    if(!map[id].days[dayKey] || inMinutes < map[id].days[dayKey].inMinutes) map[id].days[dayKey] = { inMinutes };
  });

  const rows = employees.map(emp => {
    const id = String(emp.id);
    const days = map[id] ? Object.keys(map[id].days) : [];
    const presentDays = days.length;
    let lateDays = 0;
    days.forEach(d => { if(map[id].days[d].inMinutes > (8*60 + 10)) lateDays++; });
    const onTime = presentDays - lateDays;
    const absent = Math.max(0, expectedDays - presentDays);
    const score = Math.round(((onTime * 1.0 + lateDays * 0.5) / expectedDays) * 100);
    return { id, name: emp.name, onTime, late: lateDays, absent, presentDays, score };
  });
  const avg = rows.length? Math.round(rows.reduce((s,r)=> s + (r.score||0), 0) / rows.length) : 0;
  return { rows, avgScore: avg };
}

// simple tests
const items = [
  { id: 'A', date: '2025-12-15', timeInISO: '2025-12-15T07:58:00' },
  { id: 'A', date: '2025-12-16', timeInISO: '2025-12-16T08:05:00' },
  { id: 'A', date: '2025-12-17', timeInISO: '2025-12-17T08:13:00' },
  { id: 'B', date: '2025-12-15', timeInISO: '2025-12-15T08:30:00' },
  { id: 'B', date: '2025-12-16', timeInISO: '2025-12-16T08:31:00' },
  { id: 'C', date: '2025-12-15', timeInISO: '2025-12-15T08:00:00' },
];

const employees = [ { id: 'A', name: 'AL' }, { id: 'B', name: 'BL' }, { id: 'C', name: 'CL' } ];

console.log('Running employee performance chart computation test...');
const out = computeEmployeeMetricsFromWeekItems(items, employees);
console.log('Rows:', out.rows);
console.log('Avg:', out.avgScore);
