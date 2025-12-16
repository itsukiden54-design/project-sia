(async function(){
  // Load logged-in employee ID from localStorage
  const currentEmployeeId = localStorage.getItem('currentEmployeeId');
  let currentEmployeeName = localStorage.getItem('currentEmployeeName');

  if(!currentEmployeeId){
    alert('No employee logged in. Redirecting to login...');
    window.location.href = 'login.html';
    return;
  }

  // Load employee credentials to get current employee info (local fallback)
  const empCredentials = JSON.parse(localStorage.getItem('payroll_credentials') || '{}');
  let currentCred = empCredentials[currentEmployeeId];

  // If credential not found locally, try to resolve from Firestore (if available)
  if(!currentCred && window.firebase && firebase.firestore){
    try{
      const doc = await firebase.firestore().collection('employees').doc(currentEmployeeId).get();
      if(doc.exists){
        const data = doc.data() || {};
        currentCred = {
          email: data.email || '',
          username: data.username || data.email || '',
          fullname: data.fullname || data.name || data.username || data.email || currentEmployeeId,
          // password is intentionally left empty for security — local fallback won't use it for Firebase users
          password: ''
        };
        // Optionally store minimal profile locally to keep compatibility with existing code paths
        try{
          empCredentials[currentEmployeeId] = Object.assign({}, currentCred, { employeeId: currentEmployeeId });
          localStorage.setItem('payroll_credentials', JSON.stringify(empCredentials));
        }catch(e){}
        // Ensure currentEmployeeName is set
        if(!currentEmployeeName) currentEmployeeName = currentCred.fullname || currentCred.username || currentCred.email;
      }
    }catch(e){
      console.warn('Failed to fetch employee profile from Firestore:', e && e.message);
    }
  }

  if(!currentCred){
    alert('Employee not found. Redirecting to login...');
    window.location.href = 'login.html';
    return;
  }

  // Load admin employees list to get salary and deductions
  const adminEmployees = JSON.parse(localStorage.getItem('payroll_employees') || '[]');
  const empFromAdmin = adminEmployees.find(e => e.id === currentEmployeeId);

  // Create employee object - use admin data if available, fallback to defaults
  let currentEmployee = {
    id: currentEmployeeId,
    name: currentCred.fullname,
    role: empFromAdmin ? empFromAdmin.role : 'Employee',
    salary: empFromAdmin ? empFromAdmin.salary : 52000,
    deductions: empFromAdmin ? empFromAdmin.deductions : { sss: 300, philhealth: 250, pagibig: 200 },
    lastNet: empFromAdmin ? empFromAdmin.lastNet : '—',
    lateHours: empFromAdmin ? (empFromAdmin.lateHours || 0) : 0,
    lateMinutes: empFromAdmin ? (empFromAdmin.lateMinutes || 0) : 0
  };

  // Attendance records (loaded from localStorage)
  let attendanceRecords = [];
  function loadAttendanceFromStorage(){
    try{ attendanceRecords = JSON.parse(localStorage.getItem('payroll_attendance') || '[]'); }
    catch(e){ attendanceRecords = []; }
  }
  function saveAttendanceToStorage(){
    localStorage.setItem('payroll_attendance', JSON.stringify(attendanceRecords));
  }

  // generate weekly payslips dynamically based on salary and deductions
  function makePayslipsFor(emp){
    const weeklyGross = Math.round(emp.salary/52);
    const taxRate = 0.12;
    const tax = Math.round(weeklyGross * taxRate);
    const dedSum = (emp.deductions ? Number(emp.deductions.sss||0)+Number(emp.deductions.philhealth||0)+Number(emp.deductions.pagibig||0) : 0);
    const net = emp.lastNet && emp.lastNet !== '—' ? emp.lastNet : Math.max(0, Math.round(weeklyGross - tax - dedSum));
    // create three recent payslips (dates are placeholders)
    return [
      {date:'2025-11-01', gross:weeklyGross, net, taxes:tax, deductions:dedSum},
      {date:'2025-10-25', gross:weeklyGross, net, taxes:tax, deductions:dedSum},
      {date:'2025-10-18', gross:weeklyGross, net, taxes:tax, deductions:dedSum}
    ];
  }
  
  // Load payslips saved per-employee; fall back to generated sample payslips
  let payslips = [];
  function loadPayslipsFromStorage(){
    try{
      const stored = JSON.parse(localStorage.getItem('employee_payslips_' + currentEmployee.id) || 'null');
      if(Array.isArray(stored) && stored.length) payslips = stored;
      else payslips = makePayslipsFor(currentEmployee);
    }catch(e){ payslips = makePayslipsFor(currentEmployee); }
  }
  function savePayslipsToStorage(){
    localStorage.setItem('employee_payslips_' + currentEmployee.id, JSON.stringify(payslips));
  }
  loadPayslipsFromStorage();
  let requests = [];

  // Month-based pagination for payslips - based on employee's start date from attendance records
  function getEmployeeStartDate() {
    loadAttendanceFromStorage();
    const employeeRecords = attendanceRecords.filter(r => String(r.id) === String(currentEmployee.id));
    if (employeeRecords.length === 0) {
      // If no attendance records, use current date
      return new Date();
    }
    // Find the earliest attendance date
    let earliestDate = null;
    employeeRecords.forEach(r => {
      let recordDate = null;
      if (r.date) {
        recordDate = new Date(r.date + 'T00:00:00');
      } else if (r.timeInISO) {
        recordDate = new Date(r.timeInISO);
      } else if (r.timeOutISO) {
        recordDate = new Date(r.timeOutISO);
      }
      if (recordDate && !isNaN(recordDate.getTime())) {
        if (!earliestDate || recordDate.getTime() < earliestDate.getTime()) {
          earliestDate = recordDate;
        }
      }
    });
    return earliestDate || new Date();
  }

  const startDate = getEmployeeStartDate();
  let currentPayslipMonth = new Date().getMonth();
  let currentPayslipYear = new Date().getFullYear();
  
  // Set initial month to current month, but ensure we can navigate back to start date
  const startMonth = startDate.getMonth();
  const startYear = startDate.getFullYear();

  // Requests persistence per-employee
  function loadRequestsFromStorage(){
    try{ requests = JSON.parse(localStorage.getItem('employee_requests_' + currentEmployee.id) || '[]'); }
    catch(e){ requests = []; }
  }
  function saveRequestsToStorage(){
    localStorage.setItem('employee_requests_' + currentEmployee.id, JSON.stringify(requests));
  }

  const els = {
    empName: document.getElementById('empName'),
    empRole: document.getElementById('empRole'),
    empId: document.getElementById('empId'),
    empStatus: document.getElementById('empStatus'),
    empAttendanceId: document.getElementById('empAttendanceId'),
    empSalary: document.getElementById('empSalary'),
    empUsername: document.getElementById('empUsername'),
    sidebarAvatar: document.querySelector('.admin-avatar'),
    profileAvatar: document.querySelector('[style*="width:72px"]'),
    timeInBtn: document.getElementById('timeInBtn'),
    timeOutBtn: document.getElementById('timeOutBtn'),
    payslipTbody: document.querySelector('#payslipTable tbody'),
    payslipModal: document.getElementById('payslipModal'),
    payslipContent: document.getElementById('payslipContent'),
    closePayslip: document.getElementById('closePayslip'),
    downloadPayslipBtn: document.getElementById('downloadPayslipBtn'),
    downloadLatest: document.getElementById('downloadLatest'),
    downloadAll: document.getElementById('downloadAll'),
    requestTimeOff: document.getElementById('requestTimeOff'),
    requestModal: document.getElementById('requestModal'),
    requestForm: document.getElementById('requestForm'),
    cancelRequest: document.getElementById('cancelRequest'),
    requestsList: document.getElementById('requestsList')
  };

  function getFirstNameInitial(fullName){
    const firstName = fullName.split(' ')[0];
    return firstName.charAt(0).toUpperCase();
  }

  function getTodayDate(){
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
  }

  function getTomorrowDate(){
    const d = new Date();
    d.setDate(d.getDate() + 1);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
  }

  // Format a Date object to local YYYY-MM-DD (avoids UTC off-by-one issues)
  function formatDateYYYYMMDD(d){
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
  }

  function formatTime(d){
    // return 12-hour format like '1:02 pm' (no seconds)
    let h = d.getHours();
    const m = String(d.getMinutes()).padStart(2,'0');
    const ampm = h >= 12 ? 'pm' : 'am';
    h = h % 12; if(h === 0) h = 12;
    return `${h}:${m} ${ampm}`;
  }

  // helper: compute net minutes between two datetimes excluding unpaid lunch 12:00-13:00
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

  function updateLocalStatusDisplay(){
    // only consider today's record for current status
    const today = getTodayDate();
    const rec = attendanceRecords.find(r => r.id === currentEmployee.id && r.date === today);
    const statusText = rec ? (rec.status || (rec.timeOut ? 'Offline' : (rec.timeIn ? 'Online' : 'Offline'))) : 'Offline';
    if(els.empStatus) els.empStatus.textContent = 'Status: ' + statusText;
    // also update timeIn/timeOut button disabled state
    if(els.timeInBtn) els.timeInBtn.disabled = !!(rec && rec.timeIn && rec.status === 'Online');
    if(els.timeOutBtn) els.timeOutBtn.disabled = !!(rec && (!rec.timeIn || rec.status === 'Offline'));
    // set color / badge and update status dot color
    if(els.empStatus){
      els.empStatus.style.color = statusText === 'Online' ? '#059669' : '#6b7280';
      // Toggle the status dot class
      const statusDot = els.empStatus.previousElementSibling;
      if(statusDot && statusDot.classList.contains('status-dot')){
        if(statusText === 'Online'){
          statusDot.classList.remove('offline');
          statusDot.classList.add('online');
        } else {
          statusDot.classList.remove('online');
          statusDot.classList.add('offline');
        }
      }
    }
    // show attendance id if present
    if(els.empAttendanceId){
      els.empAttendanceId.textContent = rec && rec.attendanceId ? 'Attendance ID: ' + rec.attendanceId : '';
    }
  }

  function markTimeIn(){
    const now = new Date();
    const date = formatDateYYYYMMDD(now);
    let rec = attendanceRecords.find(r=> r.id===currentEmployee.id && r.date===date);
    if(!rec){
      rec = { id: currentEmployee.id, name: currentEmployee.name, date: date, timeIn: formatTime(now), timeInISO: now.toISOString(), timeOut: '', timeOutISO: '', status: 'Online', attendanceId: currentEmployee.id + '_' + date + '_' + Date.now() };
      // calculate per-record late minutes (08:00 start + 10-minute grace)
      try{
        const minutes = now.getHours() * 60 + now.getMinutes();
        const scheduled = 8 * 60; // 08:00
        const grace = 10; // 10 minutes
        rec.lateMinutes = (minutes > (scheduled + grace)) ? Math.max(0, minutes - scheduled) : 0;
      }catch(e){ rec.lateMinutes = 0; }
      attendanceRecords.push(rec);
    } else {
      rec.timeIn = formatTime(now);
      rec.timeInISO = now.toISOString();
      // ensure the record date is taken from the actual timestamp
      rec.date = formatDateYYYYMMDD(new Date(rec.timeInISO));
      rec.status = 'Online';
      if(!rec.attendanceId) rec.attendanceId = currentEmployee.id + '_' + date + '_' + Date.now();
      try{
        // recompute lateMinutes if timeIn updated
        const inDt = new Date(rec.timeInISO);
        const minutes = inDt.getHours() * 60 + inDt.getMinutes();
        const scheduled = 8 * 60; const grace = 10;
        rec.lateMinutes = (minutes > (scheduled + grace)) ? Math.max(0, minutes - scheduled) : 0;
      }catch(e){ rec.lateMinutes = rec.lateMinutes || 0; }
    }
    saveAttendanceToStorage();
    updateLocalStatusDisplay();
    alert('Time In recorded: '+rec.timeIn);
    // update button states
    updateLocalStatusDisplay();
  }

  function markTimeOut(){
    const now = new Date();
    const date = formatDateYYYYMMDD(now);
    let rec = attendanceRecords.find(r=> r.id===currentEmployee.id && r.date===date);
    if(!rec){
      // if no time-in existed, create a record with empty timeIn and timeOut now (store ISO too)
      rec = { id: currentEmployee.id, name: currentEmployee.name, date: date, timeIn: '', timeInISO: '', timeOut: formatTime(now), timeOutISO: now.toISOString(), status: 'Offline', attendanceId: currentEmployee.id + '_' + date + '_' + Date.now() };
      attendanceRecords.push(rec);
    } else {
      rec.timeOut = formatTime(now);
      rec.timeOutISO = now.toISOString();
      // ensure the record date is taken from the actual timestamp
      rec.date = formatDateYYYYMMDD(new Date(rec.timeOutISO));
      rec.status = 'Offline';
      if(!rec.attendanceId) rec.attendanceId = currentEmployee.id + '_' + date + '_' + Date.now();
      // compute net minutes and payable minutes & hours for this record (best-effort)
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
      }catch(e){/* ignore */}
    }
    saveAttendanceToStorage();
    updateLocalStatusDisplay();
    alert('Time Out recorded: '+rec.timeOut);
  }

  function renderProfile(){
    els.empName.textContent = currentEmployee.name;
    els.empRole.textContent = currentEmployee.role;
    els.empId.textContent = currentEmployee.id;
    // show weekly salary (stored salary is annual)
    const weekly = Math.round(currentEmployee.salary / 52);
    // Do not display salary amount in employee dashboard per request.
    if(els.empSalary) els.empSalary.textContent = '';
    els.empUsername.textContent = currentEmployeeName;
    
    // Set avatar initials based on first name
    const initial = getFirstNameInitial(currentEmployee.name);
    if(els.sidebarAvatar) els.sidebarAvatar.textContent = initial;
    if(els.profileAvatar) els.profileAvatar.textContent = initial;
  }

  function getPayslipDate(payslip) {
    // Priority 1: weekStart (most reliable - actual week start date)
    if (payslip.weekStart) {
      return new Date(payslip.weekStart + 'T00:00:00');
    }
    
    // Priority 2: Parse weekLabel (e.g., "Dec 1 - 7" or "Nov 17 - 23")
    if (payslip.weekLabel) {
      const weekLabelMatch = payslip.weekLabel.match(/(\w+)\s+(\d+)/);
      if (weekLabelMatch) {
        const monthName = weekLabelMatch[1];
        const day = parseInt(weekLabelMatch[2]);
        const monthNames = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
        const monthIndex = monthNames.indexOf(monthName.toLowerCase().substring(0, 3));
        if (monthIndex !== -1) {
          // Determine year: prefer from created date, fallback to current year
          let year = new Date().getFullYear();
          if (payslip.created) {
            const createdDate = new Date(payslip.created);
            if (!isNaN(createdDate.getTime())) {
              year = createdDate.getFullYear();
            }
          }
          const parsedDate = new Date(year, monthIndex, day);
          if (!isNaN(parsedDate.getTime())) {
            return parsedDate;
          }
        }
      }
    }
    
    // Priority 3: created date
    if (payslip.created) {
      return new Date(payslip.created);
    }
    
    // Priority 4: date field
    if (payslip.date) {
      return new Date(payslip.date + 'T00:00:00');
    }
    
    return null;
  }

  function filterPayslipsByMonth(payslipList, month, year) {
    return payslipList.filter(p => {
      const date = getPayslipDate(p);
      if (!date || isNaN(date.getTime())) return false;
      return date.getMonth() === month && date.getFullYear() === year;
    });
  }

  function renderPayslips(){
    // Defensive: deduplicate payslips by weekKey / weekStart / weekLabel so only one entry per week is shown
    const map = Object.create(null);
    const filtered = [];
    (Array.isArray(payslips) ? payslips : []).forEach(p => {
      const key = p.weekKey || p.weekStart || p.weekLabel || (p.created ? new Date(p.created).toISOString().slice(0,10) : null);
      if(!key) return;
      if(!map[key]){
        map[key] = true;
        filtered.push(p);
      }
    });
    // sort by created descending so newest appears first
    filtered.sort((a,b)=>{ const ta = a.created ? new Date(a.created).getTime() : 0; const tb = b.created ? new Date(b.created).getTime() : 0; return tb - ta; });

    // Filter by current month/year
    const monthFiltered = filterPayslipsByMonth(filtered, currentPayslipMonth, currentPayslipYear);
    
    // Update month label
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 
                       'July', 'August', 'September', 'October', 'November', 'December'];
    const monthLabel = document.getElementById('payslipMonthLabel');
    if (monthLabel) {
      monthLabel.textContent = `${monthNames[currentPayslipMonth]} ${currentPayslipYear}`;
    }
    
    // Update navigation buttons state
    updateNavigationButtons();

    // Store filtered payslips for button click handlers
    window.currentMonthPayslips = monthFiltered;

    els.payslipTbody.innerHTML = '';
    if (monthFiltered.length === 0) {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td colspan="5" style="text-align:center;padding:20px;color:#6b7280">No payslips for this month</td>`;
      els.payslipTbody.appendChild(tr);
    } else {
      monthFiltered.forEach((p, i)=>{
        const label = p.weekLabel || p.date || p.weekStart || (p.created ? new Date(p.created).toLocaleDateString() : '—');
        const status = p.status || 'Approved';
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${label}</td><td>₱${Number(p.gross).toLocaleString()}</td><td>₱${Number(p.net).toLocaleString()}</td><td>${status}</td><td class="actions"><button data-idx="${i}" class="secondary">View</button> <button data-idx="${i}" class="warn">Download</button></td>`;
        els.payslipTbody.appendChild(tr);
      });
    }
  }

  let currentPayslip = null;
  els.payslipTbody.addEventListener('click', (e)=>{
    const btn = e.target.closest('button'); if(!btn) return;
    const idx = Number(btn.dataset.idx);
    // Use currentMonthPayslips array instead of full payslips array
    const monthPayslips = window.currentMonthPayslips || [];
    if(idx >= 0 && idx < monthPayslips.length){
      if(btn.classList.contains('warn')){
        downloadPayslip(monthPayslips[idx]);
      } else {
        currentPayslip = monthPayslips[idx];
        showPayslip(currentPayslip);
      }
    }
  });

  function showPayslip(p){
    const label = p.weekLabel || p.date || p.weekStart || (p.created ? new Date(p.created).toLocaleDateString() : '—');
    els.payslipContent.innerHTML = `
      <div><strong>Week / Date:</strong> ${label}</div>
      <div><strong>Gross (weekly):</strong> ₱${Number(p.gross).toLocaleString()}</div>
      <div><strong>Statutory:</strong> ₱${Number(p.statutory||p.deductions||0).toLocaleString()}</div>
      <div><strong>Taxes:</strong> ₱${Number(p.taxes||0).toLocaleString()}</div>
      <div style="margin-top:8px;font-weight:700">Net: ₱${Number(p.net).toLocaleString()}</div>
      <div style="margin-top:6px">Status: ${p.status || 'Approved'}</div>
    `;
    els.payslipModal.style.display = 'flex'; els.payslipModal.setAttribute('aria-hidden','false');
  }

  els.closePayslip.addEventListener('click', ()=>{ els.payslipModal.style.display='none'; els.payslipModal.setAttribute('aria-hidden','true'); currentPayslip=null; });

  function downloadPayslip(p){
    // Refresh attendance records from storage so we use the admin attendance data
    try{ loadAttendanceFromStorage(); }catch(e){}

    // Create a PDF automatically using html2canvas + jsPDF. Fall back to printable window.
    const loadScript = (src)=> new Promise((resolve,reject)=>{
      if(document.querySelector('script[src="'+src+'"]')) return resolve();
      const s = document.createElement('script'); s.src = src; s.onload = ()=>resolve(); s.onerror = ()=>reject(new Error('Failed to load '+src)); document.head.appendChild(s);
    });

    const html2canvasUrl = 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js';
    const jsPdfUrl = 'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js';

    // compute week start/end once (use weekStart if available)
    const computeWeekStart = (obj)=>{
      const getMondayOf = (d)=>{
        const dt = (typeof d === 'string') ? new Date(d) : d;
        if(isNaN(dt.getTime())) return null;
        const day = dt.getDay();
        const diff = (day === 0) ? -6 : (1 - day);
        const m = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate() + diff);
        return new Date(m.getFullYear(), m.getMonth(), m.getDate());
      };
      let sd = null;
      if(obj.weekStart) sd = new Date(obj.weekStart + 'T00:00:00');
      else if(obj.date) sd = getMondayOf(new Date(obj.date + 'T00:00:00'));
      else if(obj.created) sd = getMondayOf(new Date(obj.created));
      if(!sd || isNaN(sd.getTime())) sd = getMondayOf(new Date());
      return sd;
    };
    const weekStartDate = computeWeekStart(p);
    const weekEndDate = new Date(weekStartDate.getTime() + 6*24*3600*1000);

    const generatePrintableHtml = ()=>{
      const rows = [];
      let totalNetMinutes = 0;
      let totalPayableMinutes = 0;
      let totalLateMinutes = 0;
      attendanceRecords.forEach(r => {
        try{
          if(String(r.id) !== String(currentEmployee.id)) return;
          // derive a local date for the record (prefer explicit date, fall back to ISO timestamps)
          let recDate = null;
          if(r.date) recDate = new Date(r.date + 'T00:00:00');
          else if(r.timeInISO) recDate = new Date(r.timeInISO);
          else if(r.timeOutISO) recDate = new Date(r.timeOutISO);
          if(!recDate || isNaN(recDate.getTime())) return;
          const recDay = new Date(recDate.getFullYear(), recDate.getMonth(), recDate.getDate());
          if(recDay.getTime() < weekStartDate.getTime() || recDay.getTime() > weekEndDate.getTime()) return;
          let inDt=null,outDt=null;
          if(r.timeInISO) inDt=new Date(r.timeInISO); else if(r.timeIn){ const tmp=new Date(recDay.getFullYear(),recDay.getMonth(),recDay.getDate()); const m=r.timeIn.match(/(\d{1,2}):(\d{2})(?:\s*(am|pm))?/i); if(m){ let hh=Number(m[1]); const mm=Number(m[2]); const ampm=m[3]?m[3].toLowerCase():null; if(ampm){ if(ampm==='pm'&&hh!==12) hh+=12; if(ampm==='am'&&hh===12) hh=0; } tmp.setHours(hh,mm,0,0); inDt=tmp; } }
          if(r.timeOutISO) outDt=new Date(r.timeOutISO); else if(r.timeOut){ const tmp=new Date(recDay.getFullYear(),recDay.getMonth(),recDay.getDate()); const m=r.timeOut.match(/(\d{1,2}):(\d{2})(?:\s*(am|pm))?/i); if(m){ let hh=Number(m[1]); const mm=Number(m[2]); const ampm=m[3]?m[3].toLowerCase():null; if(ampm){ if(ampm==='pm'&&hh!==12) hh+=12; if(ampm==='am'&&hh===12) hh=0; } tmp.setHours(hh,mm,0,0); outDt=tmp; } }
          let worked='';
          if(inDt && outDt && !isNaN(inDt.getTime()) && !isNaN(outDt.getTime())){
            if(outDt.getTime() < inDt.getTime()) outDt = new Date(outDt.getTime() + 24*3600*1000);
            const net = computeNetMinutesBetween(inDt, outDt);
            const paid = Math.min(net, 8 * 60);
            totalNetMinutes += net;
            totalPayableMinutes += paid;
            // per-day late: arrivals after 08:10 are considered late; deduction uses minutes since 08:00
            try{
              const scheduled = 8*60; const grace = 10;
              const inMinutes = inDt.getHours()*60 + inDt.getMinutes();
              if(inMinutes > (scheduled + grace)) totalLateMinutes += Math.max(0, inMinutes - scheduled);
            }catch(e){}
            const hrs = Math.floor(net / 60);
            const mins = net % 60;
            worked = `${hrs}h ${mins}m` + (paid !== net ? ` • paid ${ (paid/60).toFixed(2) }h` : '');
          }
          const formattedDate = formatDateYYYYMMDD(recDay);
          rows.push({ date: formattedDate, timeIn: r.timeIn || (r.timeInISO? formatTime(new Date(r.timeInISO)):''), timeOut: r.timeOut || (r.timeOutISO? formatTime(new Date(r.timeOutISO)):''), worked });
        }catch(e){}
      });
      const totalNetHours = Math.round((totalNetMinutes / 60) * 100) / 100;
      const totalPayableHours = Math.round((totalPayableMinutes / 60) * 100) / 100;
      const computedLateH = Math.floor(totalLateMinutes / 60);
      const computedLateM = totalLateMinutes % 60;
      // prefer week-computed lateness; fall back to stored per-employee values
      const lateH = totalLateMinutes > 0 ? computedLateH : Number(currentEmployee.lateHours||0);
      const lateM = totalLateMinutes > 0 ? computedLateM : Number(currentEmployee.lateMinutes||0);
      const lateStr = (lateH||lateM)?`${lateH}h ${lateM}m`:'0h 0m';
      const sss = Number((currentEmployee.deductions && currentEmployee.deductions.sss) || 0);
      const phil = Number((currentEmployee.deductions && currentEmployee.deductions.philhealth) || 0);
      const pag = Number((currentEmployee.deductions && currentEmployee.deductions.pagibig) || 0);
      const statutoryTotal = sss+phil+pag;
      const gross = Number(p.gross||0); const net = Number(p.net||0);

      const container = document.createElement('div'); container.style.width='800px'; container.style.padding='24px'; container.style.background='#fff'; container.style.color='#000';
      const titleDateRange = `${formatDateYYYYMMDD(weekStartDate)} to ${formatDateYYYYMMDD(weekEndDate)}`;
      let inner = `
<style>
  * {
    color: #000 !important;
    opacity: 1 !important;
    filter: none !important;
  }

  body, div, table, th, td {
    font-weight: 700 !important;
  }

  table {
    border-collapse: collapse;
  }

  th, td {
    border: 1.5px solid #000 !important;
  }
</style>
`;

      inner += `<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:18px"><div><h2 style=\"margin:0;color:#000;font-weight:700\">Payroll - Payslip</h2><div style=\"color:#000;font-weight:600\">Week: ${titleDateRange}</div></div><div style=\"text-align:right\"><img src="src/logo.png" alt="Company Logo" style="height:60px;width:auto;margin-bottom:8px;display:block\"><div style=\"font-weight:700;color:#000\">${currentEmployee.name}</div><div style=\"color:#000;font-weight:600\">${currentEmployee.id}</div></div></div>`;
      inner += `<h4 style=\"color:#000;font-weight:700\">Attendance</h4><table style=\"width:100%;border-collapse:collapse;margin-top:8px\"><thead><tr><th style=\"padding:10px;border:1px solid #000;background:#fff;color:#000;font-weight:700\">Date</th><th style=\"padding:10px;border:1px solid #000;background:#fff;color:#000;font-weight:700\">Time In</th><th style=\"padding:10px;border:1px solid #000;background:#fff;color:#000;font-weight:700\">Time Out</th><th style=\"padding:10px;border:1px solid #000;background:#fff;color:#000;font-weight:700\">Hours</th></tr></thead><tbody>`;
      if(rows.length===0) inner += `<tr><td colspan=\"4\" style=\"padding:10px;border:1px solid #000;color:#000;background:#fff;font-weight:600\">No attendance records for this week.</td></tr>`;
      rows.forEach(rw=>{ inner += `<tr><td style=\"padding:10px;border:1px solid #000;color:#000;background:#fff;font-weight:600\">${rw.date}</td><td style=\"padding:10px;border:1px solid #000;color:#000;background:#fff;font-weight:600\">${rw.timeIn||'—'}</td><td style=\"padding:10px;border:1px solid #000;color:#000;background:#fff;font-weight:600\">${rw.timeOut||'—'}</td><td style=\"padding:10px;border:1px solid #000;color:#000;background:#fff;font-weight:600\">${rw.worked||'—'}</td></tr>` });
      inner += `</tbody></table>`;
      inner += `<h4 style=\"margin-top:14px;color:#000;font-weight:700\">Summary</h4><table style=\"width:100%;border-collapse:collapse;margin-top:8px\"><tbody>`;
      inner += `<tr><td style=\"padding:10px;border:1px solid #000;color:#000;background:#fff;font-weight:600\">Worked Hours (actual)</td><td style=\"padding:10px;border:1px solid #000;text-align:right;color:#000;background:#fff;font-weight:600\">${totalNetHours} h</td></tr>`;
      inner += `<tr><td style=\"padding:10px;border:1px solid #000;color:#000;background:#fff;font-weight:600\">Payable Hours (capped)</td><td style=\"padding:10px;border:1px solid #000;text-align:right;color:#000;background:#fff;font-weight:600\">${totalPayableHours} h</td></tr>`;
      inner += `<tr><td style=\"padding:10px;border:1px solid #000;color:#000;background:#fff;font-weight:600\">Late</td><td style=\"padding:10px;border:1px solid #000;text-align:right;color:#000;background:#fff;font-weight:600\">${lateStr}</td></tr>`;
      inner += `<tr><td style=\"padding:10px;border:1px solid #000;color:#000;background:#fff;font-weight:600\">SSS</td><td style=\"padding:10px;border:1px solid #000;text-align:right;color:#000;background:#fff;font-weight:600\">₱${sss.toLocaleString()}</td></tr>`;
      inner += `<tr><td style=\"padding:10px;border:1px solid #000;color:#000;background:#fff;font-weight:600\">PhilHealth</td><td style=\"padding:10px;border:1px solid #000;text-align:right;color:#000;background:#fff;font-weight:600\">₱${phil.toLocaleString()}</td></tr>`;
      inner += `<tr><td style=\"padding:10px;border:1px solid #000;color:#000;background:#fff;font-weight:600\">Pag-IBIG</td><td style=\"padding:10px;border:1px solid #000;text-align:right;color:#000;background:#fff;font-weight:600\">₱${pag.toLocaleString()}</td></tr>`;
      inner += `<tr><td style=\"padding:10px;border:1px solid #000;color:#000;background:#fff;font-weight:700\">Statutory Total</td><td style=\"padding:10px;border:1px solid #000;text-align:right;color:#000;background:#fff;font-weight:700\">₱${statutoryTotal.toLocaleString()}</td></tr>`;
      inner += `<tr><td style=\"padding:10px;border:1px solid #000;color:#000;background:#fff;font-weight:700\">Gross (week)</td><td style=\"padding:10px;border:1px solid #000;text-align:right;color:#000;background:#fff;font-weight:700\">₱${gross.toLocaleString()}</td></tr>`;
      inner += `<tr><td style=\"padding:10px;border:1px solid #000;color:#000;background:#fff;font-weight:700\">Net (week)</td><td style=\"padding:10px;border:1px solid #000;text-align:right;color:#000;background:#fff;font-weight:700\">₱${net.toLocaleString()}</td></tr>`;
      inner += `</tbody></table>`;
      inner += `<div style=\"margin-top:16px;color:#000;font-size:12px;font-weight:600\">Generated: ${new Date().toLocaleString()}</div>`;
      container.innerHTML = inner;
      return container;
    };

    const doFallback = ()=>{
      // fallback to printable window if libraries fail - silently fail
      try{ const w = window.open('', '_blank', 'noopener'); if(!w){ console.warn('Popups blocked'); return; } const container = generatePrintableHtml(); w.document.write('<!doctype html><html><head><meta charset="utf-8"><title>Payslip</title></head><body>'+container.innerHTML+'</body></html>'); w.document.close(); setTimeout(()=>{ try{ w.focus(); w.print(); }catch(e){} },400); }catch(e){ console.error('Fallback failed:', e); }
    };

    // Load libs and generate PDF
    Promise.all([loadScript(html2canvasUrl), loadScript(jsPdfUrl)]).then(()=>{
      const container = generatePrintableHtml();
      container.style.boxSizing='border-box'; container.style.background='#fff'; container.style.padding='24px'; container.style.width='800px'; container.style.maxWidth='800px';
      container.style.position='fixed'; container.style.left='-9999px'; container.style.top='0'; container.style.opacity='1'; container.style.filter='none'; document.body.appendChild(container);
      // html2canvas available as window.html2canvas
      const scale = 2; // improve image quality
      window.html2canvas(container, { scale: scale, backgroundColor: '#ffffff', useCORS: true, allowTaint: true }).then(canvas => {
        try{
          // get jsPDF constructor from UMD bundle
          const jsPDF = (window.jspdf && window.jspdf.jsPDF) ? window.jspdf.jsPDF : (window.jsPDF || null);
          if(!jsPDF){ document.body.removeChild(container); doFallback(); return; }
          const imgData = canvas.toDataURL('image/png');
          const pdf = new jsPDF('p','mm','a4');
          const pdfWidth = pdf.internal.pageSize.getWidth();
          const pdfHeight = pdf.internal.pageSize.getHeight();
          const imgProps = { width: canvas.width, height: canvas.height };
          const imgWidth = pdfWidth; const imgHeight = (imgProps.height * imgWidth) / imgProps.width;
          let heightLeft = imgHeight;
          let position = 0;
          pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
          heightLeft -= pdfHeight;
          while(heightLeft > -1){ position = heightLeft - imgHeight; pdf.addPage(); pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight); heightLeft -= pdfHeight; }
          const filename = `payslip_${currentEmployee.id}_${formatDateYYYYMMDD(weekStartDate)}.pdf`;
          pdf.save(filename);
        }catch(err){ console.error(err); doFallback(); }
        document.body.removeChild(container);
      }).catch(err => { console.error(err); if(container && container.parentNode) container.parentNode.removeChild(container); doFallback(); });
    }).catch(err=>{ console.error('Failed to load PDF libs', err); doFallback(); });
  }

  if(els.downloadPayslipBtn) els.downloadPayslipBtn.addEventListener('click', ()=>{ if(currentPayslip) downloadPayslip(currentPayslip); });
  if(els.downloadLatest) els.downloadLatest.addEventListener('click', ()=>{ if(payslips.length) downloadPayslip(payslips[0]); else alert('No payslips available'); });

  if(els.downloadAll) els.downloadAll.addEventListener('click', ()=>{
    if(payslips.length===0){ return; }
    const rows = [['Date','Gross','Taxes','Deductions','Net']];
    payslips.forEach(p=> rows.push([p.date,p.gross,p.taxes,p.deductions,p.net]));
    const csv = rows.map(r=> r.map(c=> '"'+String(c).replace(/"/g,'""')+'"').join(',')).join('\n');
    const blob = new Blob([csv], {type:'text/csv'});
    const url = URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download='payslips_'+currentEmployee.id+'.csv'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  });

  // request modal handlers (guarded)
  if(els.requestTimeOff) els.requestTimeOff.addEventListener('click', ()=>{ els.requestModal.style.display='flex'; els.requestModal.setAttribute('aria-hidden','false'); });
  if(els.cancelRequest) els.cancelRequest.addEventListener('click', ()=>{ els.requestModal.style.display='none'; els.requestModal.setAttribute('aria-hidden','true'); });

  // Submit from modal form
  els.requestForm.addEventListener('submit',(ev)=>{
    ev.preventDefault();
    const from = document.getElementById('fromDate').value;
    const to = document.getElementById('toDate').value;
    const reason = document.getElementById('reason').value.trim();
    const item = { id: 'REQ_'+Date.now(), subject: 'Time Off', from, to, message: reason, type: 'Time Off', status:'Pending', created: new Date().toISOString() };
    requests.unshift(item);
    saveRequestsToStorage();
    renderRequests(); renderRequestsFull();
    els.requestModal.style.display='none'; els.requestModal.setAttribute('aria-hidden','true');
    els.requestForm.reset();
    alert('Request sent');
  });

  function renderRequests(){
    if(requests.length===0) els.requestsList.textContent = 'No requests';
    else {
      // show up to 3 recent requests with admin reply if present
      const esc = s => String(s||'').replace(/[&\"'<>]/g, function(c){ return {'&':'&amp;','"':'&quot;','\'':'&#39;','<':'&lt;','>':'&gt;'}[c]; });
      els.requestsList.innerHTML = requests.slice(0,3).map(r=> {
        const adminReply = r.adminComment ? `<div style="margin-top:6px;font-style:italic;color:#f43f5e;word-wrap:break-word;overflow-wrap:break-word">Admin reply: ${esc(r.adminComment)}</div>` : '';
        return `<div style="margin-bottom:6px;word-wrap:break-word;overflow-wrap:break-word"><strong>${formatDateRange(r.from, r.to)}</strong><div class="muted" style="word-wrap:break-word;overflow-wrap:break-word;max-width:100%">${esc(r.message)} — ${esc(r.status)}</div>${adminReply}</div>`;
      }).join('');
    }
  }

  // Render full Requests page (form + table)
  function renderRequestsFull(){
    // aside summary
    renderRequests();
    // full table
    const tbody = document.querySelector('#myRequestsTable tbody');
    if(!tbody) return;
    tbody.innerHTML = '';
    requests.forEach((r, i)=>{
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="padding:8px;border-bottom:1px solid #eef2f7">${i+1}</td>
        <td style="padding:8px;border-bottom:1px solid #eef2f7;word-wrap:break-word;overflow-wrap:break-word">${escapeHtml(r.subject || r.type || '')}</td>
        <td style="padding:8px;border-bottom:1px solid #eef2f7;word-wrap:break-word;overflow-wrap:break-word">${formatDateRange(r.from, r.to)}</td>
        <td style="padding:8px;border-bottom:1px solid #eef2f7;word-wrap:break-word;overflow-wrap:break-word;max-width:0">${escapeHtml(r.message || '')}${r.adminComment ? `<div class="muted" style="margin-top:6px;font-style:italic;color:#ef4444;word-wrap:break-word;overflow-wrap:break-word">Admin reply: ${escapeHtml(r.adminComment)}</div>` : ''}</td>
        <td style="padding:8px;border-bottom:1px solid #eef2f7;word-wrap:break-word;overflow-wrap:break-word">${escapeHtml(r.type || '')}</td>
        <td style="padding:8px;border-bottom:1px solid #eef2f7">${r.status}</td>
        <td style="padding:8px;border-bottom:1px solid #eef2f7">
          ${ r.status === 'Cancelled' ? '<button disabled style="background:#d1d5db;color:#6b7280;border:none;padding:6px 8px;border-radius:4px;font-size:12px;cursor:default">Cancelled</button>' : `<button data-request-id="${r.id}" style="background:#ef4444;color:#fff;border:none;padding:6px 8px;border-radius:4px;cursor:pointer;font-size:12px" onclick="showCancelConfirm('${r.id}', this)">Cancel</button>` }
        </td>
      `;
      tbody.appendChild(tr);
    });
  }

  function escapeHtml(str){ return String(str||'').replace(/[&"'<>]/g, function(c){ return {'&':'&amp;','"':'&quot;','\'':'&#39;','<':'&lt;','>':'&gt;'}[c]; }); }

  function formatDateRange(fromDateStr, toDateStr) {
    try {
      const from = new Date(fromDateStr + 'T00:00:00');
      const to = new Date(toDateStr + 'T00:00:00');
      if (isNaN(from.getTime()) || isNaN(to.getTime())) {
        return `${fromDateStr} , ${toDateStr}`;
      }
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const fromMonth = monthNames[from.getMonth()];
      const fromDay = from.getDate();
      const toMonth = monthNames[to.getMonth()];
      const toDay = to.getDate();
      const year = from.getFullYear();
      
      if (from.getMonth() === to.getMonth() && from.getFullYear() === to.getFullYear()) {
        return `${fromMonth} ${fromDay} - ${toDay}, ${year}`;
      } else {
        return `${fromMonth} ${fromDay} - ${toMonth} ${toDay}, ${year}`;
      }
    } catch (e) {
      return `${fromDateStr} , ${toDateStr}`;
    }
  }

  // Cancel (employee) / remove request — performs cancellation immediately (no confirmation)
  function cancelRequest(id, btn){
    const idx = requests.findIndex(r=> r.id === id);
    if(idx === -1) return;
    // if already cancelled, disable button and return
    if(requests[idx].status === 'Cancelled'){
      if(btn){ btn.disabled = true; btn.style.opacity = '0.6'; btn.style.cursor = 'default'; }
      return;
    }
    // mark canceled
    requests[idx].status = 'Cancelled';
    saveRequestsToStorage();
    renderRequests(); renderRequestsFull();
    // disable the clicked button to prevent repeated clicks
    try{ if(btn){ btn.disabled = true; btn.style.opacity = '0.6'; btn.style.cursor = 'default'; } }catch(e){}
  }

  // Pending cancel state for modal
  let _pendingCancelId = null;
  let _pendingCancelBtn = null;

  function showCancelConfirm(id, btn){
    _pendingCancelId = id;
    _pendingCancelBtn = btn || null;
    const modal = document.getElementById('cancelConfirmModal');
    const msg = document.getElementById('cancelConfirmMessage');
    if(msg) msg.textContent = 'Are you sure you want to cancel this request?';
    if(modal){ modal.style.display = 'flex'; modal.setAttribute('aria-hidden','false'); }
  }

  function hideCancelConfirm(){
    _pendingCancelId = null; _pendingCancelBtn = null;
    const modal = document.getElementById('cancelConfirmModal');
    if(modal){ modal.style.display = 'none'; modal.setAttribute('aria-hidden','true'); }
  }

  // Confirm/cancel buttons wiring (if modal exists)
  const cancelConfirmYes = document.getElementById('cancelConfirmYes');
  const cancelConfirmNo = document.getElementById('cancelConfirmNo');
  if(cancelConfirmYes) cancelConfirmYes.addEventListener('click', ()=>{
    if(!_pendingCancelId) { hideCancelConfirm(); return; }
    try{ cancelRequest(_pendingCancelId, _pendingCancelBtn); }catch(e){}
    hideCancelConfirm();
  });
  if(cancelConfirmNo) cancelConfirmNo.addEventListener('click', ()=>{ hideCancelConfirm(); });

  const cancelConfirmModalEl = document.getElementById('cancelConfirmModal');
  if(cancelConfirmModalEl) cancelConfirmModalEl.addEventListener('click', (e)=>{ if(e.target && e.target.id === 'cancelConfirmModal'){ hideCancelConfirm(); } });

  // Expose showCancelConfirm globally so buttons can call it
  window.showCancelConfirm = showCancelConfirm;
  // Also expose cancelRequest in case other code calls it directly
  window.cancelRequest = cancelRequest;

  document.getElementById('payslipModal').addEventListener('click', (e)=>{ if(e.target.id==='payslipModal') { e.target.style.display='none'; e.target.setAttribute('aria-hidden','true'); } });
  document.getElementById('requestModal').addEventListener('click', (e)=>{ if(e.target.id==='requestModal') { e.target.style.display='none'; e.target.setAttribute('aria-hidden','true'); } });

  // wire the full Requests page form (left-side form in requestsSection)
  const leaveFormEl = document.getElementById('leaveForm');
  if(leaveFormEl){
    leaveFormEl.addEventListener('submit',(ev)=>{
      ev.preventDefault();
      const subject = 'Leave Request'; // Default subject since field was removed
      const from = document.getElementById('leaveFrom').value;
      const to = document.getElementById('leaveTo').value;
      const message = document.getElementById('leaveMessage').value.trim();
      const type = document.getElementById('leaveType').value || 'Leave';
      const item = { id: 'REQ_'+Date.now(), subject, from, to, message, type, status: 'Pending', created: new Date().toISOString() };
      requests.unshift(item); saveRequestsToStorage(); renderRequests(); renderRequestsFull();
      leaveFormEl.reset();
      alert('Leave request submitted');
    });
  }

  // nav links: show requests section when clicking Requests in sidebar
  document.querySelectorAll('.nav-link').forEach(a=>{
    a.addEventListener('click',(ev)=>{
      ev.preventDefault();
      const section = a.dataset.section;
      const rightCard = document.getElementById('rightCard');
      if(section === 'requests'){
        // hide other .card.section elements and show requestsSection
        document.querySelectorAll('main .card.section').forEach(c=> c.style.display='none');
        const rs = document.getElementById('requestsSection'); if(rs) rs.style.display='block';
        if(rightCard) rightCard.style.display = 'none';
        renderRequestsFull();
      } else {
        // show main cards
        document.querySelectorAll('main .card.section').forEach(c=> c.style.display='block');
        const rs = document.getElementById('requestsSection'); if(rs) rs.style.display='none';
        if(rightCard) rightCard.style.display = 'block';
      }
      // update active nav link
      document.querySelectorAll('.nav-link').forEach(l=> l.classList.remove('active'));
      a.classList.add('active');
    });
  });

  // Month navigation handlers
  const payslipPrevBtn = document.getElementById('payslipPrevMonth');
  const payslipNextBtn = document.getElementById('payslipNextMonth');
  
  function updateNavigationButtons() {
    const currentDate = new Date(currentPayslipYear, currentPayslipMonth, 1);
    const startDateObj = new Date(startYear, startMonth, 1);
    const today = new Date();
    const currentDateObj = new Date(today.getFullYear(), today.getMonth(), 1);
    
    if (payslipPrevBtn) {
      // Disable if we're at or before the start month
      if (currentDate.getTime() <= startDateObj.getTime()) {
        payslipPrevBtn.disabled = true;
        payslipPrevBtn.style.opacity = '0.5';
        payslipPrevBtn.style.cursor = 'not-allowed';
      } else {
        payslipPrevBtn.disabled = false;
        payslipPrevBtn.style.opacity = '1';
        payslipPrevBtn.style.cursor = 'pointer';
      }
    }
    
    if (payslipNextBtn) {
      // Disable if we're at or after the current month
      if (currentDate.getTime() >= currentDateObj.getTime()) {
        payslipNextBtn.disabled = true;
        payslipNextBtn.style.opacity = '0.5';
        payslipNextBtn.style.cursor = 'not-allowed';
      } else {
        payslipNextBtn.disabled = false;
        payslipNextBtn.style.opacity = '1';
        payslipNextBtn.style.cursor = 'pointer';
      }
    }
  }
  
  if (payslipPrevBtn) {
    payslipPrevBtn.addEventListener('click', () => {
      const currentDate = new Date(currentPayslipYear, currentPayslipMonth, 1);
      const startDateObj = new Date(startYear, startMonth, 1);
      if (currentDate.getTime() <= startDateObj.getTime()) return; // Can't go before start
      
      currentPayslipMonth--;
      if (currentPayslipMonth < 0) {
        currentPayslipMonth = 11;
        currentPayslipYear--;
      }
      updateNavigationButtons();
      renderPayslips();
    });
  }
  
  if (payslipNextBtn) {
    payslipNextBtn.addEventListener('click', () => {
      const today = new Date();
      const currentDate = new Date(currentPayslipYear, currentPayslipMonth, 1);
      const currentDateObj = new Date(today.getFullYear(), today.getMonth(), 1);
      if (currentDate.getTime() >= currentDateObj.getTime()) return; // Can't go after current month
      
      currentPayslipMonth++;
      if (currentPayslipMonth > 11) {
        currentPayslipMonth = 0;
        currentPayslipYear++;
      }
      updateNavigationButtons();
      renderPayslips();
    });
  }

  // load attendance, requests and render everything
  loadAttendanceFromStorage(); loadRequestsFromStorage();
  renderProfile(); updateLocalStatusDisplay(); renderPayslips(); renderRequests(); renderRequestsFull();

  // Listen for storage events so payslips and profile update in real-time across tabs
  window.addEventListener('storage', (e)=>{
    try{
      if(!e) return;
      const key = e.key;
      if(key === ('employee_payslips_' + currentEmployee.id)){
        loadPayslipsFromStorage(); renderPayslips();
      }
      if(key === 'payroll_employees'){
        // admin updated employee master; refresh local copy
        const adminEmployees = JSON.parse(localStorage.getItem('payroll_employees') || '[]');
        const empFromAdmin = adminEmployees.find(x=> x.id === currentEmployee.id);
        if(empFromAdmin){
          currentEmployee.salary = empFromAdmin.salary || currentEmployee.salary;
          currentEmployee.deductions = empFromAdmin.deductions || currentEmployee.deductions;
          currentEmployee.lastNet = empFromAdmin.lastNet || currentEmployee.lastNet;
          renderProfile(); loadPayslipsFromStorage(); renderPayslips();
        }
      }
    }catch(err){ /* ignore */ }
  });

  // wire time in/out buttons
  if(els.timeInBtn) els.timeInBtn.addEventListener('click', markTimeIn);
  if(els.timeOutBtn) els.timeOutBtn.addEventListener('click', markTimeOut);
  try{ window.__employeeAttendanceHelpers = { computeNetMinutesBetween: computeNetMinutesBetween }; }catch(e){ }
})();

// Global logout function
function logout(){
  localStorage.removeItem('currentEmployeeId');
  localStorage.removeItem('currentEmployeeName');
  window.location.href = 'login.html';
}
