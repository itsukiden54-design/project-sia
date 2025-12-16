(function(){
  let employees = [];
  let archive = [];
  let originalSalary = 0; // Track original salary to prevent circular updates
  let originalEmployeeId = null; // when editing, remember which employee id we're editing
  
  // localStorage functions for data persistence
  function loadEmployeesFromStorage(){
    const stored = localStorage.getItem('payroll_employees');
    if(stored){
      try {
        const parsed = JSON.parse(stored) || [];
        // Ensure we have an array
        if(!Array.isArray(parsed)){
          employees = [];
        } else {
          // Deduplicate by employee id to avoid duplicates when multiple writes occurred
          const map = Object.create(null);
          for(const e of parsed){
            if(!e || !e.id) continue;
            // prefer the most recent entry (later items overwrite earlier)
            map[String(e.id)] = e;
          }
          employees = Object.keys(map).map(k => map[k]);
          // If deduplication changed the length, persist cleaned list back to storage
          if(parsed.length !== employees.length){
            try{ localStorage.setItem('payroll_employees', JSON.stringify(employees)); }catch(err){}
          }
        }
      }
      catch(e) { console.error('Failed to load employees:', e); employees = []; }
    }
  }

  // --- Side panel: render per-employee payslip status for a given weekIndex ---
  function findPayslipForWeekForEmployee(empId, weekStart){
    try{
      const key = 'employee_payslips_' + empId;
      const list = JSON.parse(localStorage.getItem(key) || '[]');
      if(!Array.isArray(list) || list.length === 0) return null;
      // Try to find by explicit weekStart/weekKey
      for(const p of list){ if(p && (p.weekStart === weekStart || p.weekKey === weekStart)) return p; }
      // fallback: created timestamp within the same week
      for(const p of list){ try{ if(p && p.created){ const start = getWeekStartISO(new Date(p.created)); if(start === weekStart) return p; } }catch(e){} }
      return null;
    }catch(e){ return null; }
  }

  function renderPayslipStatusSide(weekIndex){
    try{
      const container = document.getElementById('sidePayslipList');
      const labelEl = document.getElementById('sideWeekLabel');
      if(!container) return;
      container.innerHTML = '';
      if(!attendanceWeeks || attendanceWeeks.length === 0){ container.innerHTML = '<div class="muted" style="padding:12px">No attendance weeks available</div>'; if(labelEl) labelEl.textContent = '—'; return; }
      const idx = Math.min(Math.max(0, weekIndex || 0), attendanceWeeks.length - 1);
      const wk = attendanceWeeks[idx];
      const weekStart = wk && wk.weekStart ? wk.weekStart : null;
      if(labelEl){ labelEl.textContent = weekStart ? formatWeekLabelFromStart(weekStart) : ('Week ' + (idx+1)); }

      // Build per-employee status list
      if(!employees || employees.length === 0){ container.innerHTML = '<div class="muted" style="padding:12px">No employees available</div>'; return; }
      const list = document.createElement('div'); list.style.display = 'flex'; list.style.flexDirection = 'column'; list.style.gap = '8px';
      employees.forEach(emp => {
        try{
          const p = findPayslipForWeekForEmployee(emp.id, weekStart);
          const r = document.createElement('div'); r.style.display='flex'; r.style.justifyContent='space-between'; r.style.alignItems='center'; r.style.padding='8px'; r.style.borderBottom='1px solid #f1f5f9';
          const left = document.createElement('div'); left.style.flex='1'; left.innerHTML = `<div style="font-weight:700;font-size:13px">${emp.name || emp.id}</div><div class="muted" style="font-size:12px">${emp.id}</div>`;
          const right = document.createElement('div'); right.style.minWidth='140px'; right.style.textAlign='right';
          // also compute weekly performance for the selected week
          let perf = null;
          try{ perf = computePerformanceForWeek(idx, emp.id); }catch(e){ perf = null; }

          if(p){
            const status = p.status || 'Pending';
            const badge = document.createElement('span');
            badge.textContent = status;
            badge.style.display='inline-block'; badge.style.padding='6px 8px'; badge.style.borderRadius='12px'; badge.style.color='#fff'; badge.style.fontSize='12px';
            if(status === 'Approved') badge.style.background = '#10b981';
            else if(status === 'Rejected') badge.style.background = '#ef4444';
            else badge.style.background = '#f59e0b';
            right.appendChild(badge);
            // show performance badge below status if we have performance info
            if(perf){
              const pBadge = document.createElement('div');
              pBadge.textContent = perf.status || '';
              pBadge.style.marginTop = '6px';
              pBadge.style.fontSize = '11px';
              pBadge.style.padding = '6px 8px';
              pBadge.style.borderRadius = '10px';
              pBadge.style.display = 'inline-block';
              pBadge.style.color = '#fff';
              // color mapping
              
            }
          } else {
            const none = document.createElement('div'); none.textContent = 'No payslip'; none.style.color='#6b7280'; none.style.fontSize='12px'; right.appendChild(none);
          }
          r.appendChild(left); r.appendChild(right);
          list.appendChild(r);
        }catch(e){ }
      });
      container.appendChild(list);
      // totals summary removed by request
    }catch(e){ console.warn('renderPayslipStatusSide failed', e); }
  }

  // Print the side payslip status list for the week as a printable page
  function printSidePayslipStatusForWeek(weekIndex){
    try{
      if(!attendanceWeeks || attendanceWeeks.length === 0) { alert('No weeks available'); return; }
      const idx = Math.min(Math.max(0, weekIndex||0), attendanceWeeks.length-1); const wk = attendanceWeeks[idx]; const weekStart = wk.weekStart || null;
      const rows = [];
      employees.forEach(emp => { const p = findPayslipForWeekForEmployee(emp.id, weekStart); const status = p? (p.status||'Pending') : 'No payslip';
        // include perf summary if available
        let perf = { status: 'No data', presentDays: 0, absentDays: 0, lateDays: 0 };
        try{ perf = computePerformanceForWeek(idx, emp.id) || perf; }catch(e){}
        rows.push({ id: emp.id, name: emp.name, status, perf });
      });
      const printable = `<!doctype html><html><head><meta charset="utf-8"><title>Payslip Status ${weekStart}</title></head><body style="font-family:Arial;color:#111;padding:18px"><h2>Payslip Status ${formatWeekLabelFromStart(weekStart)}</h2><table style="width:100%;border-collapse:collapse;margin-top:8px"><thead><tr><th style="padding:8px;border:1px solid #ddd;background:#f3f4f6">EMP ID</th><th style="padding:8px;border:1px solid #ddd;background:#f3f4f6">Name</th><th style="padding:8px;border:1px solid #ddd;background:#f3f4f6">Status</th><th style="padding:8px;border:1px solid #ddd;background:#f3f4f6">Performance (wk)</th></tr></thead><tbody>${rows.map(r=>`<tr><td style="padding:6px;border:1px solid #ddd">${r.id}</td><td style="padding:6px;border:1px solid #ddd">${r.name}</td><td style="padding:6px;border:1px solid #ddd">${r.status}</td><td style="padding:6px;border:1px solid #ddd">${r.perf.status} • ${r.perf.presentDays}P/${r.perf.lateDays}L/${r.perf.absentDays}A</td></tr>`).join('')}</tbody></table><div style="margin-top:16px;color:#666;font-size:12px">Generated: ${new Date().toLocaleString()}</div></body></html>`;
      const w = window.open('', '_blank'); if(!w){ alert('Please allow popups to print'); return; }
      w.document.write(printable); w.document.close(); setTimeout(()=>{ try{ w.focus(); w.print(); }catch(e){} }, 300);
    }catch(e){ console.warn(e); alert('Failed to create printable list'); }
  }

  function downloadSidePayslipCSV(weekIndex){
    try{
      if(!attendanceWeeks || attendanceWeeks.length === 0) { alert('No weeks available'); return; }
      const idx = Math.min(Math.max(0, weekIndex||0), attendanceWeeks.length-1); const wk = attendanceWeeks[idx]; const weekStart = wk.weekStart || null;
      const rows = [['EMP ID','Name','Status','Performance (wk)']];
      employees.forEach(emp => { const p = findPayslipForWeekForEmployee(emp.id, weekStart); const status = p? (p.status||'Pending') : 'No payslip'; let perf = { status: 'No data', presentDays: 0, absentDays: 0, lateDays: 0 }; try{ perf = computePerformanceForWeek(idx, emp.id) || perf; }catch(e){} rows.push([emp.id, emp.name || '', status, `${perf.status} • ${perf.presentDays}P/${perf.lateDays}L/${perf.absentDays}A`]); });
      const csv = rows.map(r=> r.map(c=> '"'+String(c).replace(/"/g,'""')+'"').join(',')).join('\n');
      const blob = new Blob([csv], {type:'text/csv'}); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `payslip_status_${weekStart||'week' }.csv`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    }catch(e){ console.warn(e); alert('Failed to export CSV'); }
  }
  
  function saveEmployeesToStorage(){
    localStorage.setItem('payroll_employees', JSON.stringify(employees));
  }

  function loadArchiveFromStorage(){
    const stored = localStorage.getItem('payroll_archive');
    if(stored){
      try { archive = JSON.parse(stored); }
      catch(e) { console.error('Failed to load archive:', e); archive = []; }
    }
  }

  function saveArchiveToStorage(){
    localStorage.setItem('payroll_archive', JSON.stringify(archive));
  }

  let attendance = [];

  // Firestore handle (if firebase SDK loaded)
  let db = null;
  try{
    if(window.firebase && firebase.firestore){
      db = firebase.firestore();
    }
  }catch(e){ db = null; }

  // Helper: sync a single attendance record to Firestore (best-effort)
  function syncRecordToFirestore(rec){
    if(!db) return Promise.resolve(null);
    try{
      // compute workedHours (net excluding 12:00-13:00) and payableHours (capped to 8h/day) if possible
      let workedHours = 0;
      let payableHours = 0;
      try{
        if(rec.timeInISO && rec.timeOutISO){
          const inDt = new Date(rec.timeInISO);
          const outDt = new Date(rec.timeOutISO);
          const netMin = computeNetMinutesBetween(inDt, outDt);
          workedHours = Math.round((netMin / 60) * 100) / 100; // actual net hours excluding lunch
          payableHours = Math.round((Math.min(netMin, 8 * 60) / 60) * 100) / 100; // capped to 8h per day
        }
      }catch(e){ workedHours = 0; payableHours = 0; }

      // find employee to get weekly salary and statutory deductions
      const emp = (employees || []).find(e => String(e.id) === String(rec.id));
      const weeklySalary = emp && typeof emp.salary !== 'undefined' && emp.salary !== null ? Math.round(Number(emp.salary) / 52) : (510 * 6);
      const sss = emp && emp.deductions ? Number(emp.deductions.sss || 300) : 300;
      const phil = emp && emp.deductions ? Number(emp.deductions.philhealth || 250) : 250;
      const pagibig = emp && emp.deductions ? Number(emp.deductions.pagibig || 200) : 200;
      const statutoryTotal = Math.round((sss + phil + pagibig) * 100) / 100;

      // compute late minutes relative to 08:00 start with a 10-minute grace period
      let lateMinutes = 0;
      if(rec.timeInISO){
        const inDt = new Date(rec.timeInISO);
        const minutes = inDt.getHours() * 60 + inDt.getMinutes();
        const scheduled = 8 * 60; // 08:00
        const grace = 10; // minutes grace (arrivals up to 08:10 are allowed without deduction)
        // If arrival is within the grace window => no deduction. If it's later than grace, deduction is minutes late since 08:00.
        if(minutes > (scheduled + grace)) lateMinutes = minutes - scheduled; // per-user example: arriving 08:11 => 11 minutes late
      }
      const lateDeduction = calculateLateDeduction(weeklySalary, Math.floor(lateMinutes/60), lateMinutes % 60);

      const grossWeek = weeklySalary;
      const netWeek = Math.round((grossWeek - statutoryTotal - lateDeduction) * 100) / 100;

      const payload = {
        attendanceId: rec.attendanceId || null,
        empId: rec.id || null,
        name: rec.name || null,
        role: rec.role || null,
        date: rec.date || null,
        timeIn: rec.timeIn || null,
        timeOut: rec.timeOut || null,
        timeInISO: rec.timeInISO || null,
        timeOutISO: rec.timeOutISO || null,
        workedHours: workedHours,
        payableHours: payableHours,
        actualWorkedMinutes: rec.actualWorkedMinutes || null,
        payableMinutes: rec.payableMinutes || null,
        lateMinutes: lateMinutes,
        lateDeduction: lateDeduction,
        sss: sss,
        philhealth: phil,
        pagibig: pagibig,
        statutoryTotal: statutoryTotal,
        grossWeek: grossWeek,
        netWeek: netWeek,
        weeklySalary: weeklySalary,
        source: 'admin_local',
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      };

      // If this record already references a Firestore document, update it
      const setDocAndPersist = (docRef) => {
        // Persist firestoreId on the in-memory record and localStorage
        try{ rec.firestoreId = docRef.id; saveAttendanceToStorage(); }catch(e){}
        console.log('Attendance saved/updated to Firestore:', docRef.id);
        return docRef;
      };

      if(rec.firestoreId){
        return db.collection('attendance_records').doc(rec.firestoreId).set(payload, { merge: true }).then(()=> setDocAndPersist({ id: rec.firestoreId })).catch(err=>{ console.warn('Firestore update failed', err); throw err; });
      }

      // Try to find by attendanceId (in case the 'time in' created a doc earlier without storing firestoreId)
      if(rec.attendanceId){
        return db.collection('attendance_records').where('attendanceId','==',rec.attendanceId).limit(1).get().then(qs=>{
          if(qs && !qs.empty && qs.docs && qs.docs.length){
            const doc = qs.docs[0];
            return doc.ref.set(payload, { merge: true }).then(()=> setDocAndPersist(doc.ref));
          }
          // not found — create new
          return db.collection('attendance_records').add(Object.assign({}, payload, { createdAt: firebase.firestore.FieldValue.serverTimestamp() })).then(docRef => setDocAndPersist(docRef));
        }).catch(err=>{ console.warn('Firestore lookup failed', err); throw err; });
      }

      // fallback: create new document
      return db.collection('attendance_records').add(Object.assign({}, payload, { createdAt: firebase.firestore.FieldValue.serverTimestamp() })).then(docRef => setDocAndPersist(docRef)).catch(err=>{ console.warn('Firestore add failed', err); throw err; });
    }catch(e){ return Promise.reject(e); }
  }

  // Attendance pagination state
  let attendancePageSize = 10;
  let attendanceCurrentPage = 1;
  let attendanceWeeks = []; // grouped by week (newest first)
  // chart state: attendance week index for the chart (0 = newest)
  let attendanceChartWeekIndex = 0;
  // performance chart week index (independent from attendance chart)
  let perfChartWeekIndex = 0;
  // side panel week index (independent from attendance chart)
  let sideWeekIndex = 0;
  // leave-week index (for Leave Management panel) - independent
  let leavesWeekIndex = 0;
  let attendanceChart = null; // Chart.js instance

  function formatWeekLabelFromStart(weekStart){
    if(!weekStart) return '—';
    try{
      const start = new Date(weekStart + 'T00:00:00');
      const end = new Date(start.getTime() + 6 * 24 * 3600 * 1000);
      const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      const sMon = months[start.getMonth()]; const eMon = months[end.getMonth()];
      const sDay = start.getDate(); const eDay = end.getDate();
      const pad = d => String(d).padStart(2,'0');
      if(start.getFullYear() === end.getFullYear()){
        return (sMon === eMon) ? `${sMon} ${sDay} - ${eDay}, ${start.getFullYear()}` : `${sMon} ${sDay} - ${eMon} ${pad(eDay)}, ${start.getFullYear()}`;
      }
      return `${sMon} ${sDay}, ${start.getFullYear()} - ${eMon} ${pad(eDay)}, ${end.getFullYear()}`;
    }catch(e){ return '—'; }
  }

  // Render the weekly attendance bar chart for the given weekIndex (0 = newest)
  function renderAttendanceChart(weekIndex){
    try{
      if(!attendanceWeeks || attendanceWeeks.length === 0){
        // clear chart and label
        const labelEl = document.getElementById('chartWeekLabel'); if(labelEl) labelEl.textContent = '—';
        if(attendanceChart){ attendanceChart.data.datasets[0].data = [0,0,0,0,0,0,0]; attendanceChart.update(); }
        return;
      }
      // clamp index
      const idx = Math.min(Math.max(0, weekIndex), attendanceWeeks.length - 1);
      attendanceChartWeekIndex = idx;
      const wk = attendanceWeeks[idx];
      const counts = [0,0,0,0,0,0,0]; // Sunday=0..Saturday=6
      if(wk && Array.isArray(wk.items)){
        wk.items.forEach(rec => {
          try{
            // determine date for the record
            let dt = null;
            if(rec.timeOutISO) dt = new Date(rec.timeOutISO);
            else if(rec.timeInISO) dt = new Date(rec.timeInISO);
            else if(rec.date) dt = new Date(rec.date + 'T00:00:00');
            if(!dt || isNaN(dt.getTime())) return;
            const dow = dt.getDay(); // 0..6
            counts[dow] = (counts[dow] || 0) + 1;
          }catch(e){}
        });
      }
      // Create/update Chart.js bar chart
      const ctx = document.getElementById('attendanceWeekChart');
      const labels = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
      if(!ctx) return;
      if(!attendanceChart){
        attendanceChart = new Chart(ctx, {
          type: 'bar',
          data: { labels: labels, datasets: [{ label: 'Attendances', data: counts, backgroundColor: '#3b82f6' }] },
          options: { scales: { y: { beginAtZero: true, ticks: { precision:0 } } }, plugins: { legend: { display: false } }, responsive: true, maintainAspectRatio: false }
        });
      } else {
        attendanceChart.data.datasets[0].data = counts;
        attendanceChart.update();
      }
      // update label
      const labelEl = document.getElementById('chartWeekLabel');
      if(labelEl){
        labelEl.textContent = wk.weekStart ? formatWeekLabelFromStart(wk.weekStart) : ('Week ' + (idx+1));
      }
      // Do NOT render employee performance chart here — keep charts independent.
      // keep side panel independent — don't update it here
    }catch(e){ console.warn('Chart render failed', e); }
  }

  function changeAttendanceChartWeek(delta){
    if(!attendanceWeeks || attendanceWeeks.length===0) return;
    attendanceChartWeekIndex = Math.min(Math.max(0, attendanceChartWeekIndex + delta), attendanceWeeks.length - 1);
    renderAttendanceChart(attendanceChartWeekIndex);
  }

  // compute per-employee performance metrics for a week (array of { id, name, onTime, late, absent, presentDays, score })
  function computeEmployeeMetricsForWeek(weekIndex){
    try{
      if(!attendanceWeeks || attendanceWeeks.length === 0) return { rows: [], avgScore: 0 };
      const wk = attendanceWeeks[Math.min(Math.max(0, weekIndex || 0), attendanceWeeks.length - 1)];
      if(!wk || !Array.isArray(wk.items)) return { rows: [], avgScore: 0 };
      const expectedDays = 6; // Mon-Sat
      const rows = [];
      // index attendance per employee per date
      const map = Object.create(null);
      wk.items.forEach(rec => {
        try{
          if(!rec || !rec.id) return;
          const empId = String(rec.id);
          let dayKey = rec.date || null;
          if(!dayKey){ if(rec.timeInISO){ const d = new Date(rec.timeInISO); if(!isNaN(d.getTime())) dayKey = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; } else if(rec.timeOutISO){ const d = new Date(rec.timeOutISO); if(!isNaN(d.getTime())) dayKey = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; } }
          if(!dayKey) return;
          if(!map[empId]) map[empId] = { id: empId, days: Object.create(null) };
          // For each day keep earliest timeIn for lateness check
          const current = map[empId].days[dayKey];
          let inMinutes = null;
          if(rec.timeInISO){ const d = new Date(rec.timeInISO); if(!isNaN(d.getTime())) inMinutes = d.getHours()*60 + d.getMinutes(); }
          else if(rec.timeIn){ const m = rec.timeIn.match(/(\d{1,2}):(\d{2})(?:\s*(am|pm))?/i); if(m){ let hh=Number(m[1]); const mm=Number(m[2]); const ampm=m[3]?m[3].toLowerCase():null; if(ampm){ if(ampm==='pm'&&hh!==12) hh+=12; if(ampm==='am'&&hh===12) hh=0; } inMinutes = hh*60 + mm; } }
          if(inMinutes === null) return; // ignore entries without workable timeIn
          if(!current || typeof current.inMinutes === 'undefined' || inMinutes < current.inMinutes) map[empId].days[dayKey] = { inMinutes };
        }catch(e){}
      });

      // compute for each employee in employees list in memory
      for(const emp of (employees || [])){
        try{
          const id = String(emp.id);
          const obj = map[id] || { days: Object.create(null) };
          const seenDates = Object.keys(obj.days || {});
          const presentDays = seenDates.length;
          let lateDays = 0;
          seenDates.forEach(d => { const inMin = obj.days[d].inMinutes || 0; if(inMin > (8*60 + 10)) lateDays++; });
          const onTime = presentDays - lateDays;
          const absent = Math.max(0, expectedDays - presentDays);
          // score: onTime = 1.0, late = 0.5, absent = 0
          const score = Math.round(((onTime * 1.0 + lateDays * 0.5) / expectedDays) * 100);
          rows.push({ id: id, name: emp.name || id, onTime, late: lateDays, absent, presentDays, score });
        }catch(e){}
      }
      // sort by score descending
      rows.sort((a,b)=> b.score - a.score || b.name.localeCompare(a.name));
      const avg = rows.length ? Math.round(rows.reduce((s,r)=> s + (typeof r.score === 'number' ? r.score : 0), 0) / rows.length) : 0;
      return { rows, avgScore: avg };
    }catch(e){ return { rows: [], avgScore: 0 }; }
  }

  let employeePerformanceChart = null;
  let perfSearchQuery = ''; // Track search query
  
  function renderEmployeePerformanceChart(weekIndex){
    try{
      if(!attendanceWeeks || attendanceWeeks.length === 0) {
        perfChartWeekIndex = 0;
      } else {
        perfChartWeekIndex = Math.min(Math.max(0, weekIndex || 0), attendanceWeeks.length - 1);
      }
      const ctx = document.getElementById('employeePerformanceChart');
      if(!ctx) return;
      let data = computeEmployeeMetricsForWeek(perfChartWeekIndex);
      
      // Apply search filter
      if(perfSearchQuery.trim()){
        const query = perfSearchQuery.toLowerCase().trim();
        data.rows = data.rows.filter(r => 
          r.name.toLowerCase().includes(query) || 
          String(r.id).includes(query)
        );
        // Recalculate average for filtered results
        data.avgScore = data.rows.length ? Math.round(data.rows.reduce((s,r)=> s + (typeof r.score === 'number' ? r.score : 0), 0) / data.rows.length) : 0;
      }
      
      const labels = data.rows.map(r => r.name + ` (${r.id})`);
      const onTime = data.rows.map(r => r.onTime);
      const late = data.rows.map(r => r.late);
      const absent = data.rows.map(r => r.absent);
      // show summary text
      const summaryTextEl = document.getElementById('perfSummaryText');
      if(summaryTextEl) summaryTextEl.textContent = `${data.avgScore}% average`;

      // update week label
      const weekLabelEl = document.getElementById('perfWeekLabel');
      if(weekLabelEl) {
        if(attendanceWeeks && attendanceWeeks.length > 0) {
          const wk = attendanceWeeks[perfChartWeekIndex];
          weekLabelEl.textContent = wk && wk.weekStart ? formatWeekLabelFromStart(wk.weekStart) : ('Week ' + (perfChartWeekIndex+1));
        } else {
          weekLabelEl.textContent = '—';
        }
      }

      if(!employeePerformanceChart){
        employeePerformanceChart = new Chart(ctx, {
          type: 'bar',
          data: { labels: labels, datasets: [
            { label: 'On-time', data: onTime, backgroundColor: '#059669' },
            { label: 'Late', data: late, backgroundColor: '#f59e0b' },
            { label: 'Absent', data: absent, backgroundColor: '#9ca3af' }
          ] },
          options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            scales: { x: { stacked: true, beginAtZero: true, ticks:{ precision:0 } }, y: { stacked: true } },
            plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: function(ctx){ return ctx.dataset.label + ': ' + ctx.parsed.x; } } } }
          }
        });
      } else {
        employeePerformanceChart.data.labels = labels;
        employeePerformanceChart.data.datasets[0].data = onTime;
        employeePerformanceChart.data.datasets[1].data = late;
        employeePerformanceChart.data.datasets[2].data = absent;
        employeePerformanceChart.update();
      }
    }catch(e){ console.warn('renderEmployeePerformanceChart failed', e); }
  }

  // Wire up previous/next week buttons for performance chart
  const perfPrevBtnImmediate = document.getElementById('perfPrevWeek');
  const perfNextBtnImmediate = document.getElementById('perfNextWeek');
  if(perfPrevBtnImmediate) perfPrevBtnImmediate.addEventListener('click', function (){
    if(!attendanceWeeks || attendanceWeeks.length === 0) return;
    perfChartWeekIndex = Math.max(0, perfChartWeekIndex - 1);
    renderEmployeePerformanceChart(perfChartWeekIndex);
  });
  if(perfNextBtnImmediate) perfNextBtnImmediate.addEventListener('click', function (){
    if(!attendanceWeeks || attendanceWeeks.length === 0) return;
    perfChartWeekIndex = Math.min(attendanceWeeks.length - 1, perfChartWeekIndex + 1);
    renderEmployeePerformanceChart(perfChartWeekIndex);
  });

  // Wire up search input for performance chart
  const perfSearchInput = document.getElementById('perfSearchInput');
  const perfSearchClear = document.getElementById('perfSearchClear');
  if(perfSearchInput){
    perfSearchInput.addEventListener('input', (e)=>{
      perfSearchQuery = e.target.value;
      renderEmployeePerformanceChart(perfChartWeekIndex);
    });
  }
  if(perfSearchClear){
    perfSearchClear.addEventListener('click', ()=>{
      perfSearchQuery = '';
      if(perfSearchInput) perfSearchInput.value = '';
      renderEmployeePerformanceChart(perfChartWeekIndex);
    });
  }

  function printAttendanceReportForWeek(weekIndex){
    try{
      if(!attendanceWeeks || attendanceWeeks.length===0) { alert('No attendance records for this week.'); return; }
      const wk = attendanceWeeks[Math.min(Math.max(0, weekIndex), attendanceWeeks.length-1)];
      // compute week start/end
      const start = new Date(wk.weekStart + 'T00:00:00');
      const end = new Date(start.getTime() + 6*24*3600*1000);
      // Build printable HTML
      const rows = (wk.items || []).map(rec => {
        const d = rec.timeInISO ? new Date(rec.timeInISO) : (rec.timeOutISO ? new Date(rec.timeOutISO) : (rec.date ? new Date(rec.date+'T00:00:00') : null));
        const dateStr = d ? `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` : (rec.date || '—');
        const inStr = rec.timeInISO ? (new Date(rec.timeInISO)).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : (rec.timeIn || '—');
        const outStr = rec.timeOutISO ? (new Date(rec.timeOutISO)).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : (rec.timeOut || '—');
        const id = rec.attendanceId || '—';
        return `<tr><td style="padding:6px;border:1px solid #ddd">${dateStr}</td><td style="padding:6px;border:1px solid #ddd">${rec.id||''}</td><td style="padding:6px;border:1px solid #ddd">${rec.name||''}</td><td style="padding:6px;border:1px solid #ddd">${inStr}</td><td style="padding:6px;border:1px solid #ddd">${outStr}</td><td style="padding:6px;border:1px solid #ddd">${id}</td></tr>`;
      }).join('');
      const printable = `<!doctype html><html><head><meta charset="utf-8"><title>Attendance Report</title></head><body style="font-family:Arial;color:#111;padding:18px"><h2>Attendance Report ${formatWeekLabelFromStart(wk.weekStart)}</h2><table style="width:100%;border-collapse:collapse;margin-top:8px"><thead><tr><th style="padding:8px;border:1px solid #ddd;background:#f3f4f6">Date</th><th style="padding:8px;border:1px solid #ddd;background:#f3f4f6">Employee ID</th><th style="padding:8px;border:1px solid #ddd;background:#f3f4f6">Name</th><th style="padding:8px;border:1px solid #ddd;background:#f3f4f6">Time In</th><th style="padding:8px;border:1px solid #ddd;background:#f3f4f6">Time Out</th><th style="padding:8px;border:1px solid #ddd;background:#f3f4f6">Attendance ID</th></tr></thead><tbody>${rows || '<tr><td colspan="6" style="padding:12px;border:1px solid #ddd">No attendance records</td></tr>'}</tbody></table><div style="margin-top:16px;color:#666;font-size:12px">Generated: ${new Date().toLocaleString()}</div></body></html>`;
      const w = window.open('', '_blank'); if(!w){ alert('Please allow popups to print the attendance report'); return; }
      w.document.write(printable); w.document.close(); w.focus(); setTimeout(()=>{ try{ w.print(); }catch(e){} },300);
    }catch(e){ console.error('Failed to print attendance report', e); alert('Failed to create printable report'); }
  }

  // Download the attendance report as a PDF (uses html2canvas + jsPDF with a printable fallback)
  function downloadAttendanceReportForWeek(weekIndex){
    try{
      if(!attendanceWeeks || attendanceWeeks.length===0){ alert('No attendance records for this week.'); return; }
      const wk = attendanceWeeks[Math.min(Math.max(0, weekIndex), attendanceWeeks.length-1)];

      // Build a container element with similar markup as printable string from printAttendanceReportForWeek
      const rows = (wk.items || []).map(rec => {
        const d = rec.timeInISO ? new Date(rec.timeInISO) : (rec.timeOutISO ? new Date(rec.timeOutISO) : (rec.date ? new Date(rec.date+'T00:00:00') : null));
        const dateStr = d ? `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` : (rec.date || '—');
        const inStr = rec.timeInISO ? (new Date(rec.timeInISO)).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : (rec.timeIn || '—');
        const outStr = rec.timeOutISO ? (new Date(rec.timeOutISO)).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : (rec.timeOut || '—');
        const id = rec.attendanceId || '—';
        return `<tr><td style="padding:6px;border:1px solid #ddd">${dateStr}</td><td style="padding:6px;border:1px solid #ddd">${rec.id||''}</td><td style="padding:6px;border:1px solid #ddd">${rec.name||''}</td><td style="padding:6px;border:1px solid #ddd">${inStr}</td><td style="padding:6px;border:1px solid #ddd">${outStr}</td><td style="padding:6px;border:1px solid #ddd">${id}</td></tr>`;
      }).join('');

      const generateContainer = ()=>{
        const container = document.createElement('div');
        container.style.width = '900px';
        container.style.padding = '18px';
        container.style.background = '#fff';
        container.style.color = '#111';
        container.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px"><div><h2 style=\"margin:0\">Attendance Report</h2><div style=\"color:#666\">Week: ${formatWeekLabelFromStart(wk.weekStart)}</div></div><div style=\"text-align:right\"><div style=\"font-weight:700\">Admin Export</div><div>${new Date().toLocaleDateString()}</div></div></div><table style=\"width:100%;border-collapse:collapse;margin-top:8px\"><thead><tr><th style=\"padding:8px;border:1px solid #ddd;background:#f3f4f6\">Date</th><th style=\"padding:8px;border:1px solid #ddd;background:#f3f4f6\">Employee ID</th><th style=\"padding:8px;border:1px solid #ddd;background:#f3f4f6\">Name</th><th style=\"padding:8px;border:1px solid #ddd;background:#f3f4f6\">Time In</th><th style=\"padding:8px;border:1px solid #ddd;background:#f3f4f6\">Time Out</th><th style=\"padding:8px;border:1px solid #ddd;background:#f3f4f6\">Attendance ID</th></tr></thead><tbody>${rows || '<tr><td colspan="6" style="padding:12px;border:1px solid #ddd">No attendance records</td></tr>'}</tbody></table><div style=\"margin-top:16px;color:#666;font-size:12px\">Generated: ${new Date().toLocaleString()}</div>`;
        return container;
      };

      const doFallback = ()=>{
        try{ const w = window.open('', '_blank', 'noopener'); if(!w){ alert('Allow popups to download the attendance report.'); return; } const container = generateContainer(); w.document.write('<!doctype html><html><head><meta charset="utf-8"><title>Attendance Report</title></head><body>'+container.innerHTML+'</body></html>'); w.document.close(); setTimeout(()=>{ try{ w.focus(); w.print(); }catch(e){} },400); }catch(e){ alert('Failed to generate attendance report.'); }
      };

      // Load libs and generate PDF (reuse the same libs used elsewhere)
      const loadScript = (src)=> new Promise((resolve,reject)=>{ if(document.querySelector('script[src="'+src+'"]')) return resolve(); const s=document.createElement('script'); s.src=src; s.onload=()=>resolve(); s.onerror=()=>reject(new Error('Failed to load '+src)); document.head.appendChild(s); });
      const html2canvasUrl = 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js';
      const jsPdfUrl = 'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js';

      Promise.all([loadScript(html2canvasUrl), loadScript(jsPdfUrl)]).then(()=>{
        const container = generateContainer(); container.style.boxSizing='border-box'; container.style.background='#fff'; container.style.padding='18px'; container.style.width='900px'; container.style.maxWidth='900px'; container.style.position='fixed'; container.style.left='-9999px'; container.style.top='0'; document.body.appendChild(container);
        const scale = 2;
        window.html2canvas(container, { scale: scale, backgroundColor: '#ffffff' }).then(canvas => {
          try{
            const jsPDF = (window.jspdf && window.jspdf.jsPDF) ? window.jspdf.jsPDF : (window.jsPDF || null);
            if(!jsPDF){ if(container && container.parentNode) container.parentNode.removeChild(container); doFallback(); return; }
            const imgData = canvas.toDataURL('image/png');
            const pdf = new jsPDF('p','mm','a4');
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = pdf.internal.pageSize.getHeight();
            const imgProps = { width: canvas.width, height: canvas.height };
            const imgWidth = pdfWidth; const imgHeight = (imgProps.height * imgWidth) / imgProps.width;
            let heightLeft = imgHeight; let position = 0;
            pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
            heightLeft -= pdfHeight;
            while(heightLeft > -1){ position = heightLeft - imgHeight; pdf.addPage(); pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight); heightLeft -= pdfHeight; }
            const filename = `attendance_report_${wk.weekStart || (new Date()).toISOString().slice(0,10)}.pdf`;
            pdf.save(filename);
          }catch(err){ console.error(err); doFallback(); }
          if(container && container.parentNode) container.parentNode.removeChild(container);
        }).catch(err => { console.error(err); if(container && container.parentNode) container.parentNode.removeChild(container); doFallback(); });
      }).catch(err=>{ console.error('Failed to load PDF libs', err); doFallback(); });

    }catch(e){ console.error('downloadAttendanceReportForWeek failed', e); alert('Failed to create attendance report PDF'); }
  }

  function loadAttendanceFromStorage(){
    try{ attendance = JSON.parse(localStorage.getItem('payroll_attendance') || '[]'); }
    catch(e){ attendance = []; }
    // Normalize and sort newest-first by available timestamp (prefer timeOutISO, then timeInISO, then date)
    attendance = attendance.map(a => a || {}).sort((a,b)=>{
      const getTs = r => {
        if(!r) return 0;
        if(r.timeOutISO) return new Date(r.timeOutISO).getTime() || 0;
        if(r.timeInISO) return new Date(r.timeInISO).getTime() || 0;
        if(r.date) return new Date(r.date + 'T00:00:00').getTime() || 0;
        return 0;
      };
      return (getTs(b) - getTs(a));
    });
    // build weekly groups (Monday-start weeks)
    buildAttendanceWeeks();
  }

  // return ISO date string (YYYY-MM-DD) for the Monday of the week the date falls in
  function getWeekStartISO(dateLike){
    const d = (typeof dateLike === 'string' || typeof dateLike === 'number') ? new Date(dateLike) : (dateLike instanceof Date ? dateLike : null);
    if(!d || isNaN(d.getTime())) return null;
    // getDay: 0 = Sunday, 1 = Monday, ..., 6 = Saturday
    const day = d.getDay();
    // compute how many days to subtract to get Monday
    const diffToMonday = (day === 0) ? 6 : (day - 1);
    const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - diffToMonday);
    return `${monday.getFullYear()}-${String(monday.getMonth()+1).padStart(2,'0')}-${String(monday.getDate()).padStart(2,'0')}`;
  }

  function buildAttendanceWeeks(){
    const map = Object.create(null);
    attendance.forEach(rec => {
      // determine a date for the record: prefer timeOutISO, then timeInISO, then rec.date
      let ts = null;
      if(rec.timeOutISO) ts = new Date(rec.timeOutISO);
      else if(rec.timeInISO) ts = new Date(rec.timeInISO);
      else if(rec.date) ts = new Date(rec.date + 'T00:00:00');
      if(!ts || isNaN(ts.getTime())) ts = new Date();
      const key = getWeekStartISO(ts) || getWeekStartISO(new Date());
      if(!map[key]) map[key] = [];
      map[key].push(rec);
    });
    // convert to array, sort keys newest-first
    const entries = Object.keys(map).map(k => ({ weekStart: k, items: map[k] }));
    entries.sort((a,b)=>{ return new Date(b.weekStart).getTime() - new Date(a.weekStart).getTime(); });
    attendanceWeeks = entries;
    // ensure current page is within bounds
    if(attendanceWeeks.length === 0) attendanceCurrentPage = 1;
    else attendanceCurrentPage = Math.min(Math.max(1, attendanceCurrentPage), attendanceWeeks.length);
    // Ensure chart week index stays within bounds and refresh chart
    try{
      attendanceChartWeekIndex = Math.min(Math.max(0, attendanceChartWeekIndex), Math.max(0, attendanceWeeks.length - 1));
      // Make sure the side panel index and leaves index are kept within bounds (both independent)
      sideWeekIndex = Math.min(Math.max(0, sideWeekIndex), Math.max(0, attendanceWeeks.length - 1));
      leavesWeekIndex = Math.min(Math.max(0, leavesWeekIndex), Math.max(0, attendanceWeeks.length - 1));
      renderAttendanceChart(attendanceChartWeekIndex);
      // render performance chart independently using its own index so navigation
      // on the attendance chart doesn't affect the performance chart.
      try{ renderEmployeePerformanceChart(perfChartWeekIndex); }catch(e){}
    }catch(e){}
  }
  function saveAttendanceToStorage(){
    localStorage.setItem('payroll_attendance', JSON.stringify(attendance));
  }

  function formatTo12Hour(timeStr){
    if(!timeStr) return '—';
    // if already contains am/pm, return as-is
    if(/\b(am|pm)\b/i.test(timeStr)) return timeStr;
    // handle HH:MM:SS or HH:MM
    const parts = timeStr.split(':');
    if(parts.length >= 2){
      let hh = Number(parts[0]);
      const mm = String(parts[1]).padStart(2,'0');
      const ampm = hh >= 12 ? 'pm' : 'am';
      hh = hh % 12; if(hh === 0) hh = 12;
      return `${hh}:${mm} ${ampm}`;
    }
    return timeStr;
  }

  // If passed an ISO timestamp (or Date), return formatted 'Mon DD, YYYY at h:mm am/pm'
  function formatIsoToReadable(iso){
    if(!iso) return null;
    try{
      const d = (typeof iso === 'string') ? new Date(iso) : iso;
      if(isNaN(d.getTime())) return null;
      const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      const mon = months[d.getMonth()];
      const day = d.getDate();
      const year = d.getFullYear();
      let h = d.getHours();
      const m = String(d.getMinutes()).padStart(2,'0');
      const ampm = h >= 12 ? 'pm' : 'am';
      h = h % 12; if(h === 0) h = 12;
      return `${mon} ${String(day).padStart(2,'0')}, ${year} at ${h}:${m} ${ampm}`;
    }catch(e){ return null; }
  }

  // If passed an ISO timestamp (or Date), return time only like '6:53 am'
  function formatIsoToTime(iso){
    if(!iso) return null;
    try{
      const d = (typeof iso === 'string') ? new Date(iso) : iso;
      if(isNaN(d.getTime())) return null;
      let h = d.getHours();
      const m = String(d.getMinutes()).padStart(2,'0');
      const ampm = h >= 12 ? 'pm' : 'am';
      h = h % 12; if(h === 0) h = 12;
      return `${h}:${m} ${ampm}`;
    }catch(e){ return null; }
  }

  function calculateLateDeduction(weeklySalary, lateHours, lateMinutes) {
    // As requested: derive per-minute rate from weekly -> daily(weekly/6) -> hourly(daily/8) -> per-minute(hourly/60)
    const totalLateMinutes = (lateHours * 60) + lateMinutes;
    if (weeklySalary <= 0 || totalLateMinutes <= 0) return 0;

    const dailySalary = weeklySalary / 6; // user example uses 6-day basis
    const hourlyRate = dailySalary / 8;
    const perMinute = hourlyRate / 60;

    // Deduction = minutes late * per-minute rate
    const deduction = totalLateMinutes * perMinute;

    // Round to 2 decimal places (cents)
    return Math.round(deduction * 100) / 100;
  }

  // Count pending payslips across all employees stored in localStorage
  function computePendingPayslipCount(){
    try{
      let count = 0;
      for(const key of Object.keys(localStorage || {})){
        if(!key || typeof key !== 'string') continue;
        if(key.indexOf('employee_payslips_') !== 0) continue;
        try{
          const list = JSON.parse(localStorage.getItem(key) || '[]');
          if(Array.isArray(list)){
            list.forEach(p => { if(p && p.status === 'Pending') count++; });
          }
        }catch(e){/* ignore parse errors */}
      }
      return count;
    }catch(e){ return 0; }
  }

  function updatePendingPayslipCount(){
    try{
      const el = document.getElementById('pendingPayslipsCount');
      if(!el) return;
      const c = computePendingPayslipCount() || 0;
      el.textContent = String(c);
      // Add a small visual highlight when there are pending items
      if(c > 0){ el.style.color = '#b91c1c'; el.style.fontWeight = '800'; }
      else { el.style.color = '#1f2937'; el.style.fontWeight = '700'; }
    }catch(e){}
  }

  // Count pending leave requests across all employees stored in localStorage
  function computePendingLeaveCount(){
    try{
      let count = 0;
      for(const key of Object.keys(localStorage || {})){
        if(!key || typeof key !== 'string') continue;
        // per-employee leave storage key: employee_requests_{id}
        if(key.indexOf('employee_requests_') !== 0) continue;
        try{
          const list = JSON.parse(localStorage.getItem(key) || '[]');
          if(Array.isArray(list)){
            list.forEach(r => { if(r && r.status === 'Pending') count++; });
          }
        }catch(e){/* ignore parse errors */}
      }
      return count;
    }catch(e){ return 0; }
  }

  function updatePendingLeaveCount(){
    try{
      const el = document.getElementById('pendingLeavesCount');
      if(!el) return;
      const c = computePendingLeaveCount() || 0;
      el.textContent = String(c);
      if(c > 0){ el.style.color = '#b91c1c'; el.style.fontWeight = '800'; }
      else { el.style.color = '#1f2937'; el.style.fontWeight = '700'; }
    }catch(e){}
  }

  // Late-deduction UI removed — calculations still exist for payroll flows via calculateLateDeduction().

  const els = {
    tbody: document.querySelector('#employeesTable tbody'),
    archiveBody: document.querySelector('#archiveTable tbody'),
    attendanceBody: document.querySelector('#attendanceTable tbody'),
    timeClockContainer: document.getElementById('timeclockContainer'),
    totalEmployees: document.getElementById('totalEmployees'),
    lastGross: document.getElementById('lastGross'),
    lastNet: document.getElementById('lastNet'),
    search: document.getElementById('search'),
    attendanceSearch: document.getElementById('attendanceSearch'),
    modal: document.getElementById('modal'),
    addBtn: document.getElementById('addBtn'),
    runPayrollBtn: document.getElementById('runPayrollBtn'),
    downloadBtn: document.getElementById('downloadBtn'),
    employeeForm: document.getElementById('employeeForm'),
    empName: document.getElementById('empName'),
    empRole: document.getElementById('empRole'),
    empSalary: document.getElementById('empSalary'),
    empId: document.getElementById('empId'),
    cancelModal: document.getElementById('cancelModal'),
    navLinks: document.querySelectorAll('.nav-link'),
    sectionContents: document.querySelectorAll('.section-content'),
    salarySlipsContainer: document.getElementById('salarySlipsContainer'),
    leaveRequestsContainer: document.getElementById('leaveRequestsContainer'),
    homeEmployeeCount: document.getElementById('homeEmployeeCount'),
    homeLateCount: document.getElementById('homeLateCount'),
    homeLateMinutes: document.getElementById('homeLateMinutes'),
    homeAbsentCount: document.getElementById('homeAbsentCount'),
    homeAbsentSummary: document.getElementById('homeAbsentSummary'),
    homeLateAllCount: document.getElementById('homeLateAllCount'),
    homeLateAllMinutes: document.getElementById('homeLateAllMinutes'),
    homeAddEmpBtn: document.getElementById('homeAddEmpBtn'),
    homeRunPayrollBtn: document.getElementById('homeRunPayrollBtn'),
    homeDownloadBtn: document.getElementById('homeDownloadBtn'),
    homeViewSalaryBtn: document.getElementById('homeViewSalaryBtn')
    , payrollRunBtn: document.getElementById('payrollRunBtn')
    , payrollContainer: document.getElementById('payrollContainer')
  };

  // attendance search state: keep a separate query per week so searches are scoped
  // to whichever week page the admin is viewing.
  let attendanceSearchQuery = ''; // fallback when weeks are not built
  const attendanceSearchByWeek = Object.create(null);

  // wire attendance search input
  if(els.attendanceSearch){
    els.attendanceSearch.addEventListener('input', function(){
      const prevPage = attendanceCurrentPage;
      const raw = (els.attendanceSearch.value || '').trim();
      const q = raw.toLowerCase();
      if(attendanceWeeks && attendanceWeeks.length){
        // store query per-weekKey (use weekStart as stable key)
        const wkIndex = Math.min(Math.max(0, attendanceCurrentPage - 1), attendanceWeeks.length - 1);
        const wk = attendanceWeeks[wkIndex];
        const key = wk && wk.weekStart ? wk.weekStart : ('week_' + wkIndex);
        if(q) attendanceSearchByWeek[key] = q; else delete attendanceSearchByWeek[key];
        // keep page unchanged
        attendanceCurrentPage = Math.min(Math.max(1, prevPage), attendanceWeeks.length);
      } else {
        // no weeks: global fallback
        attendanceSearchQuery = q;
        attendanceCurrentPage = 1;
      }
      renderAttendance();
    });
  }

  function render(list){
    els.tbody.innerHTML = '';
    list.forEach(emp => {
      const tr = document.createElement('tr');
      const weeklySalary = Number((emp.salary / 52).toFixed(2));
      // Calculate last net: weekly salary - late deduction (rounded 2 decimals)
      const lateDed = Number((emp.lateDeduction || 0));
      const salaryAfterLate = Math.max(0, Number((weeklySalary - lateDed).toFixed(2)));
      tr.innerHTML = `
        <td>${emp.id}</td>
        <td>${emp.name}</td>
        <td>${emp.role}</td>
        <td>₱${weeklySalary.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}</td>
        <td class="actions">
          <button class="secondary" data-id="${emp.id}">Edit</button>
          <button data-id="${emp.id}" class="warn">Remove</button>
        </td>
      `;
      els.tbody.appendChild(tr);
    });
    if(els.totalEmployees) els.totalEmployees.textContent = list.length;
  }

  function findIndexById(id){return employees.findIndex(e=>e.id===id)}

  els.tbody.addEventListener('click', (e)=>{
    const btn = e.target.closest('button');
    if(!btn) return;
    const id = btn.dataset.id;
    // Remove
    if(btn.classList.contains('warn')){
      if(confirm('Remove employee '+id+'? This will move the employee to Archive.')){
        const idx = findIndexById(id);
        if(idx>-1) {
          const removed = employees.splice(idx,1)[0];
          archive.push(removed);
          saveEmployeesToStorage();
          saveArchiveToStorage();
          renderFiltered();
          renderArchive();
          updateHomeStats();
        }
      }
      return;
    }
    // Time In
    if(btn.classList.contains('time-in')){
      adminMarkTimeIn(id, btn.dataset.name, btn.dataset.role);
      return;
    }
    // Time Out
    if(btn.classList.contains('time-out')){
      adminMarkTimeOut(id, btn.dataset.name, btn.dataset.role);
      return;
    }
    // Edit
    const idx = findIndexById(id);
    if(idx>-1){
      const emp = employees[idx];
      openModal();
      document.getElementById('modalTitle').textContent = 'Edit Employee';
      els.empName.value = emp.name;
      els.empRole.value = emp.role;
      const weeklySalary = Math.round((emp.salary/52)*100)/100;
      els.empSalary.value = weeklySalary;
      originalSalary = weeklySalary; // track original salary value
      els.empId.value = emp.id;
      // Remember which employee we're editing so the save handler updates the right record
      originalEmployeeId = emp.id;
      document.getElementById('empSSS').value = emp.deductions ? emp.deductions.sss : 300;
      document.getElementById('empPhilhealth').value = emp.deductions ? emp.deductions.philhealth : 250;
      document.getElementById('empPagibig').value = emp.deductions ? emp.deductions.pagibig : 200;
    }
  });

  // Admin helper: format date/time and record attendance for any employee
  function adminFormatDate(d){
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2,'0');
    const dd = String(d.getDate()).padStart(2,'0');
    return `${y}-${m}-${dd}`;
  }
  function adminFormatTime(d){
    let h = d.getHours();
    const m = String(d.getMinutes()).padStart(2,'0');
    const ampm = h >= 12 ? 'pm' : 'am';
    h = h % 12; if(h === 0) h = 12;
    return `${h}:${m} ${ampm}`;
  }

  function adminMarkTimeIn(empId, empName, empRole){
    try{
      const now = new Date();
      const date = adminFormatDate(now);
      let rec = attendance.find(r=> String(r.id) === String(empId) && r.date === date);
      // Prevent duplicate Time In for the same day
      if(rec && (rec.timeInISO || rec.timeIn)){
        alert('Time In already recorded for '+(empName||empId)+' today at '+rec.timeIn);
        renderTimeClock();
        return;
      }
      if(!rec){
        rec = { id: empId, name: empName || empId, role: empRole || '', date: date, timeIn: adminFormatTime(now), timeInISO: now.toISOString(), timeOut: '', timeOutISO: '', status: 'Online', attendanceId: String(empId) + '_' + date + '_' + Date.now() };
        attendance.push(rec);
      } else {
        rec.timeIn = adminFormatTime(now);
        rec.timeInISO = now.toISOString();
        rec.date = adminFormatDate(new Date(rec.timeInISO));
        rec.status = 'Online';
        if(!rec.attendanceId) rec.attendanceId = String(empId) + '_' + date + '_' + Date.now();
      }
      saveAttendanceToStorage();
      loadAttendanceFromStorage();
      renderTimeClock();
      renderAttendance();
      // Try to sync to Firestore (best-effort)
      syncRecordToFirestore(rec).then(()=>{
        console.log('Time In synced to Firestore for', rec.attendanceId || rec.id);
      }).catch(()=>{/* ignore sync errors */});

      alert('Time In recorded for '+(empName||empId)+': '+rec.timeIn);
    }catch(e){ console.error(e); alert('Failed to record Time In'); }
  }

  function adminMarkTimeOut(empId, empName, empRole){
    try{
      const now = new Date();
      const date = adminFormatDate(now);
      let rec = attendance.find(r=> String(r.id) === String(empId) && r.date === date);
      // Prevent duplicate Time Out for the same day
      if(rec && (rec.timeOutISO || rec.timeOut)){
        alert('Time Out already recorded for '+(empName||empId)+' today at '+rec.timeOut);
        renderTimeClock();
        return;
      }
      if(!rec){
        rec = { id: empId, name: empName || empId, role: empRole || '', date: date, timeIn: '', timeInISO: '', timeOut: adminFormatTime(now), timeOutISO: now.toISOString(), status: 'Offline', attendanceId: String(empId) + '_' + date + '_' + Date.now() };
        attendance.push(rec);
      } else {
        rec.timeOut = adminFormatTime(now);
        rec.timeOutISO = now.toISOString();
        rec.date = adminFormatDate(new Date(rec.timeOutISO));
        rec.status = 'Offline';
        // compute net minutes and payable hours for this record and store locally
        try{
          if(rec.timeInISO){
            const inDt = new Date(rec.timeInISO);
            const outDt = new Date(rec.timeOutISO);
            const netMin = computeNetMinutesBetween(inDt, outDt);
            rec.actualWorkedMinutes = netMin;
            rec.actualWorkedHours = Math.round((netMin / 60) * 100) / 100;
            rec.payableMinutes = Math.min(netMin, 8 * 60);
            rec.payableHours = Math.round((Math.min(netMin, 8 * 60) / 60) * 100) / 100;
          }
        }catch(e){/* best-effort, ignore */}
        if(!rec.attendanceId) rec.attendanceId = String(empId) + '_' + date + '_' + Date.now();
      }
      saveAttendanceToStorage();
      loadAttendanceFromStorage();
      renderTimeClock();
      renderAttendance();
      // Try to sync to Firestore (best-effort)
      syncRecordToFirestore(rec).then(()=>{
        console.log('Time Out synced to Firestore for', rec.attendanceId || rec.id);
      }).catch(()=>{/* ignore sync errors */});

      alert('Time Out recorded for '+(empName||empId)+': '+rec.timeOut);
    }catch(e){ console.error(e); alert('Failed to record Time Out'); }
  }

  // archive table actions: restore and permanently delete
  if(els.archiveBody){
    els.archiveBody.addEventListener('click', (e)=>{
      const btn = e.target.closest('button'); if(!btn) return;
      const id = btn.dataset.id;
      const idx = archive.findIndex(a=>a.id===id);
      if(idx === -1) return;
      if(btn.classList.contains('restore')){
        const item = archive.splice(idx,1)[0];
        employees.push(item);
        saveArchiveToStorage(); saveEmployeesToStorage();
        renderFiltered(); renderArchive(); updateHomeStats();
        alert('Employee restored from archive.');
      } else if(btn.classList.contains('permadelete')){
        if(confirm('Permanently delete employee '+id+'? This cannot be undone.')){
          archive.splice(idx,1);
          saveArchiveToStorage(); renderArchive();
        }
      }
    });
  }

  function openModal(){ els.modal.style.display='flex'; els.modal.setAttribute('aria-hidden','false'); }
  function closeModal(){ els.modal.style.display='none'; els.modal.setAttribute('aria-hidden','true'); els.employeeForm.reset(); originalEmployeeId = null; }

  if(els.addBtn){
    els.addBtn.addEventListener('click', ()=>{ originalEmployeeId = null; openModal(); document.getElementById('modalTitle').textContent='Add Employee'; });
  }
  els.cancelModal.addEventListener('click', ()=> closeModal());

  // Track original salary to prevent circular updates
  els.empSalary.addEventListener('blur', ()=> {
    originalSalary = Number(els.empSalary.value) || 0;
  });

  els.employeeForm.addEventListener('submit', (ev)=>{
    ev.preventDefault();
    const id = els.empId.value.trim();
    const existing = findIndexById(id);
    const weeklySalary = Number(els.empSalary.value) || originalSalary || 0;
    const annualSalary = Math.round(weeklySalary * 52);
    // No late-deduction inputs on this modal: save weekly salary as lastNet
    const weeklySalaryStored = Number((weeklySalary).toFixed(2));
    const salaryAfterLate = weeklySalaryStored;

    const payload = { 
      id, 
      name:els.empName.value.trim(), 
      role:els.empRole.value.trim(), 
      salary: annualSalary, 
  lastNet: salaryAfterLate,
      deductions:{ 
        sss: Number(document.getElementById('empSSS').value||0), 
        philhealth: Number(document.getElementById('empPhilhealth').value||0), 
        pagibig: Number(document.getElementById('empPagibig').value||0) 
      } 
    };
    if(originalEmployeeId){
      // We are editing an existing employee (originalEmployeeId set when opening the modal)
      const origIdx = findIndexById(originalEmployeeId);
      if(origIdx === -1){
        // couldn't find original employee (rare) — fallback to id-based behaviour
        if(existing>-1) { employees[existing] = payload; }
        else { employees.push(payload); }
      } else {
        // if employee id was changed, ensure it doesn't collide with another employee
        if(String(originalEmployeeId) !== String(id)){
          const collisionIdx = findIndexById(id);
          if(collisionIdx !== -1 && collisionIdx !== origIdx){
            alert('Employee ID "' + id + '" is already used by another employee. Choose a different ID.');
            return;
          }
          // migrate credentials keyed by employee id, if present
          try{
            const credMap = JSON.parse(localStorage.getItem('payroll_credentials') || '{}');
            if(credMap && credMap[originalEmployeeId]){
              credMap[id] = credMap[originalEmployeeId];
              // update the employeeId inside the saved credential object too if present
              try{ credMap[id].employeeId = id; }catch(e){}
              delete credMap[originalEmployeeId];
              localStorage.setItem('payroll_credentials', JSON.stringify(credMap));
            }
          }catch(e){ /* ignore */ }

          // migrate employee payslips stored under a separate key
          try{
            const oldKey = 'employee_payslips_' + originalEmployeeId;
            const newKey = 'employee_payslips_' + id;
            const data = localStorage.getItem(oldKey);
            if(data !== null){
              // if target key already exists we should merge lists
              const existingList = JSON.parse(localStorage.getItem(newKey) || '[]');
              const migrating = JSON.parse(data || '[]');
              const merged = Array.isArray(existingList) ? existingList.concat(migrating) : migrating;
              localStorage.setItem(newKey, JSON.stringify(merged));
              localStorage.removeItem(oldKey);
            }
          }catch(e){ /* ignore */ }

          // update any attendance records stored in-memory
          try{
            let changed = false;
            if(Array.isArray(attendance)){
              attendance.forEach(r => {
                if(String(r.id) === String(originalEmployeeId)){
                  r.id = id;
                  // attendanceId might be prefixed with the employee id; update if so
                  if(r.attendanceId && String(r.attendanceId).indexOf(String(originalEmployeeId) + '_') === 0){
                    r.attendanceId = String(id) + r.attendanceId.substring(String(originalEmployeeId).length);
                  }
                  changed = true;
                }
              });
              if(changed) saveAttendanceToStorage();
            }
          }catch(e){ /* ignore */ }
        }

        // finally update the employee record in-place so we don't create a duplicate
        employees[origIdx] = payload;
      }
    } else {
      // Not editing — create new or overwrite existing by id
      if(existing>-1){ employees[existing] = payload; }
      else { employees.push(payload); }
    }
    saveEmployeesToStorage();
    originalSalary = 0; // Reset after save
    closeModal(); renderFiltered(); updateHomeStats();
  });

  function renderFiltered(){
    const q = els.search.value.trim().toLowerCase();
    if(!q) render(employees);
    else render(employees.filter(e=> (e.name+e.role+e.id).toLowerCase().includes(q)));
    updateHomeStats();
    // update Time Clock section whenever the employee list/filter changes
    try{ renderTimeClock(); }catch(e){}
  }
  els.search.addEventListener('input', renderFiltered);

  // Open payroll preview modal (simple dropdowns for employee & week)
  function openPayrollModal(){
    if(employees.length===0){ alert('No employees to run payroll for.'); return; }
    buildAttendanceWeeks();
    const modal = document.getElementById('payrollModal');
    const weekSelect = document.getElementById('payrollWeekSelect');
    const empSelect = document.getElementById('payrollEmployeeSelect');
    // populate week options
    weekSelect.innerHTML = '';
    if(attendanceWeeks && attendanceWeeks.length){
      attendanceWeeks.forEach((w, i)=>{
        try{
          const s = new Date(w.weekStart + 'T00:00:00');
          const e = new Date(s.getTime() + 6*24*3600*1000);
          const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
          const sMon = months[s.getMonth()]; const eMon = months[e.getMonth()];
          const sDay = s.getDate(); const eDay = e.getDate();
          const label = (sMon===eMon) ? `${sMon} ${sDay} - ${eDay}` : `${sMon} ${sDay} - ${eMon} ${String(eDay).padStart(2,'0')}`;
          const opt = document.createElement('option'); opt.value = String(i); opt.textContent = label; weekSelect.appendChild(opt);
        }catch(err){ const opt=document.createElement('option'); opt.value=String(i); opt.textContent=w.weekStart; weekSelect.appendChild(opt); }
      });
    } else {
      const opt = document.createElement('option'); opt.value='0'; opt.textContent='(No attendance weeks)'; weekSelect.appendChild(opt);
    }
    // populate employee select
    empSelect.innerHTML = '';
    employees.forEach(emp=>{
      const opt = document.createElement('option'); opt.value = emp.id; opt.textContent = `${emp.name} (${emp.id})`; empSelect.appendChild(opt);
    });
    if(weekSelect.options.length) weekSelect.selectedIndex = 0;
    if(empSelect.options.length) empSelect.selectedIndex = 0;
    // wire onchange to update preview
    const updatePayrollPreview = ()=>{
      const empId = empSelect.value;
      const weekIndex = Number(weekSelect.value) || 0;
      const res = calculateHoursForEmployeeInWeek(weekIndex, empId);
      const totalHours = res.hours;
      const days = res.days;
      // calculateHoursForEmployeeInWeek already returns per-day capped payable hours; use that directly
      const paidHours = totalHours;
      const gross = Math.round(((paidHours / 8) * 510) * 100)/100;
      const emp = employees.find(p=> String(p.id) === String(empId));
      const statutory = emp && emp.deductions ? (Number(emp.deductions.sss||0)+Number(emp.deductions.philhealth||0)+Number(emp.deductions.pagibig||0)) : 0;
        // compute late automatically from attendance (based on 8h/day, 6 days/week)
        // computeLateFromAttendance will use the employee's weekly salary when available
        const lateInfo = computeLateFromAttendance(weekIndex, empId);
        // populate payroll modal late inputs with computed values (manager can still override)
        const lateHoursInput = document.getElementById('payrollLateHours');
        const lateMinutesInput = document.getElementById('payrollLateMinutes');
        const lateDedEl = document.getElementById('payrollLateDeduction');
        if(lateHoursInput) lateHoursInput.value = lateInfo.lateHours || 0;
        if(lateMinutesInput) lateMinutesInput.value = lateInfo.lateMinutes || 0;
        if(lateDedEl) lateDedEl.textContent = '₱' + (lateInfo.deduction || 0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});
        const lateDeduction = lateInfo.deduction || 0;

      const net = Math.max(0, Math.round((gross - statutory - lateDeduction) * 100)/100);
      // update DOM
      document.getElementById('payrollDays').textContent = days;
      document.getElementById('payrollHours').textContent = totalHours;
      document.getElementById('payrollGross').textContent = `₱${gross.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}`;
      document.getElementById('payrollStat').textContent = `₱${statutory.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}`;
      document.getElementById('payrollNet').textContent = `₱${net.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}`;
      // store computed values on confirm button for quick confirm
      const confirmBtn = document.getElementById('payrollConfirm');
      if(confirmBtn){ confirmBtn.dataset.empId = empId; confirmBtn.dataset.gross = String(gross); confirmBtn.dataset.net = String(net); }

      // compute stable week identifier(s) to check against existing payslips
      let currentWeekStart = null;
      let currentWeekLabel = null;
      try{
        if(attendanceWeeks && attendanceWeeks.length && attendanceWeeks[weekIndex]){
          currentWeekStart = attendanceWeeks[weekIndex].weekStart || null;
          // build the same label used elsewhere for fallback checks
          try{
            const s = new Date(currentWeekStart + 'T00:00:00');
            const e = new Date(s.getTime() + 6*24*3600*1000);
            const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
            const sMon = months[s.getMonth()]; const eMon = months[e.getMonth()];
            const sDay = s.getDate(); const eDay = e.getDate();
            currentWeekLabel = (sMon===eMon) ? `${sMon} ${sDay} - ${eDay}` : `${sMon} ${sDay} - ${eMon} ${String(eDay).padStart(2,'0')}`;
          }catch(err){ currentWeekLabel = null; }
        }
      }catch(e){ /* ignore */ }

      // Check if this employee already has a payslip for this week that's approved
      try{
        const key = 'employee_payslips_' + empId;
        const existingList = JSON.parse(localStorage.getItem(key) || '[]');
        if(Array.isArray(existingList) && existingList.length){
          const focus = existingList.find(p=> (p.weekStart === currentWeekStart || p.weekKey === currentWeekStart || p.weekLabel === currentWeekLabel) && p.status === 'Approved');
          if(focus) document.getElementById('payrollNotice').textContent = 'This week already has an approved payslip for this employee.';
          else document.getElementById('payrollNotice').textContent = '';
        }
      }catch(err){}
    };

    if(weekSelect) weekSelect.onchange = updatePayrollPreview;
    if(empSelect) empSelect.onchange = updatePayrollPreview;
    updatePayrollPreview();
    if(modal){ modal.style.display='flex'; modal.setAttribute('aria-hidden','false'); }
  }
  if(els.runPayrollBtn) els.runPayrollBtn.addEventListener('click', openPayrollModal);

  // helper: compute net minutes between two datetimes excluding unpaid lunch 12:00-13:00
  function computeNetMinutesBetween(inDt, outDt){
    if(!inDt || !outDt || isNaN(inDt.getTime()) || isNaN(outDt.getTime())) return 0;
    // normalize: if out < in assume next day
    if(outDt.getTime() < inDt.getTime()) outDt = new Date(outDt.getTime() + 24*3600*1000);
    // total minutes
    let totalMin = Math.max(0, Math.round((outDt.getTime() - inDt.getTime()) / (1000*60)));
    // lunch window (local times): 12:00:00 - 13:00:00 on the same days
    // compute overlap between [inDt, outDt) and [12:00 of inDt's day, 13:00 of that day]
    // Also handle case where shift spans multiple days by testing lunch window for each day covered
    const startDay = new Date(inDt.getFullYear(), inDt.getMonth(), inDt.getDate());
    const endDay = new Date(outDt.getFullYear(), outDt.getMonth(), outDt.getDate());
    // iterate each calendar day overlapped by the shift
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

  // helper: calculate total hours and day count for employee in a given week index
  function calculateHoursForEmployeeInWeek(weekIndex, empId){
    if(!attendanceWeeks || attendanceWeeks.length===0) return {hours:0, days:0};
    const wk = attendanceWeeks[Math.min(Math.max(0, weekIndex), attendanceWeeks.length-1)];
    if(!wk) return {hours:0, days:0};
    // We'll compute two values per day:
    //  - totalActualMinutes: minutes actually worked excluding any 12:00-13:00 time (this is the "net" worked minutes)
    //  - totalPayableMinutes: per-day capped minutes (max 8h = 480 min) derived from the net minutes
    let totalActualMinutes = 0;
    let totalPayableMinutes = 0;
    const datesSeen = new Set();
    wk.items.forEach(rec=>{
      if(String(rec.id) !== String(empId)) return;
      // determine in/out datetimes similar to renderAttendance
      let inDt=null,outDt=null;
      try{
        if(rec.timeInISO) inDt = new Date(rec.timeInISO);
        if(rec.timeOutISO) outDt = new Date(rec.timeOutISO);
        if(!inDt && rec.timeIn){ const ref = rec.date ? new Date(rec.date+'T00:00:00') : new Date(); const m = rec.timeIn.match(/(\d{1,2}):(\d{2})(?:\s*(am|pm))?/i); if(m){ let hh=Number(m[1]); const mm=Number(m[2]); const ampm=m[3]?m[3].toLowerCase():null; if(ampm){ if(ampm==='pm'&&hh!==12) hh+=12; if(ampm==='am'&&hh===12) hh=0; } inDt=new Date(ref.getTime()); inDt.setHours(hh,mm,0,0); } }
        if(!outDt && rec.timeOut){ const ref = rec.date ? new Date(rec.date+'T00:00:00') : new Date(); const m = rec.timeOut.match(/(\d{1,2}):(\d{2})(?:\s*(am|pm))?/i); if(m){ let hh=Number(m[1]); const mm=Number(m[2]); const ampm=m[3]?m[3].toLowerCase():null; if(ampm){ if(ampm==='pm'&&hh!==12) hh+=12; if(ampm==='am'&&hh===12) hh=0; } outDt=new Date(ref.getTime()); outDt.setHours(hh,mm,0,0); } }
        if(inDt && outDt && !isNaN(inDt.getTime()) && !isNaN(outDt.getTime())){
          // compute net minutes excluding lunch window between 12:00-13:00
          const netMinutes = computeNetMinutesBetween(inDt, outDt);
          // convert to ms for backward compatibility of earlier patterns when needed
          totalActualMinutes += netMinutes;
          // payable per-day is capped to 8 hours (480 minutes)
          totalPayableMinutes += Math.min(netMinutes, 8 * 60);
          if(rec.date) datesSeen.add(rec.date); else if(inDt) datesSeen.add(new Date(inDt.getFullYear(),inDt.getMonth(),inDt.getDate()).toISOString());
        }
      }catch(e){}
    });
    const payableHours = Math.round((totalPayableMinutes / 60) * 100)/100;
    const actualHours = Math.round((totalActualMinutes / 60) * 100)/100;
    return { hours: payableHours, rawHours: actualHours, days: datesSeen.size };
  }

  // compute total worked minutes and days for employee in a given week index
  function computeWorkedMinutesForEmployeeInWeek(weekIndex, empId){
    if(!attendanceWeeks || attendanceWeeks.length===0) return { minutes:0, days:0 };
    const wk = attendanceWeeks[Math.min(Math.max(0, weekIndex), attendanceWeeks.length-1)];
    if(!wk) return { minutes:0, days:0 };
    let totalMinutes = 0; const datesSeen = new Set();
    wk.items.forEach(rec=>{
      if(String(rec.id) !== String(empId)) return;
      try{
        let inDt=null,outDt=null;
        if(rec.timeInISO) inDt = new Date(rec.timeInISO);
        if(rec.timeOutISO) outDt = new Date(rec.timeOutISO);
        if(!inDt && rec.timeIn){ const ref = rec.date ? new Date(rec.date+'T00:00:00') : new Date(); const m = rec.timeIn.match(/(\d{1,2}):(\d{2})(?:\s*(am|pm))?/i); if(m){ let hh=Number(m[1]); const mm=Number(m[2]); const ampm=m[3]?m[3].toLowerCase():null; if(ampm){ if(ampm==='pm'&&hh!==12) hh+=12; if(ampm==='am'&&hh===12) hh=0; } inDt=new Date(ref.getTime()); inDt.setHours(hh,mm,0,0); } }
        if(!outDt && rec.timeOut){ const ref = rec.date ? new Date(rec.date+'T00:00:00') : new Date(); const m = rec.timeOut.match(/(\d{1,2}):(\d{2})(?:\s*(am|pm))?/i); if(m){ let hh=Number(m[1]); const mm=Number(m[2]); const ampm=m[3]?m[3].toLowerCase():null; if(ampm){ if(ampm==='pm'&&hh!==12) hh+=12; if(ampm==='am'&&hh===12) hh=0; } outDt=new Date(ref.getTime()); outDt.setHours(hh,mm,0,0); } }
        if(inDt && outDt && !isNaN(inDt.getTime()) && !isNaN(outDt.getTime())){
          // compute net worked minutes excluding 12:00-13:00 unpaid window
          const net = computeNetMinutesBetween(inDt, outDt);
          totalMinutes += net;
          if(rec.date) datesSeen.add(rec.date); else if(inDt) datesSeen.add(new Date(inDt.getFullYear(),inDt.getMonth(),inDt.getDate()).toISOString());
        }
      }catch(e){}
    });
    const minutes = Math.round(totalMinutes);
    return { minutes, days: datesSeen.size };
  }

  // compute total lateness across all records for a given week
  // returns {count: number of late occurrences, uniqueEmployees: number of distinct employees who were late, totalMinutes: total late minutes}
  function computeTotalLatesForWeek(weekIndex){
    if(!attendanceWeeks || attendanceWeeks.length===0) return { count: 0, uniqueEmployees: 0, totalMinutes: 0 };
    const wk = attendanceWeeks[Math.min(Math.max(0, weekIndex || 0), attendanceWeeks.length - 1)];
    if(!wk || !Array.isArray(wk.items)) return { count: 0, uniqueEmployees: 0, totalMinutes: 0 };
    const scheduled = 8 * 60; // 08:00
    const grace = 10; // 10-minute grace
    let count = 0; let totalMinutes = 0; const seenEmp = new Set();
    wk.items.forEach(rec => {
      try{
        let inDt = null;
        if(rec.timeInISO) inDt = new Date(rec.timeInISO);
        else if(rec.timeIn && rec.date){ const ref = new Date(rec.date + 'T00:00:00'); const m = rec.timeIn.match(/(\d{1,2}):(\d{2})(?:\s*(am|pm))?/i); if(m){ let hh=Number(m[1]); const mm=Number(m[2]); const ampm=m[3] ? m[3].toLowerCase() : null; if(ampm){ if(ampm==='pm' && hh!==12) hh+=12; if(ampm==='am' && hh===12) hh=0; } inDt = new Date(ref.getTime()); inDt.setHours(hh, mm, 0, 0); } }
        if(inDt && !isNaN(inDt.getTime())){
          const minutes = inDt.getHours()*60 + inDt.getMinutes();
          if(minutes > (scheduled + grace)){
            const lateMin = Math.max(0, minutes - scheduled);
            count++;
            totalMinutes += lateMin;
            if(rec.id) seenEmp.add(String(rec.id));
          }
        }
      }catch(e){}
    });
    return { count, uniqueEmployees: seenEmp.size, totalMinutes };
  }

  // compute all-time late statistics across ALL attendance records
  // returns { count: instances, uniqueEmployees: number, totalMinutes: number }
  function computeAllTimeLates(){
    try{
      loadAttendanceFromStorage(); // ensure attendance[] is populated
      const scheduled = 8 * 60; const grace = 10;
      let count = 0; let totalMinutes = 0; const seen = new Set();
      attendance.forEach(rec => {
        try{
          if(!rec) return;
          let inDt = null;
          if(rec.timeInISO) inDt = new Date(rec.timeInISO);
          else if(rec.timeIn && rec.date){ const ref = new Date((rec.date||'') + 'T00:00:00'); const m = rec.timeIn.match(/(\d{1,2}):(\d{2})(?:\s*(am|pm))?/i); if(m){ let hh=Number(m[1]); const mm=Number(m[2]); const ampm=m[3]?m[3].toLowerCase():null; if(ampm){ if(ampm==='pm'&&hh!==12) hh+=12; if(ampm==='am'&&hh===12) hh=0; } inDt = new Date(ref.getTime()); inDt.setHours(hh, mm, 0, 0); } }
          if(inDt && !isNaN(inDt.getTime())){
            const minutes = inDt.getHours()*60 + inDt.getMinutes();
            if(minutes > (scheduled + grace)){
              count++;
              const lateMin = Math.max(0, minutes - scheduled);
              totalMinutes += lateMin;
              if(rec.id) seen.add(String(rec.id));
            }
          }
        }catch(e){}
      });
      return { count, uniqueEmployees: seen.size, totalMinutes };
    }catch(e){ return { count:0, uniqueEmployees:0, totalMinutes:0 }; }
  }

  // compute all-time absences across attendance history
  // For every week (grouped by weekStart), assume expectedDays = 6 (Mon-Sat) per employee
  // For each employee (present in employees list or attendance records) compute absentDays = max(0, expectedDays - presentDaysInWeek)
  // returns { count: totalAbsentDays, employees: number of employees considered }
  function computeAllTimeAbsents(){
    try{
      loadAttendanceFromStorage(); // ensure attendanceWeeks is built
      if(!attendanceWeeks || attendanceWeeks.length === 0) return { count: 0, employees: 0 };
      const expectedDays = 6;
      // collect all employee ids (from employees list and any attendance records)
      const ids = new Set();
      (employees || []).forEach(e => { if(e && typeof e.id !== 'undefined') ids.add(String(e.id)); });
      attendance.forEach(rec => { if(rec && typeof rec.id !== 'undefined') ids.add(String(rec.id)); });

      let totalAbsentDays = 0;

      // iterate weeks
      attendanceWeeks.forEach(wk => {
        try{
          // build per-employee present day sets for this week
          const presentByEmp = Object.create(null);
          (wk.items || []).forEach(rec => {
            try{
              if(!rec || typeof rec.id === 'undefined') return;
              const empId = String(rec.id);
              let dayKey = rec.date || null;
              if(!dayKey){ if(rec.timeInISO){ const d = new Date(rec.timeInISO); if(!isNaN(d.getTime())) dayKey = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
                else if(rec.timeOutISO){ const d = new Date(rec.timeOutISO); if(!isNaN(d.getTime())) dayKey = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
              }
              if(!dayKey) return;
              if(!presentByEmp[empId]) presentByEmp[empId] = new Set();
              presentByEmp[empId].add(dayKey);
            }catch(e){}
          });

          // now compute absents for each employee seen globally
          ids.forEach(empId => {
            try{
              const presentDays = presentByEmp[empId] ? presentByEmp[empId].size : 0;
              const absent = Math.max(0, expectedDays - presentDays);
              totalAbsentDays += absent;
            }catch(e){}
          });
        }catch(e){}
      });

      return { count: totalAbsentDays, employees: ids.size };
    }catch(e){ return { count: 0, employees: 0 }; }
  }

  // compute late minutes and monetary deduction for an employee in a given week
  // Uses per-day late calculation relative to 08:00 + 10-minute grace window
  // -> Only arrivals after 08:10 will trigger a deduction and the deduction equals minutes late since 08:00
  function computeLateFromAttendance(weekIndex, empId){
    if(!attendanceWeeks || attendanceWeeks.length === 0) return { lateHours: 0, lateMinutes: 0, totalLateMinutes: 0, deduction: 0 };
    const wk = attendanceWeeks[Math.min(Math.max(0, weekIndex || 0), attendanceWeeks.length - 1)];
    if(!wk || !Array.isArray(wk.items)) return { lateHours: 0, lateMinutes: 0, totalLateMinutes: 0, deduction: 0 };
    const scheduled = 8 * 60; // 08:00
    const grace = 10; // minutes grace
    let totalLateMinutes = 0;
    // Sum per-day late minutes (only if timeIn exists and arrival is after grace window)
    wk.items.forEach(rec => {
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
    const lateHours = Math.floor(totalLateMinutes / 60);
    const remMinutes = totalLateMinutes % 60;
    // derive deduction using the employee's weekly salary when available
    // employee.salary is stored as annual in this app; convert to weekly
    let weeklySalaryEquivalent = 510 * 6; // fallback: ₱510/day * 6 days
    try{
      const emp = (employees || []).find(e => String(e.id) === String(empId));
      if(emp && typeof emp.salary !== 'undefined' && emp.salary !== null){
        // emp.salary stored as annual; divide by 52 to get weekly
        const weekly = Math.round(Number(emp.salary) / 52) || 0;
        if(weekly > 0) weeklySalaryEquivalent = weekly;
      }
    }catch(e){ /* fallback remains */ }
    const deduction = calculateLateDeduction(weeklySalaryEquivalent, lateHours, remMinutes);
    return { lateHours, lateMinutes: remMinutes, totalLateMinutes: totalLateMinutes, deduction };
  }

  // compute performance for an employee for a given week index
  // returns { status: string, presentDays: number, absentDays: number, lateDays: number }
  function computePerformanceForWeek(weekIndex, empId){
    try{
      if(!attendanceWeeks || attendanceWeeks.length === 0) return { status: 'No data', presentDays: 0, absentDays: 0, lateDays: 0 };
      const wk = attendanceWeeks[Math.min(Math.max(0, weekIndex || 0), attendanceWeeks.length - 1)];
      if(!wk || !Array.isArray(wk.items)) return { status: 'No data', presentDays: 0, absentDays: 0, lateDays: 0 };
      const scheduled = 8*60; const grace = 10; const expectedDays = 6; // assume 6 working days (Mon-Sat)
      const seenDates = new Set();
      const lateDates = new Set();

      wk.items.forEach(rec => {
        try{
          if(String(rec.id) !== String(empId)) return;
          // determine the local date string for this record
          let dayKey = rec.date || null;
          if(!dayKey){ if(rec.timeInISO){ const d = new Date(rec.timeInISO); if(!isNaN(d.getTime())) dayKey = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
            else if(rec.timeOutISO){ const d = new Date(rec.timeOutISO); if(!isNaN(d.getTime())) dayKey = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
          }
          if(!dayKey) return; // ignore malformed
          seenDates.add(dayKey);
          // compute late minutes for this entry (if present)
          let inDt = null;
          if(rec.timeInISO) inDt = new Date(rec.timeInISO);
          else if(rec.timeIn && rec.date){ const ref = new Date(rec.date + 'T00:00:00'); const m = rec.timeIn.match(/(\d{1,2}):(\d{2})(?:\s*(am|pm))?/i); if(m){ let hh=Number(m[1]); const mm=Number(m[2]); const ampm=m[3]?m[3].toLowerCase():null; if(ampm){ if(ampm==='pm'&&hh!==12) hh+=12; if(ampm==='am'&&hh===12) hh=0; } inDt = new Date(ref.getTime()); inDt.setHours(hh, mm, 0, 0); } }
          if(inDt && !isNaN(inDt.getTime())){
            const minutes = inDt.getHours()*60 + inDt.getMinutes();
            if(minutes > (scheduled + grace)){
              lateDates.add(dayKey);
            }
          }
        }catch(e){}
      });

      const presentDays = seenDates.size;
      const lateDays = lateDates.size;
      const absentDays = Math.max(0, expectedDays - presentDays);

      // Decide status
      let status = 'No data';
      if(presentDays >= expectedDays){
        if(lateDays === 0) status = 'Perfect attendance';
        else if(lateDays <= 1) status = 'Minor lates';
        else if(lateDays <= 3) status = 'Few lates';
        else status = 'Frequently late';
      } else {
        // some absences
        if(absentDays >= Math.ceil(expectedDays * 0.5)) status = 'Poor attendance';
        else if(lateDays >= 3) status = 'Frequently late';
        else if(lateDays > 0) status = 'Irregular attendance';
        else status = 'Some absences';
      }

      return { status, presentDays, absentDays, lateDays };
    }catch(e){ return { status: 'No data', presentDays: 0, absentDays: 0, lateDays: 0 }; }
  }

  // Simple confirm/cancel handlers for payroll modal
    const payrollConfirmBtn = document.getElementById('payrollConfirm');
  if(payrollConfirmBtn){
    payrollConfirmBtn.addEventListener('click', ()=>{
      const empId = payrollConfirmBtn.dataset.empId || (document.getElementById('payrollEmployeeSelect') && document.getElementById('payrollEmployeeSelect').value);
      const gross = Number(payrollConfirmBtn.dataset.gross) || 0;
      // read late override values if present
      const lateHoursVal = Number((document.getElementById('payrollLateHours') && document.getElementById('payrollLateHours').value) || 0);
      const lateMinutesVal = Number((document.getElementById('payrollLateMinutes') && document.getElementById('payrollLateMinutes').value) || 0);
      const empForDed = employees.find(p=> String(p.id) === String(empId));
      const weeklyForDeduction = (empForDed && typeof empForDed.salary !== 'undefined' && empForDed.salary !== null) ? (Math.round(Number(empForDed.salary) / 52) || (510*6)) : (510*6);
      const lateDeductionVal = calculateLateDeduction(weeklyForDeduction, lateHoursVal, lateMinutesVal) || 0;
      // final net should subtract statutory + late deduction
      const empForStat = employees.find(p=> String(p.id) === String(empId));
      const statutoryForSave = empForStat && empForStat.deductions ? (Number(empForStat.deductions.sss||0)+Number(empForStat.deductions.philhealth||0)+Number(empForStat.deductions.pagibig||0)) : 0;
      const net = Math.max(0, Math.round((gross - statutoryForSave - lateDeductionVal) * 100)/100);
      if(!empId){ alert('No employee selected'); return; }
      const emp = employees.find(p=> String(p.id) === String(empId));
      if(!emp){ alert('Employee not found'); return; }
      emp.lastNet = Math.round(net);
      // create a payslip record for the employee and save to storage so the employee dashboard can show it
      // compute week index from currently selected modal week select
      const weekSelect = document.getElementById('payrollWeekSelect');
      const weekIndex = weekSelect ? Number(weekSelect.value) : 0;
      const ok = processPayrollRunFor(empId, weekIndex, lateHoursVal, lateMinutesVal, gross);
      if(!ok) return; // aborted due to existing approved
      saveEmployeesToStorage(); renderFiltered(); updateHomeStats();
      // update summary to reflect this run
      document.getElementById('lastGross').textContent = '₱'+Math.round(gross).toLocaleString();
      document.getElementById('lastNet').textContent = '₱'+Math.round(net).toLocaleString();
      const modal = document.getElementById('payrollModal'); if(modal){ modal.style.display='none'; modal.setAttribute('aria-hidden','true'); }
      alert('Payroll run saved for '+(emp.name||emp.id));
    });
  }

    // Core payroll run process: create/update payslip for empId, weekIndex with late override values.
    function processPayrollRunFor(empId, weekIndex, lateHoursVal, lateMinutesVal, grossFrom = null){
      if(!empId){ alert('No employee selected'); return false; }
      const emp = employees.find(p=> String(p.id) === String(empId));
      if(!emp){ alert('Employee not found'); return false; }
      const gross = grossFrom !== null ? Number(grossFrom) : 0;
      const empForDed = emp;
      const weeklyForDeduction = (empForDed && typeof empForDed.salary !== 'undefined' && empForDed.salary !== null) ? (Math.round(Number(empForDed.salary) / 52) || (510*6)) : (510*6);
      const lateDeductionVal = calculateLateDeduction(weeklyForDeduction, Number(lateHoursVal)||0, Number(lateMinutesVal)||0) || 0;
      const statutoryForSave = emp.deductions ? (Number(emp.deductions.sss||0)+Number(emp.deductions.philhealth||0)+Number(emp.deductions.pagibig||0)) : 0;
      const net = Math.max(0, Math.round((Number(gross) - statutoryForSave - lateDeductionVal) * 100)/100);
      try{
        let weekStart = null; let weekLabel = '';
        if(attendanceWeeks && attendanceWeeks.length && attendanceWeeks[weekIndex]){
          weekStart = attendanceWeeks[weekIndex].weekStart;
          const s = new Date(weekStart + 'T00:00:00');
          const e = new Date(s.getTime() + 6*24*3600*1000);
          const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
          const sMon = months[s.getMonth()]; const eMon = months[e.getMonth()];
          const sDay = s.getDate(); const eDay = e.getDate();
          weekLabel = (sMon===eMon) ? `${sMon} ${sDay} - ${eDay}` : `${sMon} ${sDay} - ${eMon} ${String(eDay).padStart(2,'0')}`;
        }
        const key = 'employee_payslips_' + empId;
        const existing = JSON.parse(localStorage.getItem(key) || '[]');
        const weekKey = weekStart || weekLabel || (`week_${weekIndex}`);
        const approvedIdx = existing.findIndex(p => p && (p.weekKey === weekKey || p.weekStart === weekStart || p.weekLabel === weekLabel) && p.status === 'Approved');
        if(approvedIdx !== -1){ alert('This employee already received salary for the selected week — cannot create another approved payslip for the same week.'); return false; }
        const newPayslip = { weekStart: weekStart, weekLabel: weekLabel, weekKey: weekKey, gross: Math.round(gross), statutory: Math.round(statutoryForSave), net: Math.round(net), created: new Date().toISOString(), status: 'Pending', lateHours: Number(lateHoursVal)||0, lateMinutes: Number(lateMinutesVal)||0, lateDeduction: Math.round(lateDeductionVal*100)/100 };
        const foundIdx = existing.findIndex(p => p && (p.weekKey === weekKey || p.weekStart === weekStart || p.weekLabel === weekLabel));
        if(foundIdx !== -1){ existing[foundIdx] = Object.assign({}, existing[foundIdx], newPayslip); } else { existing.unshift(newPayslip); }
        localStorage.setItem(key, JSON.stringify(existing));
        try{ updatePendingPayslipCount(); }catch(e){}
      }catch(e){ console.warn('processPayrollRunFor failed', e); return false; }
      saveEmployeesToStorage(); renderFiltered(); updateHomeStats();
      try{ document.getElementById('lastGross').textContent = '₱'+Math.round(gross).toLocaleString(); }catch(e){}
      try{
        const _empObj = employees.find(p=>String(p.id)===String(empId));
        const statutoryTotal = (_empObj && _empObj.deductions) ? (Number(_empObj.deductions.sss||0)+Number(_empObj.deductions.philhealth||0)+Number(_empObj.deductions.pagibig||0)) : 0;
        const _net = Math.round(Math.max(0, Number(gross) - statutoryTotal));
        document.getElementById('lastNet').textContent = '₱'+_net.toLocaleString();
      }catch(e){}
      return true;
    }
  const payrollCancelBtn = document.getElementById('payrollCancel');
  if(payrollCancelBtn){ payrollCancelBtn.addEventListener('click', ()=>{ const modal = document.getElementById('payrollModal'); if(modal){ modal.style.display='none'; modal.setAttribute('aria-hidden','true'); } }); }

  if(els.downloadBtn) els.downloadBtn.addEventListener('click', ()=>{
    if(employees.length===0){ alert('No employees to export.'); return; }
    const rows = [['ID','Name','Role','Salary (weekly ₱)','LastNet (weekly ₱)']];
    employees.forEach(e=> {
      const weekly = Math.round(e.salary / 52);
      rows.push([e.id, e.name, e.role, weekly, e.lastNet]);
    });
    const csv = rows.map(r=> r.map(cell => '"'+String(cell).replace(/"/g,'""')+'"').join(',')).join('\n');
    const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'payroll_employees.csv'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  });

  els.modal.addEventListener('click', (e)=>{ if(e.target===els.modal) closeModal(); });

  function switchSection(section){
    els.sectionContents.forEach(el => el.classList.remove('active'));
    els.navLinks.forEach(link => link.classList.remove('active'));
    
    document.getElementById(section).classList.add('active');
    document.querySelector(`[data-section="${section}"]`).classList.add('active');

    const header = document.querySelector('.dashboard > header');
    const headerControls = document.querySelector('.dashboard > header .controls');
    
    // hide header on these sections (home, attendance, salary, leaves, payroll)
    // Also hide the top header for 'employees', 'archive' and 'timeclock' per UI preference so
    // those pages don't show the empty white header bar above the content.
    if(section === 'home' || section === 'attendance' || section === 'salary' || section === 'leaves' || section === 'payroll' || section === 'employees' || section === 'archive' || section === 'timeclock'){
      header.style.display = 'none';
    } else {
      header.style.display = 'flex';
      // show header controls only on employees section
      if(headerControls) headerControls.style.display = section === 'employees' ? 'flex' : 'none';
    }

    if(section === 'salary'){
      renderSalarySlips();
    }
    if(section === 'payroll'){
      renderPayrollPage();
    }
    
    if(section === 'home'){
      updateHomeStats();
    }
  }

  els.navLinks.forEach(link => {
    link.addEventListener('click', (e)=>{
      e.preventDefault();
      const section = link.dataset.section;
      switchSection(section);
    });
  });

  if(els.homeAddEmpBtn) els.homeAddEmpBtn.addEventListener('click', ()=>{ openModal(); switchSection('employees'); });
  if(els.homeRunPayrollBtn) els.homeRunPayrollBtn.addEventListener('click', ()=>{ openPayrollModal(); });
  if(els.homeDownloadBtn) els.homeDownloadBtn.addEventListener('click', ()=>{ if(els.downloadBtn) els.downloadBtn.click(); });
  if(els.homeViewSalaryBtn) els.homeViewSalaryBtn.addEventListener('click', ()=>{ switchSection('salary'); });

  // payroll section quick run button (mirrors the main Run Payroll flow)
  if(els.payrollRunBtn) els.payrollRunBtn.addEventListener('click', ()=>{ openPayrollModal(); });

  // payroll export CSV (export all payslips across employees)
  const payrollExportBtn = document.getElementById('payrollExportBtn');
  if(payrollExportBtn) payrollExportBtn.addEventListener('click', ()=>{
    // aggregate rows: Emp ID, Name, Week, Gross, Statutory, Net, Status
    const rows = [['Emp ID','Name','Week','Gross','Statutory','Net','Status']];
    employees.forEach(emp=>{
      try{
        const list = JSON.parse(localStorage.getItem('employee_payslips_' + emp.id) || '[]');
        if(Array.isArray(list)){
          list.forEach(p=> rows.push([emp.id, emp.name, p.weekLabel || p.weekStart || p.weekKey || (p.created?new Date(p.created).toISOString().slice(0,10):''), Number(p.gross||0), Number(p.statutory||0), Number(p.net||0), p.status || '']));
        }
      }catch(e){ /* ignore */ }
    });
    if(rows.length <= 1){ alert('No payslips to export'); return; }
    const csv = rows.map(r=> r.map(c=> '"' + String(c).replace(/"/g,'""') + '"').join(',')).join('\n');
    const blob = new Blob([csv], {type:'text/csv'});
    const url = URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download='payroll_all_payslips.csv'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  });

  function updateHomeStats(){
    // show the total employees number on Home overview
    els.homeEmployeeCount.textContent = employees.length;
    // Compute all-time lates across entire attendance history (sum of all late instances)
    try {
      loadAttendanceFromStorage(); // ensures attendance[] is built
      const all = computeAllTimeLates();
      if(els.homeLateCount) els.homeLateCount.textContent = String(all.count || 0);
      if(els.homeLateMinutes) els.homeLateMinutes.textContent = `${all.totalMinutes || 0} min • ${all.count || 0} instances`;
      // still show unique late employees in the separate tile if present
      if(els.homeLateAllCount) els.homeLateAllCount.textContent = String(all.uniqueEmployees || 0);
      if(els.homeLateAllMinutes) els.homeLateAllMinutes.textContent = `${all.totalMinutes || 0} min • ${all.count || 0} instances`;
      if(els.homeLateAllCount) els.homeLateAllCount.style.color = (all.count && all.count > 0) ? '#b91c1c' : '#1f2937';
      if(els.homeLateCount) els.homeLateCount.style.color = (all.count && all.count > 0) ? '#b91c1c' : '#1f2937';
      // compute all-time total absents
      try{
        const abs = computeAllTimeAbsents();
        if(els.homeAbsentCount) els.homeAbsentCount.textContent = String(abs.count || 0);
        if(els.homeAbsentSummary) els.homeAbsentSummary.textContent = `${abs.count || 0} days • across history`;
        if(els.homeAbsentCount) els.homeAbsentCount.style.color = (abs.count && abs.count > 0) ? '#b91c1c' : '#1f2937';
      }catch(e){}
    } catch(e) { /* ignore */ }
  }

  function renderSalarySlips(){
    if(employees.length === 0){
      els.salarySlipsContainer.innerHTML = '<p class="muted">No employees available. Add employees and run payroll first.</p>';
      return;
    }

    // Load pending payslips for all employees and show them for admin approval
    let pendingHtml = '<h3>Pending Payslips</h3>';
    let anyPending = false;
    pendingHtml += '<table style="width:100%;border-collapse:collapse;margin-bottom:12px"><thead><tr><th style="padding:10px;border-bottom:1px solid #eef2f7">Employee</th><th style="padding:10px;border-bottom:1px solid #eef2f7">Week</th><th style="padding:10px;border-bottom:1px solid #eef2f7">Gross (₱)</th><th style="padding:10px;border-bottom:1px solid #eef2f7">Statutory (₱)</th><th style="padding:10px;border-bottom:1px solid #eef2f7">Net (₱)</th><th style="padding:10px;border-bottom:1px solid #eef2f7">Status</th><th style="padding:10px;border-bottom:1px solid #eef2f7">Action</th></tr></thead><tbody>';
    employees.forEach(emp => {
      try{
        const key = 'employee_payslips_' + emp.id;
        const list = JSON.parse(localStorage.getItem(key) || '[]');
        if(Array.isArray(list)){
          // Build a map of pending payslips keyed by week (choose newest created when duplicates exist)
          const pendingMap = Object.create(null);
          list.forEach(p => {
            if(!p || p.status !== 'Pending') return;
            const wk = p.weekKey || p.weekStart || p.weekLabel || (p.created ? new Date(p.created).toISOString().slice(0,10) : null);
            if(!wk) return;
            if(!pendingMap[wk] || (pendingMap[wk] && new Date(p.created).getTime() > new Date(pendingMap[wk].created).getTime())){
              pendingMap[wk] = p;
            }
          });
          Object.keys(pendingMap).forEach(wk => {
            const p = pendingMap[wk];
            anyPending = true;
            pendingHtml += `<tr><td style="padding:8px;border-bottom:1px solid #eef2f7">${emp.name} <div class="muted">${emp.id}</div></td><td style="padding:8px;border-bottom:1px solid #eef2f7">${p.weekLabel||p.weekStart||p.date||''}</td><td style="padding:8px;border-bottom:1px solid #eef2f7">₱${Number(p.gross).toLocaleString()}</td><td style="padding:8px;border-bottom:1px solid #eef2f7">₱${Number(p.statutory).toLocaleString()}</td><td style="padding:8px;border-bottom:1px solid #eef2f7">₱${Number(p.net).toLocaleString()}</td><td style="padding:8px;border-bottom:1px solid #eef2f7">${p.status}</td><td style="padding:8px;border-bottom:1px solid #eef2f7"><button style="background:#10b981;color:#fff;border:none;padding:6px 8px;border-radius:4px;cursor:pointer;font-size:12px" data-owner="${emp.id}" data-created="${p.created}" class="confirmPayslipBtn">Confirm</button></td></tr>`;
          });
        }
      }catch(e){/* ignore */}
    });
    pendingHtml += '</tbody></table>';
    if(!anyPending) pendingHtml = '<p class="muted">No pending payslips.</p>';

    // Enhanced Employee Summary:
    // Show per-employee: ID, Name, Days Present (this week), Hours Worked (this week), Weekly Gross, Statutory, Net Pay, Last Run Net, Actions
    let html = '<h3>Employee Summary</h3>';
    html += '<table style="width:100%;border-collapse:collapse"><thead><tr>' +
      '<th style="padding:10px;text-align:left;border-bottom:1px solid #eef2f7">ID</th>' +
      '<th style="padding:10px;text-align:left;border-bottom:1px solid #eef2f7">Name</th>' +
      '<th style="padding:10px;text-align:left;border-bottom:1px solid #eef2f7">Days Present (wk)</th>' +
      '<th style="padding:10px;text-align:left;border-bottom:1px solid #eef2f7">Hours Worked (wk)</th>' +
      '<th style="padding:10px;text-align:left;border-bottom:1px solid #eef2f7">Weekly Gross (₱)</th>' +
      '<th style="padding:10px;text-align:left;border-bottom:1px solid #eef2f7">Statutory Benefits (₱)</th>' +
      '<th style="padding:10px;text-align:left;border-bottom:1px solid #eef2f7">Net Pay (₱)</th>' +
      '<th style="padding:10px;text-align:left;border-bottom:1px solid #eef2f7">Last Run Net (₱)</th>' +
      '<th style="padding:10px;text-align:left;border-bottom:1px solid #eef2f7">Actions</th>' +
      '</tr></thead><tbody>';

    // choose the most recent week (index 0) if available, otherwise default to 0
    const recentWeekIndex = 0;
    employees.forEach(emp => {
      const weeklyGross = Math.round(emp.salary/52);
  // statutory deductions only (SSS/Philhealth/Pagibig). Do NOT apply an extra "tax" here
  // so that Employee Summary matches the payroll run calculation (gross - statutory - lateDeduction)
  const dedTotal = (emp.deductions ? Number(emp.deductions.sss||0)+Number(emp.deductions.philhealth||0)+Number(emp.deductions.pagibig||0) : 0);
  const netPay = Math.round(weeklyGross - dedTotal);
      // compute hours/days for the most recent week using existing helper
      let daysPresent = 0; let hoursWorked = 0;
      try{
        const res = calculateHoursForEmployeeInWeek(recentWeekIndex, emp.id);
        hoursWorked = Number(res.hours || 0);
        daysPresent = Number(res.days || 0);
      }catch(e){ hoursWorked = 0; daysPresent = 0; }
      const lastRunNet = (emp.lastNet && emp.lastNet !== '—') ? Number(emp.lastNet) : '';
      // compute weekly performance status
      let perf = { status: 'No data', presentDays: daysPresent, absentDays: 0, lateDays: 0 };
      try{ perf = computePerformanceForWeek(recentWeekIndex, emp.id); }catch(e){ }
      html += `<tr>` +
        `<td style="padding:10px;border-bottom:1px solid #eef2f7">${emp.id}</td>` +
        `<td style="padding:10px;border-bottom:1px solid #eef2f7">${emp.name}</td>` +
        `<td style="padding:10px;border-bottom:1px solid #eef2f7">${daysPresent}</td>` +
        `<td style="padding:10px;border-bottom:1px solid #eef2f7">${hoursWorked}</td>` +
        `<td style="padding:10px;border-bottom:1px solid #eef2f7">₱${weeklyGross.toLocaleString()}</td>` +
        `<td style="padding:10px;border-bottom:1px solid #eef2f7">₱${Math.round(dedTotal).toLocaleString()}</td>` +
        `<td style="padding:10px;border-bottom:1px solid #eef2f7">₱${netPay.toLocaleString()}</td>` +
        `<td style="padding:10px;border-bottom:1px solid #eef2f7">${lastRunNet?('₱'+Number(lastRunNet).toLocaleString()):'—'}</td>` +
        `<td style="padding:10px;border-bottom:1px solid #eef2f7"><button class="viewPayslipsBtn" data-owner="${emp.id}" style="padding:6px 10px;border-radius:6px;">View Payslips</button></td>` +
      `</tr>`;
    });

    html += '</tbody></table>';
    els.salarySlipsContainer.innerHTML = pendingHtml + html;

    // wire view payslips buttons to open a quick payslip list in a new window
    document.querySelectorAll('.viewPayslipsBtn').forEach(b=>{
      b.addEventListener('click', ()=>{
        const owner = b.dataset.owner;
        try{
          const list = JSON.parse(localStorage.getItem('employee_payslips_' + owner) || '[]');
          // try to resolve employee name from the in-memory employees list
          const emp = (employees || []).find(e=> String(e.id) === String(owner)) || { name: owner };
          const displayName = emp.name || owner;
          const titleText = `Payslips for ${displayName} (${owner})`;
          
          // Generate HTML with logo
          const rows = (Array.isArray(list) && list.length) ? list.map(p=> `<tr><td style="padding:10px;border:1px solid #000">${p.weekLabel||p.weekStart||p.weekKey||''}</td><td style="padding:10px;border:1px solid #000;text-align:right">₱${Number(p.gross||0).toLocaleString()}</td><td style="padding:10px;border:1px solid #000;text-align:right">₱${Number(p.statutory||p.statutory||0).toLocaleString()}</td><td style="padding:10px;border:1px solid #000;text-align:right">₱${Number(p.net||0).toLocaleString()}</td><td style="padding:10px;border:1px solid #000">${p.status||''}</td></tr>`).join('') : '<tr><td colspan="5" style="padding:10px;border:1px solid #000">No payslips found</td></tr>';
          
          const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>${titleText}</title>
  <style>
    body { font-family: Arial, sans-serif; color: #000; padding: 20px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; }
    .logo { height: 60px; width: auto; }
    table { width: 100%; border-collapse: collapse; margin-top: 10px; }
    th, td { border: 1px solid #000; padding: 10px; text-align: left; }
    th { background: #f3f4f6; font-weight: 700; }
    .generated { margin-top: 16px; font-size: 12px; color: #666; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <h2 style="margin:0">${displayName}</h2>
      <p style="color:#666;margin:4px 0">${owner}</p>
    </div>
    <img src="src/logo.png" alt="Company Logo" class="logo">
  </div>
  <table>
    <thead>
      <tr>
        <th>Week</th>
        <th>Gross</th>
        <th>Statutory</th>
        <th>Net</th>
        <th>Status</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>
  <div class="generated">Generated: ${new Date().toLocaleString()}</div>
</body>
</html>`;
          
          const w = window.open('', '_blank');
          w.document.write(html);
          w.document.close();
          
          // Auto-trigger print dialog for PDF-like experience
          setTimeout(()=>{ 
            try{ w.focus(); w.print(); }
            catch(e){ } 
          }, 500);
        }catch(e){ alert('Failed to open payslips'); }
      });
    });

    // update dashboard pending count
    try{ updatePendingPayslipCount(); }catch(e){}

    // wire confirm buttons
    document.querySelectorAll('.confirmPayslipBtn').forEach(b=>{
      b.addEventListener('click',(ev)=>{
        const owner = b.dataset.owner; const created = b.dataset.created;
        if(!owner || !created) return;
        if(!confirm('Approve this payslip for ' + owner + '?')) return;
        adminConfirmPayslip(owner, created);
      });
    });
  }

  // small helper to escape HTML when creating printable/export content
  function escapeHtml(str){ return String(str||'').replace(/[&"'<>]/g, function(c){ return {'&':'&amp;','"':'&quot;','\'':'&#39;','<':'&lt;','>':'&gt;'}[c]; }); }

  // Render the dedicated Payroll page: show Run button and recent payroll runs grouped by week
  function renderPayrollPage(){
    // Populate inline payroll selects (employee & week) — do this even if the historical runs container was removed
    try{
      const inlineEmp = document.getElementById('payrollInlineEmployeeSelect');
      const inlineWeek = document.getElementById('payrollInlineWeekSelect');
      if(inlineEmp){ inlineEmp.innerHTML = ''; employees.forEach(emp=>{ const opt = document.createElement('option'); opt.value = emp.id; opt.textContent = `${emp.name} (${emp.id})`; inlineEmp.appendChild(opt); }); }
      if(inlineWeek){ inlineWeek.innerHTML = ''; if(attendanceWeeks && attendanceWeeks.length){ attendanceWeeks.forEach((w,i)=>{ try{ const s = new Date(w.weekStart+'T00:00:00'); const e = new Date(s.getTime() + 6*24*3600*1000); const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']; const sMon = months[s.getMonth()]; const eMon = months[e.getMonth()]; const sDay = s.getDate(); const eDay = e.getDate(); const label = (sMon===eMon)? `${sMon} ${sDay} - ${eDay}` : `${sMon} ${sDay} - ${eMon} ${String(eDay).padStart(2,'0')}`; const opt = document.createElement('option'); opt.value = String(i); opt.textContent = label; inlineWeek.appendChild(opt);}catch(err){ const opt=document.createElement('option'); opt.value=String(i); opt.textContent=w.weekStart; inlineWeek.appendChild(opt); } }); } else { const opt=document.createElement('option'); opt.value='0'; opt.textContent='(No attendance weeks)'; inlineWeek.appendChild(opt); } }
    }catch(e){ /* ignore if inline not present */ }

    // Historical payroll runs list has been removed from the UI — nothing to render here.

    // wire up inline payroll form handlers if present
    try{
      const inlineEmp = document.getElementById('payrollInlineEmployeeSelect');
      const inlineWeek = document.getElementById('payrollInlineWeekSelect');
      const inlineDays = document.getElementById('payrollInlineDays');
      const inlineHours = document.getElementById('payrollInlineHours');
      const inlineGross = document.getElementById('payrollInlineGross');
      const inlineStat = document.getElementById('payrollInlineStat');
      const inlineNet = document.getElementById('payrollInlineNet');
      const inlineNotice = document.getElementById('payrollInlineNotice');
      const inlineLateHours = document.getElementById('payrollInlineLateHours');
      const inlineLateMinutes = document.getElementById('payrollInlineLateMinutes');
      const inlineLateDed = document.getElementById('payrollInlineLateDeduction');
      const inlineConfirm = document.getElementById('payrollInlineConfirm');
      const inlineCancel = document.getElementById('payrollInlineCancel');
      function updateInlinePreview(){
        try{
          const empId = inlineEmp ? inlineEmp.value : null;
          const weekIndex = inlineWeek ? Number(inlineWeek.value) || 0 : 0;
          const res = calculateHoursForEmployeeInWeek(weekIndex, empId);
          const totalHours = res.hours || 0; const days = res.days || 0;
          const paidHours = totalHours;
          const gross = Math.round(((paidHours / 8) * 510) * 100)/100;
          const emp = employees.find(p=> String(p.id) === String(empId));
          const statutory = emp && emp.deductions ? (Number(emp.deductions.sss||0)+Number(emp.deductions.philhealth||0)+Number(emp.deductions.pagibig||0)) : 0;
          const lateInfo = computeLateFromAttendance(weekIndex, empId);
          // prefer computed values from attendance for the inline preview — overwrite previous 0 with computed lateness
          if(inlineLateHours && inlineLateMinutes){ inlineLateHours.value = (typeof lateInfo.lateHours === 'number' ? String(lateInfo.lateHours) : String(lateInfo.lateHours || 0)); inlineLateMinutes.value = (typeof lateInfo.lateMinutes === 'number' ? String(lateInfo.lateMinutes) : String(lateInfo.lateMinutes || 0)); }
          const manualLateHours = Number(inlineLateHours ? inlineLateHours.value : 0) || 0;
          const manualLateMinutes = Number(inlineLateMinutes ? inlineLateMinutes.value : 0) || 0;
          const weeklyForDed = (emp && typeof emp.salary !== 'undefined' && emp.salary !== null) ? (Math.round(Number(emp.salary) / 52) || (510*6)) : (510*6);
          const lateDed = calculateLateDeduction(weeklyForDed, manualLateHours, manualLateMinutes) || 0;
          const net = Math.max(0, Math.round((gross - statutory - lateDed) * 100)/100);
          if(inlineDays) inlineDays.textContent = days;
          if(inlineHours) inlineHours.textContent = totalHours;
          if(inlineGross) inlineGross.textContent = `₱${gross.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}`;
          if(inlineStat) inlineStat.textContent = `₱${statutory.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}`;
          if(inlineNet) inlineNet.textContent = `₱${net.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}`;
          if(inlineLateDed) inlineLateDed.textContent = '₱' + (lateDed || 0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});
          // Notice about already-approved payslip
          try{
            const key = 'employee_payslips_' + empId;
            const existingList = JSON.parse(localStorage.getItem(key) || '[]');
            let currentWeekStart = null; let currentWeekLabel = null;
            if(attendanceWeeks && attendanceWeeks.length && attendanceWeeks[weekIndex]){ currentWeekStart = attendanceWeeks[weekIndex].weekStart || null; try{ const s=new Date(currentWeekStart+'T00:00:00'); const e=new Date(s.getTime()+6*24*3600*1000); const months=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']; const sMon=months[s.getMonth()]; const eMon=months[e.getMonth()]; const sDay=s.getDate(); const eDay=e.getDate(); currentWeekLabel = (sMon===eMon) ? `${sMon} ${sDay} - ${eDay}` : `${sMon} ${sDay} - ${eMon} ${String(eDay).padStart(2,'0')}`; }catch(e){}
            }
            const weekKeyCandidate = currentWeekStart || currentWeekLabel || (`week_${weekIndex}`);
            const already = existingList && Array.isArray(existingList) ? existingList.find(p => p && (p.weekKey === weekKeyCandidate || p.weekStart === currentWeekStart || p.weekLabel === currentWeekLabel)) : null;
            if(inlineNotice){ if(already && already.status === 'Approved') inlineNotice.textContent = 'This week already has an approved payslip for this employee.'; else if(already && already.status === 'Pending') inlineNotice.textContent = 'A payslip for this week is already pending approval.'; else inlineNotice.textContent = ''; }
          }catch(e){/* ignore */}
        }catch(e){ /* ignore */ }
      }
      if(inlineEmp) inlineEmp.onchange = updateInlinePreview;
      if(inlineWeek) inlineWeek.onchange = updateInlinePreview;
      if(inlineLateHours){ inlineLateHours.addEventListener('input', updateInlinePreview); inlineLateHours.addEventListener('change', updateInlinePreview); }
      if(inlineLateMinutes){ inlineLateMinutes.addEventListener('input', updateInlinePreview); inlineLateMinutes.addEventListener('change', updateInlinePreview); }
      if(inlineConfirm){ inlineConfirm.addEventListener('click', ()=>{
        try{
          const empId = inlineEmp ? inlineEmp.value : null;
          const weekIndex = inlineWeek ? Number(inlineWeek.value) || 0 : 0;
          const lateHoursVal = inlineLateHours ? Number(inlineLateHours.value) || 0 : 0;
          const lateMinutesVal = inlineLateMinutes ? Number(inlineLateMinutes.value) || 0 : 0;
          // compute gross same as preview
          const res = calculateHoursForEmployeeInWeek(weekIndex, empId); const totalHours = res.hours || 0; const gross = Math.round(((totalHours / 8) * 510) * 100)/100;
          const ok = processPayrollRunFor(empId, weekIndex, lateHoursVal, lateMinutesVal, gross);
          if(ok){ updateInlinePreview(); renderPayrollPage(); alert('Payroll run saved for ' + (employees.find(p=>String(p.id)===String(empId))?.name || empId)); }
        }catch(e){ console.warn(e); }
      }); }
      if(inlineCancel){ inlineCancel.addEventListener('click', ()=>{
        // reset late fields and notice
        try{ if(inlineLateHours) inlineLateHours.value = 0; if(inlineLateMinutes) inlineLateMinutes.value = 0; if(inlineNotice) inlineNotice.textContent = ''; updateInlinePreview(); }catch(e){}
      }); }
      // initial preview update
      if(document.getElementById('payrollInlineForm')) setTimeout(()=>{ try{ const el = document.getElementById('payrollInlineForm'); if(el){ updateInlinePreview(); } }catch(e){} }, 30);
    }catch(e){ /* ignore absence of inline form */ }
  }

  // Approve a payslip for a given employee (ownerId) and payslip created timestamp
  function adminConfirmPayslip(ownerId, created){
    try{
      const key = 'employee_payslips_' + ownerId;
      const list = JSON.parse(localStorage.getItem(key) || '[]');
      if(!Array.isArray(list) || list.length === 0) return;
      // Find the target payslip by created timestamp (the one user clicked). If there are multiple payslips
      // for the same week, consolidate them: keep the newest (by created) and remove the rest.
      const target = list.find(p=> p && p.created === created);
      if(!target) return;
      const weekId = target.weekKey || target.weekStart || target.weekLabel || (target.created ? new Date(target.created).toISOString().slice(0,10) : null);
      if(!weekId){
        // Fallback: mark the exact record approved
        const idx = list.findIndex(p=> p && p.created === created);
        if(idx !== -1){ list[idx].status = 'Approved'; }
      } else {
        // Collect all payslips for this week, choose newest to keep
        const group = list.filter(p => p && (p.weekKey === weekId || p.weekStart === weekId || p.weekLabel === weekId));
        if(group.length === 0){
          // no group; fallback
          const idx = list.findIndex(p=> p && p.created === created);
          if(idx !== -1) list[idx].status = 'Approved';
        } else {
          // choose newest by created timestamp
          group.sort((a,b)=>{ return new Date(b.created).getTime() - new Date(a.created).getTime(); });
          const keeper = group[0];
          keeper.status = 'Approved';
          // remove other duplicates
          const remaining = list.filter(p => !(p && (p.weekKey === weekId || p.weekStart === weekId || p.weekLabel === weekId)));
          remaining.unshift(keeper);
          // replace storage list
          localStorage.setItem(key, JSON.stringify(remaining));
          // reload into list variable for further use
          // (skip re-setting below since we already saved)
          renderSalarySlips();
          loadEmployeesFromStorage(); renderFiltered();
          alert('Payslip approved and duplicates consolidated. Employee will see the approved payslip.');
          return;
        }
      }
      // write back and refresh
      localStorage.setItem(key, JSON.stringify(list));
      renderSalarySlips();
      try{ updatePendingPayslipCount(); }catch(e){}
      loadEmployeesFromStorage(); renderFiltered();
      alert('Payslip approved. Employee will see it in their dashboard.');
    }catch(e){ console.error(e); }
  }

  function renderArchive(){
    if(!els.archiveBody) return;
    els.archiveBody.innerHTML = '';
    if(archive.length === 0){
      const tr = document.createElement('tr');
      tr.innerHTML = '<td colspan="6" class="muted" style="padding:12px">No archived employees.</td>';
      els.archiveBody.appendChild(tr);
      return;
    }
    archive.forEach(emp => {
      const tr = document.createElement('tr');
      const weeklySalary = Math.round(emp.salary / 52);
      tr.innerHTML = `
        <td>${emp.id}</td>
        <td>${emp.name}</td>
        <td>${emp.role}</td>
        <td>₱${weeklySalary.toLocaleString()}</td>
        <td>${emp.lastNet && emp.lastNet !== '—' ? '₱'+Number(emp.lastNet).toLocaleString() : '—'}</td>
        <td class="actions"><button class="secondary restore" data-id="${emp.id}">Restore</button> <button data-id="${emp.id}" class="warn permadelete">Delete</button></td>
      `;
      els.archiveBody.appendChild(tr);
    });
  }

  function renderAttendance(){
    els.attendanceBody.innerHTML = '';
    // Determine current week key and the query that applies to this week (if any)
    let currentWeekKey = null;
    if(attendanceWeeks && attendanceWeeks.length){
      const wkIndex = Math.min(Math.max(0, attendanceCurrentPage - 1), attendanceWeeks.length - 1);
      const wk = attendanceWeeks[wkIndex];
      currentWeekKey = wk ? (wk.weekStart || ('week_' + wkIndex)) : null;
    }
    const q = (currentWeekKey && attendanceSearchByWeek[currentWeekKey]) ? (attendanceSearchByWeek[currentWeekKey] || '') : (attendanceSearchQuery || '');
    // ensure the input shows the query relevant to the current week/page
    if(els.attendanceSearch) els.attendanceSearch.value = q || '';
    const weekRangeEl = document.getElementById('attendanceWeekRange');
    // If searching, keep previous behavior: filter across entire attendance and paginate by attendancePageSize
    if(q){
      // When weeks are built, restrict search to the currently displayed week so results
      // only show records from that week. Fallback to global search when weeks not present.
      let filteredAttendance = [];
      let currentWeekLabel = null;
      if(attendanceWeeks && attendanceWeeks.length > 0){
        const wkIndex = Math.min(Math.max(0, attendanceCurrentPage - 1), attendanceWeeks.length - 1);
        const currentWeek = attendanceWeeks[wkIndex];
        currentWeekLabel = currentWeek ? currentWeek.weekStart : null;
        filteredAttendance = (currentWeek && Array.isArray(currentWeek.items) ? currentWeek.items : []).filter(rec => {
          return String(rec.name || '').toLowerCase().includes(q) || String(rec.id || '').toLowerCase().includes(q) || String(rec.attendanceId || '').toLowerCase().includes(q);
        });
      } else {
        filteredAttendance = attendance.filter(rec => {
          return String(rec.name || '').toLowerCase().includes(q) || String(rec.id || '').toLowerCase().includes(q) || String(rec.attendanceId || '').toLowerCase().includes(q);
        });
      }
      const total = filteredAttendance.length;
      // When searching within a week, always show the matching items for that week
      // (do not repurpose attendanceCurrentPage as a search pagination index). This
      // prevents mixing results across weeks and avoids confusing pagination.
      const pageItems = filteredAttendance.slice(0, filteredAttendance.length);
      pageItems.forEach((rec, i) => {
        const originalIdx = attendance.indexOf(rec);
        const idx = originalIdx;
        const tr = document.createElement('tr');
      // Prefer ISO timestamps for exact date/time when available; show time-only in columns
      const timeIn = rec.timeInISO ? formatIsoToTime(rec.timeInISO) : (rec.timeIn ? formatTo12Hour(rec.timeIn) : '—');
      const timeOut = rec.timeOutISO ? formatIsoToTime(rec.timeOutISO) : (rec.timeOut ? formatTo12Hour(rec.timeOut) : '—');
      // Calculate work duration (hours and minutes) when both in/out available
      let workDurationStr = '';
      try{
        let inDt = null, outDt = null;
        if(rec.timeInISO && rec.timeOutISO){
          inDt = new Date(rec.timeInISO);
          outDt = new Date(rec.timeOutISO);
        } else if(rec.timeIn && rec.timeOut){
          // parse human-readable times (e.g., '6:53 am') using the record date if available
          const refDate = rec.date ? new Date(rec.date + 'T00:00:00') : new Date();
          const parseHumanTime = (t, ref) => {
            const m = t.match(/(\d{1,2}):(\d{2})(?:\s*(am|pm))?/i);
            if(!m) return null;
            let hh = Number(m[1]);
            const mm = Number(m[2]);
            const ampm = m[3] ? m[3].toLowerCase() : null;
            if(ampm){ if(ampm === 'pm' && hh !== 12) hh += 12; if(ampm === 'am' && hh === 12) hh = 0; }
            const d = new Date(ref.getTime()); d.setHours(hh, mm, 0, 0); return d;
          };
          inDt = parseHumanTime(rec.timeIn, refDate);
          outDt = parseHumanTime(rec.timeOut, refDate);
        }
        if(inDt && outDt && !isNaN(inDt.getTime()) && !isNaN(outDt.getTime())){
          // if outDt earlier than inDt, assume next day
          if(outDt.getTime() < inDt.getTime()) outDt = new Date(outDt.getTime() + 24*3600*1000);
          // compute net minutes excluding unpaid lunch window
          const netMin = computeNetMinutesBetween(inDt, outDt);
          const paidMin = Math.min(netMin, 8 * 60);
          const hrs = Math.floor(netMin / 60);
          const mins = netMin % 60;
          workDurationStr = `${hrs}h ${mins}m` + (paidMin !== netMin ? ` • paid ${ (paidMin/60).toFixed(2) }h` : '');
        }
      }catch(e){ workDurationStr = ''; }
      const status = rec.status || (rec.timeOutISO || rec.timeOut ? 'Offline' : (rec.timeInISO || rec.timeIn ? 'Online' : 'Offline'));
      const attendanceIdValue = rec.attendanceId ? rec.attendanceId : '—';
      // If ISO timestamp has date info, ensure the date column shows the local YYYY-MM-DD from the ISO
      let displayDate = rec.date || '—';
      if(rec.timeInISO){ const d = new Date(rec.timeInISO); if(!isNaN(d.getTime())) displayDate = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
      else if(rec.timeOutISO){ const d = new Date(rec.timeOutISO); if(!isNaN(d.getTime())) displayDate = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
      const workHoursCell = workDurationStr ? `<div class="muted" style="font-size:12px">${workDurationStr}</div>` : '—';
      tr.innerHTML = `
        <td style="padding:12px 8px;border-bottom:1px solid #eef2f7">${displayDate}</td>
        <td style="padding:12px 8px;border-bottom:1px solid #eef2f7">${rec.name} <div class="muted">${rec.id || ''}</div></td>
        <td style="padding:12px 8px;border-bottom:1px solid #eef2f7">${attendanceIdValue}</td>
        <td style="padding:12px 8px;border-bottom:1px solid #eef2f7">${timeIn}</td>
        <td style="padding:12px 8px;border-bottom:1px solid #eef2f7">${timeOut}</td>
        <td style="padding:12px 8px;border-bottom:1px solid #eef2f7">${workHoursCell}</td>
        <td style="padding:12px 8px;border-bottom:1px solid #eef2f7">${status}</td>
      `;
        els.attendanceBody.appendChild(tr);
        // Remove button intentionally omitted from attendance rows per request
      });
      // update pagination indicator controls if present
      const indicator = document.getElementById('attendancePageIndicator');
      const prevBtn = document.getElementById('attendancePrev');
      const nextBtn = document.getElementById('attendanceNext');
      // keep week navigation enabled (so admin can switch weeks while a query is active)
      if(indicator) indicator.textContent = `${attendanceCurrentPage}`;
      if(prevBtn) prevBtn.disabled = attendanceCurrentPage <= 1;
      if(nextBtn) nextBtn.disabled = attendanceCurrentPage >= (attendanceWeeks ? attendanceWeeks.length : 1);
      // show a simple label when results are from search
      if(weekRangeEl){
        if(currentWeekLabel){
          // compute readable label for the current weekStart and include year
          try{
            const s = new Date(currentWeekLabel + 'T00:00:00');
            const e = new Date(s.getTime() + 6 * 24 * 3600 * 1000);
            const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
            const sMon = months[s.getMonth()]; const eMon = months[e.getMonth()];
            const sDay = s.getDate(); const eDay = e.getDate();
            const pad = d => String(d).padStart(2,'0');
            let weekLabel = '';
            if(s.getFullYear() === e.getFullYear()){
              // same year: append single year
              weekLabel = (sMon === eMon) ? `${sMon} ${sDay} - ${eDay}, ${s.getFullYear()}` : `${sMon} ${sDay} - ${eMon} ${pad(eDay)}, ${s.getFullYear()}`;
            } else {
              // cross-year week: show full year for each end
              weekLabel = `${sMon} ${sDay}, ${s.getFullYear()} - ${eMon} ${pad(eDay)}, ${e.getFullYear()}`;
            }
            weekRangeEl.textContent = `${weekLabel} (${total})`;
          }catch(e){ weekRangeEl.textContent = `Search results (${total})`; }
        } else {
          weekRangeEl.textContent = `Search results (${total})`;
        }
      }
      return;
    }

    // No search: render by week groups. Each page represents one week (attendanceWeeks[page-1])
    if(!attendanceWeeks || attendanceWeeks.length === 0){
      const tr = document.createElement('tr');
      tr.innerHTML = '<td colspan="7" style="padding:12px" class="muted">No attendance records.</td>';
      els.attendanceBody.appendChild(tr);
      const indicator = document.getElementById('attendancePageIndicator');
      if(indicator) indicator.textContent = '1';
      if(weekRangeEl) weekRangeEl.textContent = '—';
      const prevBtn = document.getElementById('attendancePrev');
      const nextBtn = document.getElementById('attendanceNext');
      if(prevBtn) prevBtn.disabled = true; if(nextBtn) nextBtn.disabled = true;
      return;
    }

    // ensure current page within week bounds
    const totalWeeks = attendanceWeeks.length;
    attendanceCurrentPage = Math.min(Math.max(1, attendanceCurrentPage), totalWeeks);
    const week = attendanceWeeks[attendanceCurrentPage - 1];
    const pageItems = week.items;
    // compute and display the week date-range label (Monday - Sunday)
    if(weekRangeEl){
      try{
        const startIso = week.weekStart; // YYYY-MM-DD (Monday)
        const start = new Date(startIso + 'T00:00:00');
        const end = new Date(start.getTime() + 6 * 24 * 3600 * 1000);
        const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        const sMon = months[start.getMonth()];
        const eMon = months[end.getMonth()];
        const sDay = start.getDate();
        const eDay = end.getDate();
        const pad = d => String(d).padStart(2,'0');
        let label = '';
        if(start.getFullYear() === end.getFullYear()){
          // same year: append single year
          label = (sMon === eMon) ? `${sMon} ${sDay} - ${eDay}, ${start.getFullYear()}` : `${sMon} ${sDay} - ${eMon} ${pad(eDay)}, ${start.getFullYear()}`;
        } else {
          // cross-year week: show year for each end
          label = `${sMon} ${sDay}, ${start.getFullYear()} - ${eMon} ${pad(eDay)}, ${end.getFullYear()}`;
        }
        weekRangeEl.textContent = label;
      }catch(e){ weekRangeEl.textContent = '—'; }
    }
    pageItems.forEach((rec) => {
      const originalIdx = attendance.indexOf(rec);
      const idx = originalIdx;
      const tr = document.createElement('tr');
      // Prefer ISO timestamps for exact date/time when available; show time-only in columns
      const timeIn = rec.timeInISO ? formatIsoToTime(rec.timeInISO) : (rec.timeIn ? formatTo12Hour(rec.timeIn) : '—');
      const timeOut = rec.timeOutISO ? formatIsoToTime(rec.timeOutISO) : (rec.timeOut ? formatTo12Hour(rec.timeOut) : '—');
      // Calculate work duration (hours and minutes) when both in/out available
      let workDurationStr = '';
      try{
        let inDt = null, outDt = null;
        if(rec.timeInISO && rec.timeOutISO){
          inDt = new Date(rec.timeInISO);
          outDt = new Date(rec.timeOutISO);
        } else if(rec.timeIn && rec.timeOut){
          const refDate = rec.date ? new Date(rec.date + 'T00:00:00') : new Date();
          const parseHumanTime = (t, ref) => {
            const m = t.match(/(\d{1,2}):(\d{2})(?:\s*(am|pm))?/i);
            if(!m) return null;
            let hh = Number(m[1]);
            const mm = Number(m[2]);
            const ampm = m[3] ? m[3].toLowerCase() : null;
            if(ampm){ if(ampm === 'pm' && hh !== 12) hh += 12; if(ampm === 'am' && hh === 12) hh = 0; }
            const d = new Date(ref.getTime()); d.setHours(hh, mm, 0, 0); return d;
          };
          inDt = parseHumanTime(rec.timeIn, refDate);
          outDt = parseHumanTime(rec.timeOut, refDate);
        }
        if(inDt && outDt && !isNaN(inDt.getTime()) && !isNaN(outDt.getTime())){
          if(outDt.getTime() < inDt.getTime()) outDt = new Date(outDt.getTime() + 24*3600*1000);
          const netMin = computeNetMinutesBetween(inDt, outDt);
          const paidMin = Math.min(netMin, 8 * 60);
          const hrs = Math.floor(netMin / 60);
          const mins = netMin % 60;
          workDurationStr = `${hrs}h ${mins}m` + (paidMin !== netMin ? ` • paid ${ (paidMin/60).toFixed(2) }h` : '');
        }
      }catch(e){ workDurationStr = ''; }
      const status = rec.status || (rec.timeOutISO || rec.timeOut ? 'Offline' : (rec.timeInISO || rec.timeIn ? 'Online' : 'Offline'));
      const attendanceIdValue = rec.attendanceId ? rec.attendanceId : '—';
      let displayDate = rec.date || '—';
      if(rec.timeInISO){ const d = new Date(rec.timeInISO); if(!isNaN(d.getTime())) displayDate = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
      else if(rec.timeOutISO){ const d = new Date(rec.timeOutISO); if(!isNaN(d.getTime())) displayDate = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
      const workHoursCell = workDurationStr ? `<div class="muted" style="font-size:12px">${workDurationStr}</div>` : '—';
      tr.innerHTML = `
        <td style="padding:12px 8px;border-bottom:1px solid #eef2f7">${displayDate}</td>
        <td style="padding:12px 8px;border-bottom:1px solid #eef2f7">${rec.name} <div class="muted">${rec.id || ''}</div></td>
        <td style="padding:12px 8px;border-bottom:1px solid #eef2f7">${attendanceIdValue}</td>
        <td style="padding:12px 8px;border-bottom:1px solid #eef2f7">${timeIn}</td>
        <td style="padding:12px 8px;border-bottom:1px solid #eef2f7">${timeOut}</td>
        <td style="padding:12px 8px;border-bottom:1px solid #eef2f7">${workHoursCell}</td>
        <td style="padding:12px 8px;border-bottom:1px solid #eef2f7">${status}</td>
      `;
      els.attendanceBody.appendChild(tr);
      // remove button intentionally omitted from attendance rows per request
    });

    // update pagination indicator for weeks
    const indicator = document.getElementById('attendancePageIndicator');
    const prevBtn = document.getElementById('attendancePrev');
    const nextBtn = document.getElementById('attendanceNext');
    if(indicator) indicator.textContent = `${attendanceCurrentPage} / ${totalWeeks}`;
    if(prevBtn) prevBtn.disabled = attendanceCurrentPage <= 1;
    if(nextBtn) nextBtn.disabled = attendanceCurrentPage >= totalWeeks;
  }

  // Render the Time Clock admin view (list employees with Time In / Time Out buttons)
  function renderTimeClock(){
    const container = document.getElementById('timeclockContainer') || els.timeClockContainer;
    if(!container) return;
    if(!employees || employees.length === 0){
      container.innerHTML = '<p class="muted">No employees available.</p>';
      return;
    }
    const today = adminFormatDate(new Date());
    let html = '<table style="width:100%;border-collapse:collapse"><thead><tr><th style="padding:10px;border-bottom:1px solid #eef2f7">ID</th><th style="padding:10px;border-bottom:1px solid #eef2f7">Name</th><th style="padding:10px;border-bottom:1px solid #eef2f7">Role</th><th style="padding:10px;border-bottom:1px solid #eef2f7;text-align:center">Actions</th></tr></thead><tbody>';
    employees.forEach(emp => {
      const id = emp.id || '';
      const name = emp.name || '';
      const role = emp.role || '';
      // Check if employee has timed in/out today
      const todaysRec = attendance.find(r => String(r.id) === String(id) && r.date === today);
      const hasTimeIn = !!(todaysRec && (todaysRec.timeInISO || todaysRec.timeIn));
      const hasTimeOut = !!(todaysRec && (todaysRec.timeOutISO || todaysRec.timeOut));
      const timeInBtnStyle = hasTimeIn ? 'background-color:#ccc;color:#666;cursor:not-allowed;opacity:0.6;' : '';
      const timeOutBtnStyle = (hasTimeOut || !hasTimeIn) ? 'background-color:#ccc;color:#666;cursor:not-allowed;opacity:0.6;' : '';
      const timeInDisabled = hasTimeIn ? 'disabled' : '';
      const timeOutDisabled = (hasTimeOut || !hasTimeIn) ? 'disabled' : '';
      html += `<tr><td style="padding:10px;border-bottom:1px solid #eef2f7">${id}</td><td style="padding:10px;border-bottom:1px solid #eef2f7">${name}</td><td style="padding:10px;border-bottom:1px solid #eef2f7">${role}</td><td style="padding:10px;border-bottom:1px solid #eef2f7;text-align:center"><button class="time-in" data-id="${id}" data-name="${(name||'').replace(/"/g,'&quot;')}" data-role="${(role||'').replace(/"/g,'&quot;')}" style="${timeInBtnStyle}" ${timeInDisabled}>Time In</button> <button class="time-out" data-id="${id}" data-name="${(name||'').replace(/"/g,'&quot;')}" data-role="${(role||'').replace(/"/g,'&quot;')}" style="${timeOutBtnStyle}" ${timeOutDisabled}>Time Out</button></td></tr>`;
    });
    html += '</tbody></table>';
    container.innerHTML = html;
    // wire clicks in the container to the existing admin handlers
    container.querySelectorAll('.time-in').forEach(b=>{ b.addEventListener('click', ()=>{ adminMarkTimeIn(b.dataset.id, b.dataset.name, b.dataset.role); }); });
    container.querySelectorAll('.time-out').forEach(b=>{ b.addEventListener('click', ()=>{ adminMarkTimeOut(b.dataset.id, b.dataset.name, b.dataset.role); }); });
  }

  function removeAttendanceRecord(idx){
    if(confirm('Are you sure you want to remove this attendance record?')){
      attendance.splice(idx, 1);
      saveAttendanceToStorage();
      renderAttendance();
    }
  }

  // ---------- Leave Management (admin) ----------
  let allLeaves = []; // aggregated across employees
  function loadAllLeaves(){
    allLeaves = [];
    // ensure employees are loaded
    loadEmployeesFromStorage();
    employees.forEach(emp => {
      try{
        const key = 'employee_requests_' + emp.id;
        const list = JSON.parse(localStorage.getItem(key) || '[]');
        if(Array.isArray(list)){
          list.forEach(r => {
            // attach owner info
            allLeaves.push(Object.assign({}, r, { ownerId: emp.id, ownerName: emp.name }));
          });
        }
      }catch(e){ /* ignore */ }
    });
  }

  // Approve / Reject handlers — update the original employee's storage and re-load
  function updateLeaveStatus(ownerId, requestId, newStatus, adminMessage){
    const key = 'employee_requests_' + ownerId;
    try{
      const list = JSON.parse(localStorage.getItem(key) || '[]');
      const idx = list.findIndex(r=> r.id === requestId);
      if(idx === -1) return false;
      // Prevent changing status if already processed
      const current = list[idx].status || 'Pending';
      if(current === newStatus){
        alert('This request is already ' + newStatus + '.');
        return false;
      }
      if(current === 'Approved' || current === 'Rejected'){
        alert('This request has already been ' + current + '. It cannot be changed.');
        return false;
      }

      list[idx].status = newStatus;
      if(adminMessage){ try{ list[idx].adminComment = String(adminMessage).trim(); }catch(e){} }
      // persist a processedAt timestamp so it's clear when the decision was made
      try{ list[idx].processedAt = new Date().toISOString(); }catch(e){}
      localStorage.setItem(key, JSON.stringify(list));
      // Reload aggregated copy and re-render
      loadAllLeaves(); renderLeaveRequests(); try{ updatePendingLeaveCount(); }catch(e){}
      return true;
    }catch(e){ return false; }
  }

  // Helper exposed for buttons
  // Approve handler remains simple confirmation
  window.adminApproveLeave = function(ownerId, requestId){ if(confirm('Approve this request?')) updateLeaveStatus(ownerId, requestId, 'Approved'); };

  // Reject: open a small modal allowing admin to add a rejection reason (optional)
  let _pendingRejectOwner = null, _pendingRejectRequestId = null;
  window.adminRejectLeave = function(ownerId, requestId){
    try{
      _pendingRejectOwner = ownerId; _pendingRejectRequestId = requestId;
      const modal = document.getElementById('leaveRejectModal');
      const ta = document.getElementById('leaveRejectReason');
      if(ta) ta.value = '';
      if(modal){ modal.style.display = 'flex'; modal.setAttribute('aria-hidden','false'); }
    }catch(e){
      // fallback to confirmation dialog if modal not present
      if(confirm('Reject this request?')) updateLeaveStatus(ownerId, requestId, 'Rejected');
    }
  };

  // Render leaves table with pagination & search
  let leavesPageSize = 10, leavesCurrentPage = 1, leavesSearchQuery = '';
  function getFilteredLeaves(){
    const q = (leavesSearchQuery || '').trim().toLowerCase();
    if(!q) return allLeaves;
    return allLeaves.filter(r => (
      String(r.message||'').toLowerCase().includes(q)
      || String(r.type||'').toLowerCase().includes(q)
      || String(r.ownerId||'').toLowerCase().includes(q)
      || String(r.ownerName||'').toLowerCase().includes(q)
      || String(r.from||'').toLowerCase().includes(q)
      || String(r.to||'').toLowerCase().includes(q)
    ));
  }

  function renderLeaveRequests(){
    const tbody = document.querySelector('#leavesTable tbody');
    const summaryEl = document.getElementById('leavesSummary');
    const paginationEl = document.getElementById('leavesPagination');
    if(!tbody) return;
    // read controls
    const pageSizeSelect = document.getElementById('leavesPageSize');
    const searchInput = document.getElementById('leavesSearch');
    if(pageSizeSelect) leavesPageSize = Number(pageSizeSelect.value) || 10;
    if(searchInput) leavesSearchQuery = searchInput.value || '';

    let filtered = getFilteredLeaves();
    // If attendance weeks are available, filter leaves to the selected week (by default newest)
    try{
      if(attendanceWeeks && attendanceWeeks.length){
        const idx = Math.min(Math.max(0, leavesWeekIndex || 0), attendanceWeeks.length - 1);
        const wk = attendanceWeeks[idx];
        if(wk && wk.weekStart){
          const weekStartDate = new Date(wk.weekStart + 'T00:00:00');
          const weekEndDate = new Date(weekStartDate.getTime() + 6 * 24 * 3600 * 1000);
          filtered = filtered.filter(r => {
            try{
              const s = r.from ? new Date(String(r.from).trim() + 'T00:00:00') : null;
              const e = r.to ? new Date(String(r.to).trim() + 'T00:00:00') : s;
              if(!s || isNaN(s.getTime())) return false;
              if(!e || isNaN(e.getTime())) return false;
              return !(e.getTime() < weekStartDate.getTime() || s.getTime() > weekEndDate.getTime());
            }catch(err){ return false; }
          });
        }
      }
    }catch(e){ /* ignore */ }
    const total = filtered.length;
    const pages = Math.max(1, Math.ceil(total / leavesPageSize));
    leavesCurrentPage = Math.min(Math.max(1, leavesCurrentPage), pages);
    const start = (leavesCurrentPage - 1) * leavesPageSize;
    const pageItems = filtered.slice(start, start + leavesPageSize);

    tbody.innerHTML = '';
    // helper to format leave date ranges into 'Mon DD to DD' or 'Mon DD to Mon DD' format
    function formatLeaveRange(fromStr, toStr){
      if(!fromStr) return '';
      try{
        const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        const f = new Date(String(fromStr).trim() + 'T00:00:00');
        const t = toStr ? new Date(String(toStr).trim() + 'T00:00:00') : f;
        if(isNaN(f.getTime())) return '';
        if(isNaN(t.getTime())) return `${months[f.getMonth()]} ${f.getDate()}`;
        // same day
        if(f.getFullYear() === t.getFullYear() && f.getMonth() === t.getMonth() && f.getDate() === t.getDate()){
          return `${months[f.getMonth()]} ${f.getDate()}`;
        }
        // same month
        if(f.getFullYear() === t.getFullYear() && f.getMonth() === t.getMonth()){
          return `${months[f.getMonth()]} ${f.getDate()} to ${t.getDate()}`;
        }
        // different months (or years) show both months
        return `${months[f.getMonth()]} ${f.getDate()} to ${months[t.getMonth()]} ${t.getDate()}`;
      }catch(e){ return (fromStr || '') + (toStr?(' to '+toStr):''); }
    }

    // small helper to escape HTML in content we are injecting
    const _escape = (s) => String(s||'').replace(/[&\"'<>]/g, function(c){ return {'&':'&amp;','"':'&quot;','\'':'&#39;','<':'&lt;','>':'&gt;'}[c]; });

    pageItems.forEach((r,i)=>{
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="padding:10px;border-bottom:1px solid #eef2f7">${start + i + 1}</td>
        <td style="padding:10px;border-bottom:1px solid #eef2f7">${r.ownerName || ''} <div class="muted">${r.ownerId || ''}</div></td>
        <td style="padding:10px;border-bottom:1px solid #eef2f7">${formatLeaveRange(r.from, r.to)}</td>
        <td style="padding:10px;border-bottom:1px solid #eef2f7;max-width:420px;white-space:normal;word-break:break-word">${_escape(r.message || '')}${r.adminComment ? `<div class="muted" style="margin-top:6px;font-style:italic;color:#6b7280">Admin reply: ${_escape(r.adminComment)}</div>`: ''}</td>
        <td style="padding:10px;border-bottom:1px solid #eef2f7">${r.type || ''}</td>
        <td style="padding:10px;border-bottom:1px solid #eef2f7"><span style="display:inline-block;padding:6px 10px;border-radius:12px;background:${r.status==='Approved'? '#10b981': (r.status==='Rejected'? '#ef4444':'#f59e0b')};color:#fff;font-size:12px">${r.status || 'Pending'}</span></td>
        <td style="padding:10px;border-bottom:1px solid #eef2f7">
          ${ (r.status && r.status !== 'Pending')
              ? `<button disabled title="Already processed" style="background:#10b981;color:#fff;border:none;padding:6px 8px;border-radius:4px;cursor:default;font-size:12px;margin-right:6px;opacity:0.6">✔</button><button disabled title="Already processed" style="background:#ef4444;color:#fff;border:none;padding:6px 8px;border-radius:4px;cursor:default;font-size:12px;opacity:0.6">✖</button>`
              : `<button style="background:#10b981;color:#fff;border:none;padding:6px 8px;border-radius:4px;cursor:pointer;font-size:12px;margin-right:6px" onclick="adminApproveLeave('${r.ownerId}','${r.id}')">✔</button><button style="background:#ef4444;color:#fff;border:none;padding:6px 8px;border-radius:4px;cursor:pointer;font-size:12px" onclick="adminRejectLeave('${r.ownerId}','${r.id}')">✖</button>` }
        </td>
      `;
      tbody.appendChild(tr);
    });

    // summary
    const showingFrom = total === 0 ? 0 : start + 1;
    const showingTo = Math.min(total, start + pageItems.length);
    if(summaryEl) summaryEl.textContent = `Showing ${showingFrom} to ${showingTo} of ${total} entries`;

    // pagination
    if(paginationEl){
      paginationEl.innerHTML = '';
      const btn = (label, disabled, onClick)=>{ const b=document.createElement('button'); b.textContent=label; b.disabled=!!disabled; b.style.margin='0 4px'; b.style.padding='6px 10px'; b.addEventListener('click', onClick); return b; };
      paginationEl.appendChild(btn('Previous', leavesCurrentPage<=1, ()=>{ leavesCurrentPage--; renderLeaveRequests(); }));
      const maxShow = 5; const half = Math.floor(maxShow/2);
      let startPage = Math.max(1, leavesCurrentPage - half);
      let endPage = Math.min(pages, startPage + maxShow -1);
      if(endPage - startPage +1 < maxShow) startPage = Math.max(1, endPage - maxShow +1);
      for(let p=startPage;p<=endPage;p++){
        const b = btn(p, false, ()=>{ leavesCurrentPage = p; renderLeaveRequests(); });
        if(p === leavesCurrentPage){ b.style.background='#ef4444'; b.style.color='#fff'; }
        paginationEl.appendChild(b);
      }
      paginationEl.appendChild(btn('Next', leavesCurrentPage>=pages, ()=>{ leavesCurrentPage++; renderLeaveRequests(); }));
    }

    if(pageSizeSelect) pageSizeSelect.onchange = ()=>{ leavesCurrentPage = 1; renderLeaveRequests(); };
    if(searchInput) searchInput.oninput = ()=>{ leavesSearchQuery = searchInput.value; leavesCurrentPage = 1; renderLeaveRequests(); };

    // update week label (if present)
    const labelEl = document.getElementById('leavesWeekLabel');
    if(labelEl){
      if(attendanceWeeks && attendanceWeeks.length){
        const idx = Math.min(Math.max(0, leavesWeekIndex || 0), attendanceWeeks.length - 1);
        const wk = attendanceWeeks[idx]; labelEl.textContent = wk && wk.weekStart ? formatWeekLabelFromStart(wk.weekStart) : '—';
      }else{
        labelEl.textContent = 'All dates';
      }
    }
  }

  // load and render on startup

  loadEmployeesFromStorage();
  loadArchiveFromStorage();
  loadAttendanceFromStorage();
  try{ renderAttendanceChart(attendanceChartWeekIndex); }catch(e){}
  try{ renderPayslipStatusSide(sideWeekIndex); }catch(e){}
  // init pending payslips counter
  try{ updatePendingPayslipCount(); }catch(e){}
  // load leave requests from employee storage and render
  loadAllLeaves();
  render(employees);
  renderArchive();
  renderAttendance();
  renderLeaveRequests();
  try{ updatePendingLeaveCount(); }catch(e){}
  updateHomeStats();
  try{ renderTimeClock(); }catch(e){}
  switchSection('home');

  // react to storage changes in other tabs/windows (attendance updates)
  window.addEventListener('storage', (e)=>{
    if(e.key === 'payroll_attendance'){
      loadAttendanceFromStorage();
      // If admin is not filtering the current week, jump to the newest page so manager sees latest entries automatically
      let shouldAutoJump = false;
      try{
        let currentWeekKey = null;
        if(attendanceWeeks && attendanceWeeks.length){
          const wkIndex = Math.min(Math.max(0, attendanceCurrentPage - 1), attendanceWeeks.length - 1);
          const wk = attendanceWeeks[wkIndex];
          currentWeekKey = wk ? (wk.weekStart || ('week_' + wkIndex)) : null;
        }
        const activeQuery = (currentWeekKey && attendanceSearchByWeek[currentWeekKey]) ? attendanceSearchByWeek[currentWeekKey] : attendanceSearchQuery;
        shouldAutoJump = !activeQuery;
      }catch(err){ shouldAutoJump = !attendanceSearchQuery; }
      if(shouldAutoJump && document.getElementById('attendance') && document.getElementById('attendance').classList.contains('active')){
        attendanceCurrentPage = Math.max(1, Math.ceil(attendance.length / attendancePageSize));
      }
      renderAttendance();
      try{ renderAttendanceChart(attendanceChartWeekIndex); }catch(e){}
    }
    // If admin list changed in another tab (for example registration added an employee), refresh
    if(e.key === 'payroll_employees'){
      try{ loadEmployeesFromStorage(); renderFiltered(); renderArchive(); updateHomeStats(); }catch(err){}
    }
    // If payslips changed in another tab, update pending counter and UI
    if(e.key && String(e.key).indexOf('employee_payslips_') === 0){
      try{ renderSalarySlips(); updatePendingPayslipCount(); try{ renderPayslipStatusSide(sideWeekIndex); }catch(e){} }catch(err){}
    }
    // If leave requests changed in another tab, refresh aggregated leave list and pending count
    if(e.key && String(e.key).indexOf('employee_requests_') === 0){
      try{ loadAllLeaves(); renderLeaveRequests(); updatePendingLeaveCount(); }catch(err){}
    }
  });

  // Also reload attendance when the admin tab gains focus (fallback for some browsers)
  window.addEventListener('focus', () => { loadAttendanceFromStorage(); renderAttendance(); });

  // Polling fallback: check every 3 seconds for changes to payroll_attendance
  let _lastAttendanceJSON = localStorage.getItem('payroll_attendance');
  setInterval(() => {
    try{
      const cur = localStorage.getItem('payroll_attendance');
      if(cur !== _lastAttendanceJSON){
        _lastAttendanceJSON = cur;
        loadAttendanceFromStorage();
        // auto-jump to latest page only when not filtering the current week
        let shouldAutoJump = false;
        try{
          let currentWeekKey = null;
          if(attendanceWeeks && attendanceWeeks.length){
            const wkIndex = Math.min(Math.max(0, attendanceCurrentPage - 1), attendanceWeeks.length - 1);
            const wk = attendanceWeeks[wkIndex];
            currentWeekKey = wk ? (wk.weekStart || ('week_' + wkIndex)) : null;
          }
          const activeQuery = (currentWeekKey && attendanceSearchByWeek[currentWeekKey]) ? attendanceSearchByWeek[currentWeekKey] : attendanceSearchQuery;
          shouldAutoJump = !activeQuery;
        }catch(err){ shouldAutoJump = !attendanceSearchQuery; }
        if(shouldAutoJump && document.getElementById('attendance') && document.getElementById('attendance').classList.contains('active')){
          attendanceCurrentPage = Math.max(1, Math.ceil(attendance.length / attendancePageSize));
        }
        renderAttendance();
        try{ renderAttendanceChart(attendanceChartWeekIndex); }catch(e){}
      }
    }catch(e){ /* ignore */ }
  }, 3000);

  // Poll for pending payslips changes every 2 seconds (keeps dashboard fresh in same-tab changes)
  let _lastPendingCount = null;
  let _lastPendingLeaveCount = null;
  setInterval(()=>{
    try{
      const curr = computePendingPayslipCount();
      if(_lastPendingCount !== curr){ _lastPendingCount = curr; updatePendingPayslipCount(); }
      // also poll for pending leaves
      try{
        const lcurr = computePendingLeaveCount();
        if(_lastPendingLeaveCount !== lcurr){ _lastPendingLeaveCount = lcurr; updatePendingLeaveCount(); }
      }catch(e){}
    }catch(e){}
  }, 2000);

  // Wire attendance pagination buttons
  const attPrev = document.getElementById('attendancePrev');
  const attNext = document.getElementById('attendanceNext');
  if(attPrev) attPrev.addEventListener('click', ()=>{ attendanceCurrentPage = Math.max(1, attendanceCurrentPage - 1); renderAttendance(); });
  if(attNext) attNext.addEventListener('click', ()=>{ attendanceCurrentPage = attendanceCurrentPage + 1; renderAttendance(); });

  // Wire attendance chart prev/next and print buttons
  const chartPrevBtn = document.getElementById('chartPrevWeek');
  const chartNextBtn = document.getElementById('chartNextWeek');
  const chartPrintBtn = document.getElementById('printAttendanceReport');
  const chartDownloadBtn = document.getElementById('downloadAttendanceReport');
  if(chartPrevBtn) chartPrevBtn.addEventListener('click', ()=> changeAttendanceChartWeek(-1));
  if(chartNextBtn) chartNextBtn.addEventListener('click', ()=> changeAttendanceChartWeek(1));
  const sidePrevBtn = document.getElementById('sideWeekPrev');
  const sideNextBtn = document.getElementById('sideWeekNext');
  if(sidePrevBtn) sidePrevBtn.addEventListener('click', ()=>{ if(!attendanceWeeks || attendanceWeeks.length===0) return; sideWeekIndex = Math.min(Math.max(0, sideWeekIndex - 1), attendanceWeeks.length - 1); renderPayslipStatusSide(sideWeekIndex); });
  if(sideNextBtn) sideNextBtn.addEventListener('click', ()=>{ if(!attendanceWeeks || attendanceWeeks.length===0) return; sideWeekIndex = Math.min(Math.max(0, sideWeekIndex + 1), attendanceWeeks.length - 1); renderPayslipStatusSide(sideWeekIndex); });
  const printSideBtn = document.getElementById('printSidePayslip');
  const downloadSideBtn = document.getElementById('downloadSidePayslip');
  if(printSideBtn) printSideBtn.addEventListener('click', ()=> printSidePayslipStatusForWeek(sideWeekIndex));
  if(downloadSideBtn) downloadSideBtn.addEventListener('click', ()=> downloadSidePayslipCSV(sideWeekIndex));
  if(chartPrintBtn) chartPrintBtn.addEventListener('click', ()=> printAttendanceReportForWeek(attendanceChartWeekIndex));

  // Reject modal handlers (admin leave rejection with comment)
  try{
    const rejectModal = document.getElementById('leaveRejectModal');
    const rejectCancel = document.getElementById('leaveRejectCancel');
    const rejectConfirm = document.getElementById('leaveRejectConfirm');
    if(rejectCancel) rejectCancel.addEventListener('click', (e)=>{ e.preventDefault(); if(rejectModal){ rejectModal.style.display='none'; rejectModal.setAttribute('aria-hidden','true'); } _pendingRejectOwner = null; _pendingRejectRequestId = null; });
    if(rejectConfirm) rejectConfirm.addEventListener('click', (e)=>{ e.preventDefault(); if(!_pendingRejectOwner || !_pendingRejectRequestId){ alert('No request selected'); if(rejectModal){ rejectModal.style.display='none'; rejectModal.setAttribute('aria-hidden','true'); } return; } const ta = document.getElementById('leaveRejectReason'); const msg = ta ? (ta.value || '').trim() : ''; updateLeaveStatus(_pendingRejectOwner, _pendingRejectRequestId, 'Rejected', msg); if(rejectModal){ rejectModal.style.display='none'; rejectModal.setAttribute('aria-hidden','true'); } _pendingRejectOwner = null; _pendingRejectRequestId = null; });
    // click backdrop to close
    if(rejectModal) rejectModal.addEventListener('click', (e)=>{ if(e.target && e.target.id === 'leaveRejectModal'){ rejectModal.style.display='none'; rejectModal.setAttribute('aria-hidden','true'); _pendingRejectOwner = null; _pendingRejectRequestId = null; } });
  }catch(e){ /* ignore */ }
  if(chartDownloadBtn) chartDownloadBtn.addEventListener('click', ()=> downloadAttendanceReportForWeek(attendanceChartWeekIndex));

  // Leave panel week prev/next
  const leavesPrevBtn = document.getElementById('leavesPrevWeek');
  const leavesNextBtn = document.getElementById('leavesNextWeek');
  if(leavesPrevBtn) leavesPrevBtn.addEventListener('click', ()=>{ if(!attendanceWeeks || attendanceWeeks.length===0) return; leavesWeekIndex = Math.min(Math.max(0, leavesWeekIndex - 1), attendanceWeeks.length - 1); renderLeaveRequests(); });
  if(leavesNextBtn) leavesNextBtn.addEventListener('click', ()=>{ if(!attendanceWeeks || attendanceWeeks.length===0) return; leavesWeekIndex = Math.min(Math.max(0, leavesWeekIndex + 1), attendanceWeeks.length - 1); renderLeaveRequests(); });

  // Expose removeAttendanceRecord to global scope
  window.removeAttendanceRecord = removeAttendanceRecord;

  // Expose helper functions for debugging/tests in the browser console
  try{ window.__attendanceHelpers = {
    computeNetMinutesBetween: computeNetMinutesBetween,
    calculateHoursForEmployeeInWeek: calculateHoursForEmployeeInWeek,
    computeWorkedMinutesForEmployeeInWeek: computeWorkedMinutesForEmployeeInWeek
  }; }catch(e){ /* ignore when blocked by CSP */ }

  // Midnight poller: every 20 seconds, check if the date has changed and re-render Time Clock
  // This ensures buttons reset when the clock strikes midnight
  let lastDateString = adminFormatDate(new Date());
  setInterval(function() {
    const currentDateString = adminFormatDate(new Date());
    if(currentDateString !== lastDateString) {
      console.log('[Midnight Poll] Date changed from ' + lastDateString + ' to ' + currentDateString + ', refreshing Time Clock buttons');
      lastDateString = currentDateString;
      try { renderTimeClock(); } catch(e) { console.error('Error refreshing Time Clock:', e); }
    }
  }, 20000); // Poll every 20 seconds
})();
