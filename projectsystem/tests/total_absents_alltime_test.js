// Tests computeAllTimeAbsents() behavior - simple scenarios

const attendance = [
  // Week 1 (2025-12-01 -> within the same week)
  { id: 'A', date: '2025-12-01' },
  { id: 'A', date: '2025-12-02' },
  { id: 'A', date: '2025-12-03' },
  { id: 'B', date: '2025-12-01' },
  { id: 'B', date: '2025-12-02' },
  { id: 'B', date: '2025-12-03' },
  { id: 'B', date: '2025-12-04' },
  { id: 'B', date: '2025-12-05' },
  { id: 'B', date: '2025-12-06' },

  // Week 2 (2025-12-08 -> new week)
  { id: 'A', date: '2025-12-08' },
  { id: 'A', date: '2025-12-09' },
  { id: 'B', date: '2025-12-08' },
  { id: 'B', date: '2025-12-09' },
  { id: 'B', date: '2025-12-10' },
  { id: 'B', date: '2025-12-11' }
];

const employees = [ { id: 'A' }, { id: 'B' } ];

function getWeekStartISO(dstr){
  const d = new Date(dstr + 'T00:00:00');
  const day = d.getDay();
  const diffToMonday = (day === 0) ? 6 : (day - 1);
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - diffToMonday);
  return `${monday.getFullYear()}-${String(monday.getMonth()+1).padStart(2,'0')}-${String(monday.getDate()).padStart(2,'0')}`;
}

function computeAllTimeAbsents(items, employeesList){
  if(!Array.isArray(items)) return { count:0, employees:0 };
  const expectedDays = 6;
  // collect employee ids
  const ids = new Set((employeesList || []).map(e => String(e.id)));
  items.forEach(r => { if(r && typeof r.id !== 'undefined') ids.add(String(r.id)); });

  // group items by weekStart
  const map = Object.create(null);
  items.forEach(rec => {
    try{
      if(!rec || !rec.date) return;
      const wk = getWeekStartISO(rec.date);
      if(!map[wk]) map[wk] = [];
      map[wk].push(rec);
    }catch(e){}
  });

  let total = 0;
  Object.keys(map).forEach(wk => {
    const presentByEmp = Object.create(null);
    map[wk].forEach(rec => {
      try{
        if(!rec || typeof rec.id === 'undefined' || !rec.date) return;
        const id = String(rec.id);
        if(!presentByEmp[id]) presentByEmp[id] = new Set();
        presentByEmp[id].add(rec.date);
      }catch(e){}
    });
    ids.forEach(id => {
      const p = presentByEmp[id] ? presentByEmp[id].size : 0;
      total += Math.max(0, expectedDays - p);
    });
  });

  return { count: total, employees: ids.size };
}

console.log('Running total absents all-time test...');
const r = computeAllTimeAbsents(attendance, employees);
console.log('Result:', r);
console.log('Expect: A(week1 3 absent, week2 4 absent) -> 7, B(week1 0, week2 2) -> 2, total 9');
