const SB_URL = 'https://fxpaacqnsbnbzbcabpvi.supabase.co';
const SB_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ4cGFhY3Fuc2JuYnpiY2FicHZpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIxMjM0MzgsImV4cCI6MjA4NzY5OTQzOH0.cLIEMR4ZpH3buhMjC8nwHu8h9p-WfHPfNZpHQXua3Oc';
const VV = 0.15;
const net = (g) => Number(g || 0) * (1 - VV);
let sb,
  clients = [],
  sessions = [];
let calY, calM, dmY, dmM;
let sSortCol = 'date',
  sSortDir = 'desc';
let sFilters = { status: 'all', client: 'all', type: 'all', month: 'all' };
let editSId = null,
  editCId = null;
let chart = null;
const undoStack = [],
  redoStack = [];
let arranging = false,
  dragSrc = null;
let secOrder = JSON.parse(localStorage.getItem('secOrder') || 'null') || [
  'todo',
  'chart',
  'cal',
  'sched',
];

window.addEventListener('load', () => {
  applyTheme(localStorage.getItem('theme') || 'light');
  sb = window.supabase.createClient(SB_URL, SB_KEY);
  const now = new Date();
  calY = now.getFullYear();
  calM = now.getMonth();
  dmY = now.getFullYear();
  dmM = now.getMonth();
  const t = today();
  ['s-date', 'cash-date', 'bank-date'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = t;
  });
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
      e.preventDefault();
      doUndo();
    }
    if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
      e.preventDefault();
      doRedo();
    }
    if (e.key === 'Enter' && document.getElementById('tab-sessions').classList.contains('active'))
      addSession();
  });
  document.getElementById('app').style.display = 'block';
  loadAll();
});

function applyTheme(t) {
  document.documentElement.setAttribute('data-theme', t);
  localStorage.setItem('theme', t);
  const b = document.getElementById('theme-btn');
  if (b) b.textContent = t === 'dark' ? '☀️ Light' : '🌙 Dark';
}
function toggleTheme() {
  applyTheme(
    (document.documentElement.getAttribute('data-theme') || 'light') === 'dark' ? 'light' : 'dark',
  );
  if (chart) renderChart();
}

async function loadAll() {
  await loadClients();
  await loadSessions();
  buildDMPicker();
  renderHome();
  renderSessionsTab();
  renderClientsTab();
}
async function loadClients() {
  const { data } = await sb.from('clients').select('*').order('name');
  clients = data || [];
  fillClientSelects();
}
async function loadSessions() {
  const { data } = await sb.from('sessions').select('*').order('date', { ascending: false });
  sessions = data || [];
}

function fillClientSelects() {
  const active = clients.filter((c) => !c.archived).sort((a, b) => a.name.localeCompare(b.name));
  ['s-client', 'es-client'].forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.innerHTML = active.length
      ? active.map((c) => `<option value="${c.id}">${c.name}</option>`).join('')
      : '<option value="">No clients</option>';
  });
}

const status = (s) => {
  if (s.paid) return 'paid';
  if (s.status) return s.status;
  return 'happened';
};
const cname = (id) => {
  const c = clients.find((c) => c.id === id);
  return c ? c.name : '?';
};
const crate = (id) => {
  const c = clients.find((c) => c.id === id);
  return c ? Number(c.rate) : 0;
};
const today = () => new Date().toISOString().split('T')[0];
const fdate = (s) => {
  if (!s) return '—';
  return new Date(s + 'T12:00:00').toLocaleDateString('en-IL', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
};
const fdateS = (s) => {
  if (!s) return '—';
  return new Date(s + 'T12:00:00').toLocaleDateString('en-IL', { day: 'numeric', month: 'short' });
};
const fmonth = (y, m) =>
  new Date(y, m, 1).toLocaleDateString('en-IL', { month: 'long', year: 'numeric' });
const daysSince = (d) => {
  if (!d) return 0;
  return Math.floor((new Date() - new Date(d + 'T12:00:00')) / 864e5);
};

function ST(name) {
  document.querySelectorAll('.tab').forEach((el) => el.classList.remove('active'));
  document.querySelectorAll('.htab,.bnav-btn').forEach((el) => el.classList.remove('active'));
  document.getElementById('tab-' + name)?.classList.add('active');
  document.querySelectorAll('.htab').forEach((b) => {
    if (b.getAttribute('onclick')?.includes("'" + name + "'")) b.classList.add('active');
  });
  document.getElementById('bn-' + name)?.classList.add('active');
  if (name === 'cash') {
    renderCashPicker();
    loadCashBatches();
  }
  if (name === 'bank') {
    renderBankPicker();
    loadBankBatches();
  }
  if (name === 'home') renderHome();
  if (name === 'records') renderRecords();
}

// ─── UNDO/REDO ───────────────────────────────────────────────
function pushU(action) {
  undoStack.push(action);
  redoStack.length = 0;
  updUndoBtns();
}
function updUndoBtns() {
  const u = document.getElementById('undo-btn'),
    r = document.getElementById('redo-btn');
  if (u) {
    u.disabled = !undoStack.length;
    u.style.opacity = undoStack.length ? '1' : '.4';
    u.title = undoStack.length
      ? 'Undo: ' + undoStack[undoStack.length - 1].label
      : 'Nothing to undo';
  }
  if (r) {
    r.disabled = !redoStack.length;
    r.style.opacity = redoStack.length ? '1' : '.4';
    r.title = redoStack.length
      ? 'Redo: ' + redoStack[redoStack.length - 1].label
      : 'Nothing to redo';
  }
}
async function doUndo() {
  if (!undoStack.length) return;
  const a = undoStack.pop();
  redoStack.push(a);
  updUndoBtns();
  await a.undo();
  toast('Undone: ' + a.label, 'ok');
}
async function doRedo() {
  if (!redoStack.length) return;
  const a = redoStack.pop();
  undoStack.push(a);
  updUndoBtns();
  await a.redo();
  toast('Redone: ' + a.label, 'ok');
}

// ─── DASHBOARD ───────────────────────────────────────────────
function shiftDM(d) {
  dmM += d;
  if (dmM > 11) {
    dmM = 0;
    dmY++;
  }
  if (dmM < 0) {
    dmM = 11;
    dmY--;
  }
  renderHome();
}
function buildDMPicker() {
  const sel = document.getElementById('dm-picker');
  if (!sel) return;
  sel.innerHTML = '';
  const now = new Date();
  for (let i = 12; i >= -6; i--) {
    let d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const opt = document.createElement('option');
    opt.value = d.getFullYear() + '-' + d.getMonth();
    opt.textContent = d.toLocaleDateString('en-IL', { month: 'long', year: 'numeric' });
    if (d.getFullYear() === dmY && d.getMonth() === dmM) opt.selected = true;
    sel.appendChild(opt);
  }
}
function pickDM(val) {
  const [y, m] = val.split('-').map(Number);
  dmY = y;
  dmM = m;
  renderHome();
}
function shiftCal(d) {
  calM += d;
  if (calM > 11) {
    calM = 0;
    calY++;
  }
  if (calM < 0) {
    calM = 11;
    calY--;
  }
  renderCal();
}

function renderHome() {
  const ms = new Date(dmY, dmM, 1).toISOString().split('T')[0];
  const me = new Date(dmY, dmM + 1, 0).toISOString().split('T')[0];
  const mo = sessions.filter((s) => s.date >= ms && s.date <= me);
  const earned = mo
    .filter((s) => ['happened', 'paid'].includes(status(s)))
    .reduce((sum, s) => sum + net(crate(s.client_id)), 0);
  const toCollect = sessions
    .filter((s) => status(s) === 'happened')
    .reduce((sum, s) => sum + net(crate(s.client_id)), 0);
  const sched = mo
    .filter((s) => status(s) === 'scheduled')
    .reduce((sum, s) => sum + net(crate(s.client_id)), 0);
  document.getElementById('dash-title').textContent = fmonth(dmY, dmM);
  document.getElementById('d-earned').textContent = '₪' + Math.round(earned);
  document.getElementById('d-collect').textContent = '₪' + Math.round(toCollect);
  document.getElementById('d-sched').textContent = sched > 0 ? '₪' + Math.round(sched) : '—';
  if (!document.getElementById('dsec-todo')) buildDashSections();
  renderDashContent();
}

function toggleArrange() {
  arranging = !arranging;
  const btn = document.getElementById('arr-btn');
  btn.textContent = arranging ? '✓ Done' : '✦ Arrange';
  btn.style.color = arranging ? 'var(--accent)' : '';
  const cont = document.getElementById('dash-secs');
  cont.classList.toggle('arranging', arranging);
  document.getElementById('arr-banner')?.classList.toggle('show', arranging);
}

function buildDashSections() {
  const cont = document.getElementById('dash-secs');
  cont.innerHTML =
    `<div id="arr-banner" class="arr-banner">Drag sections to reorder • tap ✓ Done when finished</div>` +
    secOrder
      .map(
        (id) =>
          `<div class="dash-sec" id="dsec-${id}" draggable="true" data-sid="${id}"><div class="drag-hnd">⠿ drag</div>${secHTML(id)}</div>`,
      )
      .join('');
  cont.querySelectorAll('.dash-sec').forEach((el) => {
    el.addEventListener('dragstart', (e) => {
      if (!arranging) {
        e.preventDefault();
        return;
      }
      dragSrc = el;
      setTimeout(() => el.classList.add('dragging'), 0);
    });
    el.addEventListener('dragend', () => {
      el.classList.remove('dragging');
      cont.querySelectorAll('.dash-sec').forEach((x) => x.classList.remove('drag-over'));
    });
    el.addEventListener('dragover', (e) => {
      if (!arranging || !dragSrc || dragSrc === el) return;
      e.preventDefault();
      cont.querySelectorAll('.dash-sec').forEach((x) => x.classList.remove('drag-over'));
      el.classList.add('drag-over');
    });
    el.addEventListener('drop', (e) => {
      if (!arranging || !dragSrc || dragSrc === el) return;
      e.preventDefault();
      el.classList.remove('drag-over');
      const ids = [...cont.querySelectorAll('.dash-sec')].map((x) => x.dataset.sid);
      const fi = ids.indexOf(dragSrc.dataset.sid),
        ti = ids.indexOf(el.dataset.sid);
      ids.splice(fi, 1);
      ids.splice(ti, 0, dragSrc.dataset.sid);
      secOrder = ids;
      localStorage.setItem('secOrder', JSON.stringify(secOrder));
      buildDashSections();
      if (arranging) {
        cont.classList.add('arranging');
        document.getElementById('arr-banner')?.classList.add('show');
      }
      renderDashContent();
    });
  });
}

function secHTML(id) {
  if (id === 'todo')
    return `<div class="card"><div class="ctitle" style="margin-bottom:.75rem">To do</div><div id="d-todo"><div class="skel"></div></div></div>`;
  if (id === 'chart')
    return `<div class="card"><div class="ctitle">Monthly earnings (net)</div><canvas id="d-chart" height="80"></canvas></div>`;
  if (id === 'cal')
    return `<div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem" id="home-grid">
    <div class="cal-wrap">
      <div class="cal-hdr"><button class="cnav" onclick="shiftCal(-1)">‹</button><span class="cal-title" id="cal-title"></span><button class="cnav" onclick="shiftCal(1)">›</button></div>
      <div class="cal-grid" id="cal-grid"></div>
      <div style="display:flex;gap:1rem;margin-top:.85rem;flex-wrap:wrap">
        <span style="display:flex;align-items:center;gap:.35rem;font-size:.7rem;color:var(--muted)"><span style="width:8px;height:8px;border-radius:50%;background:var(--green);display:inline-block"></span>Happened</span>
        <span style="display:flex;align-items:center;gap:.35rem;font-size:.7rem;color:var(--muted)"><span style="width:8px;height:8px;border-radius:50%;background:var(--blue);display:inline-block"></span>Paid</span>
        <span style="display:flex;align-items:center;gap:.35rem;font-size:.7rem;color:var(--muted)"><span style="width:8px;height:8px;border-radius:50%;background:var(--dim);display:inline-block"></span>Scheduled</span>
      </div>
    </div>
    <div><div class="card" style="margin-bottom:0"><div class="ctitle">Outstanding per client</div><div id="d-outstanding"><div class="skel"></div></div></div></div>
  </div>`;
  if (id === 'sched')
    return `<div class="card"><div class="ctitle">Scheduled sessions</div><div id="d-sched-list"><div class="skel"></div></div></div>`;
  return '';
}

function renderDashContent() {
  renderTodo();
  renderChart();
  renderCal();
  renderOutstanding();
  renderSchedList();
}

async function renderTodo() {
  const el = document.getElementById('d-todo');
  if (!el) return;
  const hapCash = sessions.filter(
    (s) => status(s) === 'happened' && clients.find((c) => c.id === s.client_id)?.type === 'cash',
  );
  const hapBank = sessions.filter(
    (s) => status(s) === 'happened' && clients.find((c) => c.id === s.client_id)?.type === 'bank',
  );
  const { data: cp } = await sb
    .from('cash_payments')
    .select('vv_owed,paid_to_vv')
    .eq('paid_to_vv', false);
  const vvOwed = (cp || []).reduce((s, p) => s + Number(p.vv_owed), 0);
  const { data: vp } = await sb.from('vv_payments').select('id').eq('receipt_sent', false);
  const noReceipt = (vp || []).length;
  const items = [];
  if (hapCash.length)
    items.push({
      dot: 'var(--blue)',
      text: `${hapCash.length} cash session${hapCash.length > 1 ? 's' : ''} to record`,
      tab: 'cash',
    });
  if (hapBank.length)
    items.push({
      dot: 'var(--accent)',
      text: `${hapBank.length} bank session${hapBank.length > 1 ? 's' : ''} waiting for VV`,
      tab: 'bank',
    });
  if (vvOwed > 0)
    items.push({ dot: 'var(--amber)', text: `₪${Math.round(vvOwed)} you owe VV`, tab: 'cash' });
  if (noReceipt > 0)
    items.push({
      dot: 'var(--red)',
      text: `${noReceipt} bank transfer${noReceipt > 1 ? 's' : ''} need a receipt`,
      tab: 'bank',
    });
  el.innerHTML = !items.length
    ? `<div class="empty" style="padding:.75rem 0"><div class="ei">✅</div>All caught up!</div>`
    : items
        .map(
          (it) =>
            `<div class="pend-item"><div style="display:flex;align-items:center;gap:.6rem"><div class="pdot" style="background:${it.dot}"></div><span>${it.text}</span></div><button class="btn btn-ghost btn-sm" onclick="ST('${it.tab}')">View →</button></div>`,
        )
        .join('');
}

function renderChart() {
  const el = document.getElementById('d-chart');
  if (!el) return;
  const months = [];
  for (let i = 5; i >= 0; i--) {
    let y = dmY,
      m = dmM - i;
    if (m < 0) {
      m += 12;
      y--;
    }
    const ms = new Date(y, m, 1).toISOString().split('T')[0];
    const me = new Date(y, m + 1, 0).toISOString().split('T')[0];
    const label = new Date(y, m, 1).toLocaleDateString('en-IL', { month: 'short' });
    const earned = sessions
      .filter((s) => s.date >= ms && s.date <= me && ['happened', 'paid'].includes(status(s)))
      .reduce((sum, s) => sum + net(crate(s.client_id)), 0);
    months.push({ label, earned: Math.round(earned) });
  }
  const ctx = el.getContext('2d');
  if (chart) chart.destroy();
  const dark = document.documentElement.getAttribute('data-theme') === 'dark';
  const g = dark ? '#52b788' : '#2d6a4f';
  chart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: months.map((m) => m.label),
      datasets: [
        {
          data: months.map((m) => m.earned),
          backgroundColor: months.map((_, i) => (i === 5 ? g : g + '55')),
          borderRadius: 6,
          borderSkipped: false,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (c) => '₪' + c.raw } },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { font: { family: 'DM Sans', size: 11 }, color: dark ? '#7a7870' : '#6b6960' },
        },
        y: {
          grid: { color: dark ? '#333330' : '#e8e7e2' },
          ticks: {
            font: { family: 'DM Mono', size: 10 },
            color: dark ? '#7a7870' : '#6b6960',
            callback: (v) => '₪' + v,
          },
        },
      },
    },
  });
}

// ─── CALENDAR WITH HOVER TOOLTIPS ────────────────────────────
let _calTT = null;

function renderCal() {
  const tEl = document.getElementById('cal-title');
  const gEl = document.getElementById('cal-grid');
  if (!tEl || !gEl) return;
  tEl.textContent = fmonth(calY, calM);
  const days = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
  const first = new Date(calY, calM, 1).getDay();
  const dim = new Date(calY, calM + 1, 0).getDate();
  const td = today();
  let html = days.map((d) => `<div class="cdl">${d}</div>`).join('');
  // previous month filler days
  for (let i = 0; i < first; i++) {
    const d = new Date(calY, calM, -(first - i - 1));
    html += `<div class="cd om"><span class="cn">${d.getDate()}</span></div>`;
  }
  // actual days
  for (let d = 1; d <= dim; d++) {
    const ds = `${calY}-${String(calM + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const daySessions = sessions.filter((s) => s.date === ds);
    const isT = ds === td;
    const hasSess = daySessions.length > 0;
    const dots = daySessions
      .map(
        (s) =>
          `<span class="dot ${status(s) === 'paid' ? 'p' : status(s) === 'scheduled' ? 's' : 'h'}"></span>`,
      )
      .join('');
    html +=
      `<div class="cd${isT ? ' today' : ''}${hasSess ? ' has-sess' : ''}" data-date="${ds}">` +
      `<span class="cn">${d}</span>` +
      (hasSess ? `<div class="cdots">${dots}</div>` : '') +
      `</div>`;
  }
  gEl.innerHTML = html;

  // Create tooltip element once
  if (!_calTT) {
    _calTT = document.createElement('div');
    _calTT.className = 'cal-tooltip';
    document.body.appendChild(_calTT);
  }

  // Attach hover listeners to days that have sessions
  gEl.querySelectorAll('.has-sess').forEach((cell) => {
    const ds = cell.dataset.date;
    cell.addEventListener('mouseenter', (e) => showCalTT(e, ds));
    cell.addEventListener('mousemove', (e) => posCalTT(e));
    cell.addEventListener('mouseleave', hideCalTT);
  });
}

function showCalTT(e, ds) {
  const daySessions = sessions.filter((s) => s.date === ds);
  const d = new Date(ds + 'T12:00:00');
  const label = d.toLocaleDateString('en-IL', { weekday: 'long', day: 'numeric', month: 'long' });

  const rows = daySessions
    .map((s) => {
      const c = clients.find((x) => x.id === s.client_id);
      const st = status(s);
      const dotCol =
        st === 'paid' ? 'var(--blue)' : st === 'scheduled' ? 'var(--dim)' : 'var(--green)';
      const stLabel = st === 'paid' ? 'Paid' : st === 'scheduled' ? 'Scheduled' : 'Happened';
      const r = c ? Math.round(net(c.rate)) : 0;
      const typeTag = c ? (c.type === 'cash' ? 'Cash' : 'Bank') : '';
      return `<div class="tt-row">
      <span class="tt-dot" style="background:${dotCol}"></span>
      <span class="tt-info">
        <span class="tt-name">${c ? c.name : '?'}</span>
        <span class="tt-meta"><span>${stLabel}</span>${r ? `<span>₪${r}</span>` : ''}<span style="opacity:.6">${typeTag}</span></span>
      </span>
    </div>`;
    })
    .join('');

  _calTT.innerHTML = `<div class="tt-date">${label}</div>${rows}`;
  posCalTT(e);
  _calTT.classList.add('show');
}

function posCalTT(e) {
  if (!_calTT) return;
  const w = _calTT.offsetWidth || 190;
  const h = _calTT.offsetHeight || 80;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let x = e.clientX + 16;
  let y = e.clientY - 8;
  if (x + w > vw - 12) x = e.clientX - w - 10;
  if (y + h > vh - 12) y = e.clientY - h - 4;
  _calTT.style.left = x + 'px';
  _calTT.style.top = y + 'px';
}

function hideCalTT() {
  if (_calTT) _calTT.classList.remove('show');
}

function renderOutstanding() {
  const el = document.getElementById('d-outstanding');
  if (!el) return;
  const unpaid = sessions.filter((s) => status(s) === 'happened');
  const byC = {};
  unpaid.forEach((s) => {
    if (!byC[s.client_id]) byC[s.client_id] = { total: 0, count: 0, oldest: s.date };
    byC[s.client_id].total += net(crate(s.client_id));
    byC[s.client_id].count++;
    if (s.date < byC[s.client_id].oldest) byC[s.client_id].oldest = s.date;
  });
  const entries = Object.entries(byC)
    .map(([id, d]) => ({ id, name: cname(id), ...d }))
    .sort((a, b) => b.total - a.total);
  if (!entries.length) {
    el.innerHTML = `<div class="empty" style="padding:1rem 0"><div class="ei">✅</div>All collected!</div>`;
    return;
  }
  el.innerHTML = entries
    .map((e) => {
      const days = daysSince(e.oldest);
      return `<div class="out-item"><div><div style="font-weight:600;font-size:.88rem">${e.name}</div><div style="font-size:.72rem;color:var(--muted)">${e.count} session${e.count !== 1 ? 's' : ''}</div></div><div style="text-align:right"><div class="out-amt">₪${Math.round(e.total)}</div><div class="out-days">${days > 14 ? days + ' days ago' : ''}</div></div></div>`;
    })
    .join('');
}

function renderSchedList() {
  const el = document.getElementById('d-sched-list');
  if (!el) return;
  const list = sessions
    .filter((s) => status(s) === 'scheduled')
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  if (!list.length) {
    el.innerHTML = `<div class="empty" style="padding:.75rem 0"><div class="ei">📅</div>No scheduled sessions</div>`;
    return;
  }
  el.innerHTML = `<div class="tw"><table><thead><tr><th>Date</th><th>Client</th><th>Type</th><th>You'd earn</th><th></th></tr></thead><tbody>${list
    .map((s) => {
      const c = clients.find((x) => x.id === s.client_id);
      return `<tr><td style="font-family:'DM Mono',monospace;font-size:.77rem;color:var(--muted)">${fdate(s.date)}</td><td><strong>${c ? c.name : '—'}</strong></td><td>${c ? (c.type === 'cash' ? '<span class="badge bc">Cash</span>' : '<span class="badge bb">Bank</span>') : ''}</td><td style="font-family:'DM Mono',monospace;font-size:.78rem">₪${c ? Math.round(net(c.rate)) : '—'}</td><td><button class="btn btn-sm btn-ghost" onclick="markHappened('${s.id}')">✓ Happened</button></td></tr>`;
    })
    .join('')}</tbody></table></div>`;
}

async function markHappened(id) {
  const s = sessions.find((x) => x.id === id);
  if (!s) return;
  const old = s.status;
  s.status = 'happened';
  await sb.from('sessions').update({ status: 'happened' }).eq('id', id);
  pushU({
    label: 'Mark happened: ' + cname(s.client_id),
    undo: async () => {
      s.status = old;
      await sb.from('sessions').update({ status: old }).eq('id', id);
      renderHome();
      renderSessionsTab();
    },
    redo: async () => {
      s.status = 'happened';
      await sb.from('sessions').update({ status: 'happened' }).eq('id', id);
      renderHome();
      renderSessionsTab();
    },
  });
  toast('Marked as happened ✓', 'ok');
  renderHome();
  renderSessionsTab();
  renderCashPicker();
  renderBankPicker();
}

// ─── SESSIONS ────────────────────────────────────────────────
async function addSession() {
  const cid = document.getElementById('s-client').value;
  const date = document.getElementById('s-date').value;
  const stat = document.getElementById('s-status').value;
  if (!cid || !date) {
    toast('Fill all fields', 'err');
    return;
  }
  const btn = document.getElementById('add-s-btn');
  btn.textContent = '…';
  btn.disabled = true;
  const { data, error } = await sb
    .from('sessions')
    .insert({ client_id: cid, date, status: stat, paid: false })
    .select()
    .single();
  btn.textContent = '+ Add';
  btn.disabled = false;
  if (error) {
    toast('Error: ' + error.message, 'err');
    return;
  }
  sessions = [data, ...sessions].sort((a, b) => (a.date < b.date ? 1 : -1));
  pushU({
    label: 'Add session: ' + cname(cid) + ' ' + fdateS(date),
    undo: async () => {
      await sb.from('sessions').delete().eq('id', data.id);
      sessions = sessions.filter((s) => s.id !== data.id);
      renderSessionsTab();
      renderHome();
      renderCashPicker();
      renderBankPicker();
    },
    redo: async () => {
      await sb.from('sessions').insert({ ...data });
      sessions = [data, ...sessions].sort((a, b) => (a.date < b.date ? 1 : -1));
      renderSessionsTab();
      renderHome();
      renderCashPicker();
      renderBankPicker();
    },
  });
  toast(stat === 'scheduled' ? 'Session scheduled ◷' : 'Session logged ✓', 'ok');
  renderSessionsTab();
  renderHome();
  renderCashPicker();
  renderBankPicker();
}

async function deleteSession(id) {
  const s = sessions.find((x) => x.id === id);
  if (!s) return;
  const snap = { ...s };
  await sb.from('sessions').delete().eq('id', id);
  sessions = sessions.filter((x) => x.id !== id);
  pushU({
    label: 'Delete session: ' + cname(snap.client_id) + ' ' + fdateS(snap.date),
    undo: async () => {
      await sb.from('sessions').insert(snap);
      sessions = [snap, ...sessions].sort((a, b) => (a.date < b.date ? 1 : -1));
      renderSessionsTab();
      renderHome();
      renderCashPicker();
      renderBankPicker();
    },
    redo: async () => {
      await sb.from('sessions').delete().eq('id', snap.id);
      sessions = sessions.filter((s) => s.id !== snap.id);
      renderSessionsTab();
      renderHome();
      renderCashPicker();
      renderBankPicker();
    },
  });
  toast('Session deleted', 'ok');
  renderSessionsTab();
  renderHome();
  renderCashPicker();
  renderBankPicker();
}

function openSessionEdit(id) {
  const s = sessions.find((x) => x.id === id);
  if (!s) return;
  editSId = id;
  fillClientSelects();
  document.getElementById('es-client').value = s.client_id;
  document.getElementById('es-date').value = s.date;
  document.getElementById('es-status').value =
    status(s) === 'paid' ? 'paid' : s.status || 'happened';
  document.getElementById('modal-session').style.display = 'flex';
}
async function saveSessionEdit() {
  if (!editSId) return;
  const s = sessions.find((x) => x.id === editSId);
  if (!s) return;
  const oldSnap = { ...s };
  const cid = document.getElementById('es-client').value;
  const date = document.getElementById('es-date').value;
  const stat = document.getElementById('es-status').value;
  await sb.from('sessions').update({ client_id: cid, date, status: stat }).eq('id', editSId);
  s.client_id = cid;
  s.date = date;
  s.status = stat;
  pushU({
    label: 'Edit session',
    undo: async () => {
      Object.assign(s, oldSnap);
      await sb.from('sessions').update(oldSnap).eq('id', editSId);
      renderSessionsTab();
      renderHome();
    },
    redo: async () => {
      s.client_id = cid;
      s.date = date;
      s.status = stat;
      await sb.from('sessions').update({ client_id: cid, date, status: stat }).eq('id', editSId);
      renderSessionsTab();
      renderHome();
    },
  });
  closeModal('session');
  toast('Session updated ✓', 'ok');
  renderSessionsTab();
  renderHome();
}

async function changeStatus(id, val) {
  const s = sessions.find((x) => x.id === id);
  if (!s) return;
  const old = s.status;
  s.status = val;
  await sb.from('sessions').update({ status: val }).eq('id', id);
  pushU({
    label: 'Status: ' + cname(s.client_id) + ' ' + old + ' → ' + val,
    undo: async () => {
      s.status = old;
      await sb.from('sessions').update({ status: old }).eq('id', id);
      renderSessionsTab();
      renderHome();
      renderCashPicker();
      renderBankPicker();
    },
    redo: async () => {
      s.status = val;
      await sb.from('sessions').update({ status: val }).eq('id', id);
      renderSessionsTab();
      renderHome();
      renderCashPicker();
      renderBankPicker();
    },
  });
  toast('Status updated ✓', 'ok');
  renderHome();
  renderCashPicker();
  renderBankPicker();
  renderSessionsTab();
}

function applySessionFilters() {
  sFilters.status = document.getElementById('f-status')?.value || 'all';
  sFilters.client = document.getElementById('f-client')?.value || 'all';
  sFilters.type = document.getElementById('f-type')?.value || 'all';
  sFilters.month = document.getElementById('f-month')?.value || 'all';
  renderSessionsTab();
}
function clearSF() {
  sFilters = { status: 'all', client: 'all', type: 'all', month: 'all' };
  ['f-status', 'f-client', 'f-type', 'f-month'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = 'all';
  });
  renderSessionsTab();
}
function sortSessions(col) {
  if (sSortCol === col) sSortDir = sSortDir === 'asc' ? 'desc' : 'asc';
  else {
    sSortCol = col;
    sSortDir = col === 'date' ? 'desc' : 'asc';
  }
  renderSessionsTab();
}

function renderSessionsTab() {
  const fc = document.getElementById('f-client');
  if (fc) {
    const active = clients.filter((c) => !c.archived).sort((a, b) => a.name.localeCompare(b.name));
    fc.innerHTML =
      '<option value="all">All clients</option>' +
      active.map((c) => `<option value="${c.id}">${c.name}</option>`).join('');
    if (sFilters.client !== 'all') fc.value = sFilters.client;
  }
  const fm = document.getElementById('f-month');
  if (fm && fm.options.length <= 1) {
    const months = [...new Set(sessions.map((s) => s.date.substring(0, 7)))].sort((a, b) =>
      b.localeCompare(a),
    );
    months.forEach((m) => {
      const [y, mo] = m.split('-');
      const opt = document.createElement('option');
      opt.value = m;
      opt.textContent = new Date(Number(y), Number(mo) - 1, 1).toLocaleDateString('en-IL', {
        month: 'long',
        year: 'numeric',
      });
      fm.appendChild(opt);
    });
  }
  const el = document.getElementById('sessions-list');
  let list = [...sessions];
  if (sFilters.status !== 'all') list = list.filter((s) => status(s) === sFilters.status);
  if (sFilters.client !== 'all') list = list.filter((s) => s.client_id === sFilters.client);
  if (sFilters.type !== 'all') {
    const ids = clients.filter((c) => c.type === sFilters.type).map((c) => c.id);
    list = list.filter((s) => ids.includes(s.client_id));
  }
  if (sFilters.month !== 'all') list = list.filter((s) => s.date.startsWith(sFilters.month));
  const dir = sSortDir === 'asc' ? 1 : -1;
  if (sSortCol === 'date') list.sort((a, b) => (a.date > b.date ? 1 : -1) * dir);
  else if (sSortCol === 'client')
    list.sort((a, b) => cname(a.client_id).localeCompare(cname(b.client_id)) * dir);
  else if (sSortCol === 'status') {
    const o = { scheduled: 0, happened: 1, paid: 2 };
    list.sort((a, b) => ((o[status(a)] || 0) - (o[status(b)] || 0)) * dir);
  }
  const arr = (col) => (sSortCol === col ? (sSortDir === 'asc' ? ' ↑' : ' ↓') : '');
  const ts = 'cursor:pointer;user-select:none;';
  if (!list.length) {
    el.innerHTML = `<div class="empty"><div class="ei">📋</div>No sessions match filters</div>`;
    return;
  }
  el.innerHTML = `<div class="tw"><table>
    <thead><tr>
      <th style="${ts}" onclick="sortSessions('date')">Date${arr('date')}</th>
      <th style="${ts}" onclick="sortSessions('client')">Client${arr('client')}</th>
      <th>Type</th><th>You Keep</th>
      <th style="${ts}" onclick="sortSessions('status')">Status${arr('status')}</th>
      <th></th>
    </tr></thead>
    <tbody>${list
      .map((s) => {
        const c = clients.find((x) => x.id === s.client_id);
        const st = status(s);
        const stBadge =
          st === 'paid'
            ? '<span class="badge bg">✓ Paid</span>'
            : st === 'happened'
              ? '<span class="badge ba">Happened</span>'
              : '<span class="badge bgrey">◷ Scheduled</span>';
        return `<tr>
        <td style="font-family:'DM Mono',monospace;font-size:.77rem;color:var(--muted)">${fdate(s.date)}</td>
        <td><strong>${c ? c.name : '—'}</strong></td>
        <td>${c ? (c.type === 'cash' ? '<span class="badge bc">Cash</span>' : '<span class="badge bb">Bank</span>') : ''}</td>
        <td style="font-family:'DM Mono',monospace;font-size:.78rem">₪${c ? Math.round(net(c.rate)) : '—'}</td>
        <td>${st !== 'paid' ? `<select onchange="changeStatus('${s.id}',this.value)" style="font-size:.75rem;padding:.25rem .5rem;border-radius:6px;border:1px solid var(--border);background:var(--surface2);color:var(--text);cursor:pointer;width:auto"><option value="scheduled" ${st === 'scheduled' ? 'selected' : ''}>◷ Scheduled</option><option value="happened" ${st === 'happened' ? 'selected' : ''}>✓ Happened</option></select>` : stBadge}</td>
        <td style="display:flex;gap:.25rem;justify-content:flex-end">
          <button class="edit-btn" onclick="openSessionEdit('${s.id}')" title="Edit">✏️</button>
          <button class="ico-btn" onclick="deleteSession('${s.id}')" title="Delete">🗑️</button>
        </td>
      </tr>`;
      })
      .join('')}</tbody></table></div>`;
}

// ─── CLIENTS ─────────────────────────────────────────────────
async function addClient() {
  const name = document.getElementById('c-name').value.trim();
  const type = document.getElementById('c-type').value;
  const rate = parseFloat(document.getElementById('c-rate').value);
  if (!name || !rate) {
    toast('Fill all fields', 'err');
    return;
  }
  const { data, error } = await sb
    .from('clients')
    .insert({ name, type, rate, archived: false })
    .select()
    .single();
  if (error) {
    toast('Error: ' + error.message, 'err');
    return;
  }
  clients = [...clients, data].sort((a, b) => a.name.localeCompare(b.name));
  pushU({
    label: 'Add client: ' + name,
    undo: async () => {
      await sb.from('clients').delete().eq('id', data.id);
      clients = clients.filter((c) => c.id !== data.id);
      fillClientSelects();
      renderClientsTab();
      renderSessionsTab();
    },
    redo: async () => {
      await sb.from('clients').insert({ ...data });
      clients = [...clients, data].sort((a, b) => a.name.localeCompare(b.name));
      fillClientSelects();
      renderClientsTab();
    },
  });
  toast('Client added ✓', 'ok');
  document.getElementById('c-name').value = '';
  document.getElementById('c-rate').value = '';
  fillClientSelects();
  renderClientsTab();
}

function openClientEdit(id) {
  const c = clients.find((x) => x.id === id);
  if (!c) return;
  editCId = id;
  document.getElementById('ec-name').value = c.name;
  document.getElementById('ec-type').value = c.type;
  document.getElementById('ec-rate').value = c.rate;
  document.getElementById('modal-client').style.display = 'flex';
}
async function saveClientEdit() {
  if (!editCId) return;
  const c = clients.find((x) => x.id === editCId);
  if (!c) return;
  const oldSnap = { ...c };
  const name = document.getElementById('ec-name').value.trim();
  const type = document.getElementById('ec-type').value;
  const rate = parseFloat(document.getElementById('ec-rate').value);
  if (!name || !rate) {
    toast('Fill all fields', 'err');
    return;
  }
  await sb.from('clients').update({ name, type, rate }).eq('id', editCId);
  Object.assign(c, { name, type, rate });
  pushU({
    label: 'Edit client: ' + name,
    undo: async () => {
      Object.assign(c, oldSnap);
      await sb.from('clients').update(oldSnap).eq('id', editCId);
      fillClientSelects();
      renderClientsTab();
      renderSessionsTab();
      renderHome();
    },
    redo: async () => {
      Object.assign(c, { name, type, rate });
      await sb.from('clients').update({ name, type, rate }).eq('id', editCId);
      fillClientSelects();
      renderClientsTab();
      renderSessionsTab();
      renderHome();
    },
  });
  closeModal('client');
  toast('Client updated ✓', 'ok');
  fillClientSelects();
  renderClientsTab();
  renderSessionsTab();
  renderHome();
}

async function archiveClient(id) {
  const c = clients.find((x) => x.id === id);
  if (!c) return;
  await sb.from('clients').update({ archived: true }).eq('id', id);
  c.archived = true;
  pushU({
    label: 'Archive: ' + c.name,
    undo: async () => {
      c.archived = false;
      await sb.from('clients').update({ archived: false }).eq('id', id);
      fillClientSelects();
      renderClientsTab();
    },
    redo: async () => {
      c.archived = true;
      await sb.from('clients').update({ archived: true }).eq('id', id);
      fillClientSelects();
      renderClientsTab();
    },
  });
  toast('Archived — click Unarchive to restore', 'ok');
  fillClientSelects();
  renderClientsTab();
}
async function unarchiveClient(id) {
  const c = clients.find((x) => x.id === id);
  if (!c) return;
  await sb.from('clients').update({ archived: false }).eq('id', id);
  c.archived = false;
  pushU({
    label: 'Unarchive: ' + c.name,
    undo: async () => {
      c.archived = true;
      await sb.from('clients').update({ archived: true }).eq('id', id);
      fillClientSelects();
      renderClientsTab();
    },
    redo: async () => {
      c.archived = false;
      await sb.from('clients').update({ archived: false }).eq('id', id);
      fillClientSelects();
      renderClientsTab();
    },
  });
  toast('Client restored ✓', 'ok');
  fillClientSelects();
  renderClientsTab();
}
async function deleteClient(id) {
  const c = clients.find((x) => x.id === id);
  if (!c) return;
  const sc = sessions.filter((s) => s.client_id === id);
  const msg = sc.length
    ? `Delete ${c.name}? This will also delete their ${sc.length} session${sc.length !== 1 ? 's' : ''}. Cannot be undone.`
    : `Delete ${c.name}? Cannot be undone.`;
  if (!confirm(msg)) return;
  if (sc.length) await sb.from('sessions').delete().eq('client_id', id);
  await sb.from('clients').delete().eq('id', id);
  clients = clients.filter((c) => c.id !== id);
  sessions = sessions.filter((s) => s.client_id !== id);
  toast('Client deleted', 'ok');
  fillClientSelects();
  renderClientsTab();
  renderSessionsTab();
  renderHome();
}

function renderClientsTab() {
  const tf = document.getElementById('cf-type')?.value || 'all';
  const sf = document.getElementById('cf-sort')?.value || 'name';
  let active = clients.filter((c) => !c.archived);
  if (tf === 'cash') active = active.filter((c) => c.type === 'cash');
  if (tf === 'bank') active = active.filter((c) => c.type === 'bank');
  if (sf === 'name') active.sort((a, b) => a.name.localeCompare(b.name));
  else if (sf === 'name-d') active.sort((a, b) => b.name.localeCompare(a.name));
  else if (sf === 'rate') active.sort((a, b) => Number(a.rate) - Number(b.rate));
  else if (sf === 'rate-d') active.sort((a, b) => Number(b.rate) - Number(a.rate));
  else if (sf === 'sessions')
    active.sort(
      (a, b) =>
        sessions.filter((s) => s.client_id === a.id).length -
        sessions.filter((s) => s.client_id === b.id).length,
    );
  else if (sf === 'sessions-d')
    active.sort(
      (a, b) =>
        sessions.filter((s) => s.client_id === b.id).length -
        sessions.filter((s) => s.client_id === a.id).length,
    );
  const archived = clients.filter((c) => c.archived);
  const el = document.getElementById('clients-list');
  if (!active.length) {
    el.innerHTML = `<div class="empty"><div class="ei">👤</div>No active clients</div>`;
  } else
    el.innerHTML = `<div class="tw"><table><thead><tr><th>Name</th><th>Type</th><th>Rate</th><th>You Keep</th><th>Sessions</th><th></th></tr></thead><tbody>${active
      .map((c) => {
        const cnt = sessions.filter((s) => s.client_id === c.id).length;
        const unpaid = sessions.filter((s) => s.client_id === c.id && !s.paid).length;
        return `<tr><td><strong>${c.name}</strong></td><td>${c.type === 'cash' ? '<span class="badge bc">Cash</span>' : '<span class="badge bb">Bank</span>'}</td><td style="font-family:'DM Mono',monospace;font-size:.78rem">₪${c.rate}</td><td style="font-family:'DM Mono',monospace;font-size:.78rem">₪${Math.round(net(c.rate))}</td><td><strong>${cnt}</strong>${unpaid > 0 ? ` <span style="font-size:.7rem;color:var(--amber)">${unpaid} unpaid</span>` : ''}</td><td style="display:flex;gap:.25rem;justify-content:flex-end"><button class="edit-btn" onclick="openClientEdit('${c.id}')">✏️</button><button class="btn btn-sm btn-ghost" onclick="archiveClient('${c.id}')">Archive</button><button class="ico-btn" onclick="deleteClient('${c.id}')">🗑️</button></td></tr>`;
      })
      .join('')}</tbody></table></div>`;
  const as = document.getElementById('archived-sec');
  const al = document.getElementById('archived-list');
  if (!archived.length) {
    as.style.display = 'none';
    return;
  }
  as.style.display = 'block';
  al.innerHTML = `<div class="tw"><table><thead><tr><th>Name</th><th>Type</th><th>Rate</th><th></th></tr></thead><tbody>${archived.map((c) => `<tr><td><strong style="color:var(--muted)">${c.name}</strong></td><td>${c.type === 'cash' ? '<span class="badge bc">Cash</span>' : '<span class="badge bb">Bank</span>'}</td><td style="font-family:'DM Mono',monospace;font-size:.78rem;color:var(--muted)">₪${c.rate}</td><td style="display:flex;gap:.25rem;justify-content:flex-end"><button class="btn btn-sm btn-ghost" onclick="unarchiveClient('${c.id}')">Unarchive</button><button class="ico-btn" onclick="deleteClient('${c.id}')">🗑️</button></td></tr>`).join('')}</tbody></table></div>`;
}

// ─── CASH ────────────────────────────────────────────────────
function renderCashPicker() {
  const el = document.getElementById('cash-picker');
  if (!el) return;
  const ids = clients.filter((c) => c.type === 'cash' && !c.archived).map((c) => c.id);
  const unpaid = sessions.filter(
    (s) => !s.paid && status(s) === 'happened' && ids.includes(s.client_id),
  );
  if (!unpaid.length) {
    el.innerHTML = `<div class="empty" style="padding:1.25rem"><div class="ei">✓</div>No unpaid cash sessions</div>`;
    document.getElementById('cash-sum').style.display = 'none';
    return;
  }
  el.innerHTML = `<div class="picker">${unpaid
    .map((s) => {
      const c = clients.find((x) => x.id === s.client_id);
      return `<label class="pitem"><input type="checkbox" value="${s.id}" data-rate="${c ? c.rate : 0}" onchange="updCashSum()"><span style="font-weight:600">${c ? c.name : '?'}</span><span style="color:var(--muted);font-size:.77rem">${fdateS(s.date)}</span><span style="margin-left:auto;font-family:'DM Mono',monospace;font-size:.78rem">₪${c ? Math.round(net(c.rate)) : '?'} net</span></label>`;
    })
    .join('')}</div>`;
  updCashSum();
}
function updCashSum() {
  const checked = [...document.querySelectorAll('#cash-picker input:checked')];
  let gross = 0;
  checked.forEach((cb) => (gross += parseFloat(cb.dataset.rate || 0)));
  document
    .querySelectorAll('#cash-picker .pitem')
    .forEach((item) => item.classList.toggle('sel', item.querySelector('input').checked));
  document.getElementById('cash-sum').style.display = checked.length ? 'flex' : 'none';
  document.getElementById('cash-cnt').textContent = checked.length;
  document.getElementById('cash-net').textContent = '₪' + Math.round(net(gross));
  document.getElementById('cash-vv').textContent = '₪' + Math.round(gross * VV);
}
async function recordCash() {
  const checked = [...document.querySelectorAll('#cash-picker input:checked')];
  if (!checked.length) {
    toast('Select at least one session', 'err');
    return;
  }
  const date = document.getElementById('cash-date').value;
  if (!date) {
    toast('Select a date', 'err');
    return;
  }
  const sids = checked.map((cb) => cb.value);
  let gross = 0;
  checked.forEach((cb) => (gross += parseFloat(cb.dataset.rate || 0)));
  const { data: batch, error } = await sb
    .from('cash_payments')
    .insert({ date, session_ids: sids, total: gross, vv_owed: gross * VV, paid_to_vv: false })
    .select()
    .single();
  if (error) {
    toast('Error: ' + error.message, 'err');
    return;
  }
  await sb.from('sessions').update({ paid: true }).in('id', sids);
  sids.forEach((id) => {
    const s = sessions.find((x) => x.id === id);
    if (s) s.paid = true;
  });
  pushU({
    label: 'Record cash payment',
    undo: async () => {
      await sb.from('sessions').update({ paid: false }).in('id', sids);
      sids.forEach((id) => {
        const s = sessions.find((x) => x.id === id);
        if (s) s.paid = false;
      });
      await sb.from('cash_payments').delete().eq('id', batch.id);
      renderCashPicker();
      loadCashBatches();
      renderHome();
      renderSessionsTab();
    },
    redo: async () => {
      const { data: nb } = await sb
        .from('cash_payments')
        .insert({ date, session_ids: sids, total: gross, vv_owed: gross * VV, paid_to_vv: false })
        .select()
        .single();
      await sb.from('sessions').update({ paid: true }).in('id', sids);
      sids.forEach((id) => {
        const s = sessions.find((x) => x.id === id);
        if (s) s.paid = true;
      });
      renderCashPicker();
      loadCashBatches();
      renderHome();
      renderSessionsTab();
    },
  });
  toast('Cash payment recorded ✓', 'ok');
  await loadSessions();
  renderSessionsTab();
  renderCashPicker();
  loadCashBatches();
  renderHome();
}
async function loadCashBatches() {
  const { data } = await sb.from('cash_payments').select('*').order('date', { ascending: false });
  renderCashBatches(data || []);
}
function renderCashBatches(payments) {
  const el = document.getElementById('cash-batches');
  if (!el) return;
  if (!payments.length) {
    el.innerHTML = `<div class="card"><div class="empty" style="padding:1.25rem">No cash batches yet</div></div>`;
    return;
  }
  el.innerHTML = payments
    .map((p) => {
      const rows = (p.session_ids || [])
        .map((sid) => {
          const s = sessions.find((x) => x.id === sid);
          if (!s) return '';
          const c = clients.find((x) => x.id === s.client_id);
          return `<div class="brow"><span style="font-weight:600;min-width:90px">${c ? c.name : '?'}</span><span style="color:var(--muted)">${fdateS(s.date)}</span><span style="margin-left:auto;font-family:'DM Mono',monospace;color:var(--green)">₪${Math.round(net(crate(s.client_id)))} net</span><button onclick="removeCashSession('${p.id}','${sid}')" style="margin-left:.75rem;background:var(--rsoft);color:var(--red);border:none;padding:.18rem .55rem;font-size:.7rem;border-radius:5px;cursor:pointer;font-weight:600">✕ remove</button></div>`;
        })
        .join('');
      return `<div class="bcard" id="cb-${p.id}" style="${p.paid_to_vv ? 'border-left:3px solid var(--green)' : 'border-left:3px solid var(--amber)'}">
      <div class="bhdr" onclick="toggleBatch('cb-${p.id}')">
        <div style="display:flex;align-items:center;gap:.85rem;flex:1;flex-wrap:wrap">
          <span style="font-family:'DM Mono',monospace;font-size:.78rem;color:var(--muted)">${fdate(p.date)}</span>
          <span style="font-size:.7rem;color:var(--dim)">${p.session_ids.length} session${p.session_ids.length !== 1 ? 's' : ''}</span>
          <span style="font-family:'DM Mono',monospace;font-size:.95rem;font-weight:500;color:var(--amber)">₪${Math.round(Number(p.vv_owed))} owed to VV</span>
        </div>
        <div style="display:flex;align-items:center;gap:.65rem;flex-shrink:0">
          <label style="display:flex;align-items:center;gap:.4rem" onclick="event.stopPropagation()">
            <label class="toggle"><input type="checkbox" ${p.paid_to_vv ? 'checked' : ''} onchange="toggleCashVV('${p.id}',this.checked)"><span class="tslider"></span></label>
            <span style="font-size:.73rem;color:var(--muted)">${p.paid_to_vv ? 'Paid VV' : 'Pending'}</span>
          </label>
          <button class="btn btn-sm btn-danger" onclick="event.stopPropagation();deleteCashBatch('${p.id}')">🗑️ Delete</button>
          <span class="bchev">▼</span>
        </div>
      </div>
      <div class="blist">${rows || '<div class="brow" style="color:var(--dim)">No details</div>'}<div class="btotals"><span>Gross: <strong style="font-family:'DM Mono',monospace">₪${Math.round(Number(p.total))}</strong></span><span>You kept (85%): <strong style="color:var(--green);font-family:'DM Mono',monospace">₪${Math.round(net(Number(p.total)))}</strong></span><span>VV owed (15%): <strong style="color:var(--amber);font-family:'DM Mono',monospace">₪${Math.round(Number(p.vv_owed))}</strong></span></div></div>
    </div>`;
    })
    .join('');
}
function toggleBatch(id) {
  document.getElementById(id)?.classList.toggle('open');
}
async function toggleCashVV(id, v) {
  await sb.from('cash_payments').update({ paid_to_vv: v }).eq('id', id);
  toast(v ? 'Marked paid to VV ✓' : 'Marked pending', 'ok');
  loadCashBatches();
  renderHome();
}
async function deleteCashBatch(id) {
  const { data: b } = await sb.from('cash_payments').select('*').eq('id', id).single();
  if (!b) return;
  if (!confirm('Delete this batch? Sessions will go back to unpaid.')) return;
  await sb.from('sessions').update({ paid: false }).in('id', b.session_ids);
  b.session_ids.forEach((sid) => {
    const s = sessions.find((x) => x.id === sid);
    if (s) s.paid = false;
  });
  await sb.from('cash_payments').delete().eq('id', id);
  pushU({
    label: 'Delete cash batch',
    undo: async () => {
      await sb.from('cash_payments').insert(b);
      await sb.from('sessions').update({ paid: true }).in('id', b.session_ids);
      b.session_ids.forEach((sid) => {
        const s = sessions.find((x) => x.id === sid);
        if (s) s.paid = true;
      });
      loadCashBatches();
      renderCashPicker();
      renderHome();
    },
    redo: async () => {
      await sb.from('sessions').update({ paid: false }).in('id', b.session_ids);
      b.session_ids.forEach((sid) => {
        const s = sessions.find((x) => x.id === sid);
        if (s) s.paid = false;
      });
      await sb.from('cash_payments').delete().eq('id', id);
      loadCashBatches();
      renderCashPicker();
      renderHome();
    },
  });
  toast('Batch deleted ✓', 'ok');
  renderCashPicker();
  loadCashBatches();
  renderHome();
  renderSessionsTab();
}
async function removeCashSession(batchId, sid) {
  const { data: b } = await sb.from('cash_payments').select('*').eq('id', batchId).single();
  if (!b) return;
  const newIds = b.session_ids.filter((x) => x !== sid);
  await sb.from('sessions').update({ paid: false }).eq('id', sid);
  const s = sessions.find((x) => x.id === sid);
  if (s) s.paid = false;
  if (!newIds.length) {
    await sb.from('cash_payments').delete().eq('id', batchId);
    toast('Removed — empty batch deleted ✓', 'ok');
  } else {
    const g = newIds.reduce((sum, id) => {
      const ss = sessions.find((x) => x.id === id);
      return sum + (ss ? crate(ss.client_id) : 0);
    }, 0);
    await sb
      .from('cash_payments')
      .update({ session_ids: newIds, total: g, vv_owed: g * VV })
      .eq('id', batchId);
    toast('Session removed ✓', 'ok');
  }
  renderCashPicker();
  loadCashBatches();
  renderHome();
  renderSessionsTab();
}

// ─── BANK ────────────────────────────────────────────────────
function renderBankPicker() {
  const el = document.getElementById('bank-picker');
  if (!el) return;
  const ids = clients.filter((c) => c.type === 'bank' && !c.archived).map((c) => c.id);
  const unpaid = sessions.filter(
    (s) => !s.paid && status(s) === 'happened' && ids.includes(s.client_id),
  );
  if (!unpaid.length) {
    el.innerHTML = `<div class="empty" style="padding:1.25rem"><div class="ei">✓</div>No pending bank sessions</div>`;
    document.getElementById('bank-sum').style.display = 'none';
    return;
  }
  el.innerHTML = `<div class="picker">${unpaid
    .map((s) => {
      const c = clients.find((x) => x.id === s.client_id);
      return `<label class="pitem"><input type="checkbox" value="${s.id}" data-rate="${c ? c.rate : 0}" onchange="updBankSum()"><span style="font-weight:600">${c ? c.name : '?'}</span><span style="color:var(--muted);font-size:.77rem">${fdateS(s.date)}</span><span style="margin-left:auto;font-family:'DM Mono',monospace;font-size:.78rem">₪${c ? Math.round(net(c.rate)) : '?'} net</span></label>`;
    })
    .join('')}</div>`;
  updBankSum();
}
function updBankSum() {
  const checked = [...document.querySelectorAll('#bank-picker input:checked')];
  let gross = 0;
  checked.forEach((cb) => (gross += parseFloat(cb.dataset.rate || 0)));
  document
    .querySelectorAll('#bank-picker .pitem')
    .forEach((item) => item.classList.toggle('sel', item.querySelector('input').checked));
  document.getElementById('bank-sum').style.display = checked.length ? 'flex' : 'none';
  document.getElementById('bank-cnt').textContent = checked.length;
  document.getElementById('bank-gross').textContent = '₪' + Math.round(gross);
  document.getElementById('bank-net').textContent = '₪' + Math.round(net(gross));
}
async function recordBank() {
  const checked = [...document.querySelectorAll('#bank-picker input:checked')];
  if (!checked.length) {
    toast('Select at least one session', 'err');
    return;
  }
  const date = document.getElementById('bank-date').value;
  if (!date) {
    toast('Select a date', 'err');
    return;
  }
  const sids = checked.map((cb) => cb.value);
  let gross = 0;
  checked.forEach((cb) => (gross += parseFloat(cb.dataset.rate || 0)));
  const { data: batch, error } = await sb
    .from('vv_payments')
    .insert({ date, session_ids: sids, total: gross, you_get: net(gross), receipt_sent: false })
    .select()
    .single();
  if (error) {
    toast('Error: ' + error.message, 'err');
    return;
  }
  await sb.from('sessions').update({ paid: true }).in('id', sids);
  sids.forEach((id) => {
    const s = sessions.find((x) => x.id === id);
    if (s) s.paid = true;
  });
  pushU({
    label: 'Record bank transfer',
    undo: async () => {
      await sb.from('sessions').update({ paid: false }).in('id', sids);
      sids.forEach((id) => {
        const s = sessions.find((x) => x.id === id);
        if (s) s.paid = false;
      });
      await sb.from('vv_payments').delete().eq('id', batch.id);
      renderBankPicker();
      loadBankBatches();
      renderHome();
      renderSessionsTab();
    },
    redo: async () => {
      const { data: nb } = await sb
        .from('vv_payments')
        .insert({ date, session_ids: sids, total: gross, you_get: net(gross), receipt_sent: false })
        .select()
        .single();
      await sb.from('sessions').update({ paid: true }).in('id', sids);
      sids.forEach((id) => {
        const s = sessions.find((x) => x.id === id);
        if (s) s.paid = true;
      });
      renderBankPicker();
      loadBankBatches();
      renderHome();
      renderSessionsTab();
    },
  });
  toast('Bank transfer recorded ✓', 'ok');
  await loadSessions();
  renderSessionsTab();
  renderBankPicker();
  loadBankBatches();
  renderHome();
}
async function loadBankBatches() {
  const { data } = await sb.from('vv_payments').select('*').order('date', { ascending: false });
  renderBankBatches(data || []);
}
function renderBankBatches(payments) {
  const el = document.getElementById('bank-batches');
  if (!el) return;
  if (!payments.length) {
    el.innerHTML = `<div class="card"><div class="empty" style="padding:1.25rem">No bank transfers yet</div></div>`;
    return;
  }
  el.innerHTML = payments
    .map((p) => {
      const names = [
        ...new Set(
          (p.session_ids || [])
            .map((sid) => {
              const s = sessions.find((x) => x.id === sid);
              return s ? cname(s.client_id) : null;
            })
            .filter(Boolean),
        ),
      ].join(', ');
      const rows = (p.session_ids || [])
        .map((sid) => {
          const s = sessions.find((x) => x.id === sid);
          if (!s) return '';
          const c = clients.find((x) => x.id === s.client_id);
          return `<div class="brow"><span style="font-weight:600;min-width:110px">${c ? c.name : '?'}</span><span style="color:var(--muted)">${fdateS(s.date)}</span><span style="margin-left:auto;font-family:'DM Mono',monospace;color:var(--green)">₪${Math.round(net(crate(s.client_id)))} net</span><button onclick="removeBankSession('${p.id}','${sid}')" style="margin-left:.75rem;background:var(--rsoft);color:var(--red);border:none;padding:.18rem .55rem;font-size:.7rem;border-radius:5px;cursor:pointer;font-weight:600">✕ remove</button></div>`;
        })
        .join('');
      return `<div class="bcard" id="bb-${p.id}" style="${p.receipt_sent ? 'border-left:3px solid var(--green)' : 'border-left:3px solid var(--amber)'}">
      <div class="bhdr" onclick="toggleBatch('bb-${p.id}')">
        <div style="display:flex;align-items:center;gap:.85rem;flex:1;flex-wrap:wrap">
          <span style="font-family:'DM Mono',monospace;font-size:.78rem;color:var(--muted)">${fdate(p.date)}</span>
          <span style="font-weight:600;font-size:.88rem">${names || '—'}</span>
          <span style="font-size:.7rem;color:var(--dim)">${p.session_ids.length} session${p.session_ids.length !== 1 ? 's' : ''}</span>
        </div>
        <div style="display:flex;align-items:center;gap:.65rem;flex-shrink:0">
          <span style="font-family:'DM Mono',monospace;font-size:.95rem;font-weight:500;color:var(--green)">₪${Math.round(Number(p.you_get))} net</span>
          <label style="display:flex;align-items:center;gap:.4rem" onclick="event.stopPropagation()">
            <label class="toggle"><input type="checkbox" ${p.receipt_sent ? 'checked' : ''} onchange="toggleReceipt('${p.id}',this.checked)"><span class="tslider"></span></label>
            <span style="font-size:.73rem;color:var(--muted)">${p.receipt_sent ? 'Receipt sent' : 'No receipt'}</span>
          </label>
          <button class="btn btn-sm btn-danger" onclick="event.stopPropagation();deleteBankBatch('${p.id}')">🗑️ Delete</button>
          <span class="bchev">▼</span>
        </div>
      </div>
      <div class="blist">${rows || '<div class="brow" style="color:var(--dim)">No details</div>'}<div class="btotals"><span>Full rate: <strong style="font-family:'DM Mono',monospace">₪${Math.round(Number(p.total))}</strong></span><span>You get (85%): <strong style="color:var(--green);font-family:'DM Mono',monospace">₪${Math.round(Number(p.you_get))}</strong></span></div></div>
    </div>`;
    })
    .join('');
}
async function toggleReceipt(id, v) {
  await sb.from('vv_payments').update({ receipt_sent: v }).eq('id', id);
  toast(v ? 'Receipt marked sent ✓' : 'Marked no receipt', 'ok');
  loadBankBatches();
  renderHome();
}
async function deleteBankBatch(id) {
  const { data: b } = await sb.from('vv_payments').select('*').eq('id', id).single();
  if (!b) return;
  if (!confirm('Delete this batch? Sessions will go back to unpaid.')) return;
  await sb.from('sessions').update({ paid: false }).in('id', b.session_ids);
  b.session_ids.forEach((sid) => {
    const s = sessions.find((x) => x.id === sid);
    if (s) s.paid = false;
  });
  await sb.from('vv_payments').delete().eq('id', id);
  pushU({
    label: 'Delete bank batch',
    undo: async () => {
      await sb.from('vv_payments').insert(b);
      await sb.from('sessions').update({ paid: true }).in('id', b.session_ids);
      b.session_ids.forEach((sid) => {
        const s = sessions.find((x) => x.id === sid);
        if (s) s.paid = true;
      });
      loadBankBatches();
      renderBankPicker();
      renderHome();
    },
    redo: async () => {
      await sb.from('sessions').update({ paid: false }).in('id', b.session_ids);
      b.session_ids.forEach((sid) => {
        const s = sessions.find((x) => x.id === sid);
        if (s) s.paid = false;
      });
      await sb.from('vv_payments').delete().eq('id', id);
      loadBankBatches();
      renderBankPicker();
      renderHome();
    },
  });
  toast('Batch deleted ✓', 'ok');
  renderBankPicker();
  loadBankBatches();
  renderHome();
  renderSessionsTab();
}
async function removeBankSession(batchId, sid) {
  const { data: b } = await sb.from('vv_payments').select('*').eq('id', batchId).single();
  if (!b) return;
  const newIds = b.session_ids.filter((x) => x !== sid);
  await sb.from('sessions').update({ paid: false }).eq('id', sid);
  const s = sessions.find((x) => x.id === sid);
  if (s) s.paid = false;
  if (!newIds.length) {
    await sb.from('vv_payments').delete().eq('id', batchId);
    toast('Removed — empty batch deleted ✓', 'ok');
  } else {
    const g = newIds.reduce((sum, id) => {
      const ss = sessions.find((x) => x.id === id);
      return sum + (ss ? crate(ss.client_id) : 0);
    }, 0);
    await sb
      .from('vv_payments')
      .update({ session_ids: newIds, total: g, you_get: net(g) })
      .eq('id', batchId);
    toast('Session removed ✓', 'ok');
  }
  renderBankPicker();
  loadBankBatches();
  renderHome();
  renderSessionsTab();
}

// ─── RECORDS ─────────────────────────────────────────────────
function clearRF() {
  ['r-type', 'r-status', 'r-month'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = 'all';
  });
  const rv = document.getElementById('r-view');
  if (rv) rv.value = 'batch';
  const rs = document.getElementById('r-sort');
  if (rs) rs.value = 'date-d';
  renderRecords();
}
async function renderRecords() {
  const el = document.getElementById('records-content');
  if (!el) return;
  el.innerHTML = '<div class="skel"></div><div class="skel"></div>';
  const { data: cashAll } = await sb
    .from('cash_payments')
    .select('*')
    .order('date', { ascending: false });
  const { data: bankAll } = await sb
    .from('vv_payments')
    .select('*')
    .order('date', { ascending: false });
  const rm = document.getElementById('r-month');
  if (rm && rm.options.length <= 1) {
    const all = [
      ...(cashAll || []).map((p) => p.date.substring(0, 7)),
      ...(bankAll || []).map((p) => p.date.substring(0, 7)),
    ];
    const months = [...new Set(all)].sort((a, b) => b.localeCompare(a));
    months.forEach((m) => {
      const [y, mo] = m.split('-');
      const opt = document.createElement('option');
      opt.value = m;
      opt.textContent = new Date(Number(y), Number(mo) - 1, 1).toLocaleDateString('en-IL', {
        month: 'long',
        year: 'numeric',
      });
      rm.appendChild(opt);
    });
  }
  const view = document.getElementById('r-view')?.value || 'batch';
  const typeF = document.getElementById('r-type')?.value || 'all';
  const statF = document.getElementById('r-status')?.value || 'all';
  const monF = document.getElementById('r-month')?.value || 'all';
  const sortF = document.getElementById('r-sort')?.value || 'date-d';
  let cash = (cashAll || []).map((p) => ({ ...p, _t: 'cash' }));
  let bank = (bankAll || []).map((p) => ({ ...p, _t: 'bank' }));
  if (typeF === 'cash') bank = [];
  if (typeF === 'bank') cash = [];
  if (statF === 'pending') {
    cash = cash.filter((p) => !p.paid_to_vv);
    bank = bank.filter((p) => !p.receipt_sent);
  }
  if (statF === 'complete') {
    cash = cash.filter((p) => p.paid_to_vv);
    bank = bank.filter((p) => p.receipt_sent);
  }
  if (monF !== 'all') {
    cash = cash.filter((p) => p.date.startsWith(monF));
    bank = bank.filter((p) => p.date.startsWith(monF));
  }
  if (view === 'month') {
    renderRecordsByMonth(el, cash, bank);
  } else {
    let all = [...cash, ...bank];
    if (sortF === 'date-d') all.sort((a, b) => b.date.localeCompare(a.date));
    else if (sortF === 'date-a') all.sort((a, b) => a.date.localeCompare(b.date));
    else if (sortF === 'amt-d') all.sort((a, b) => Number(b.total) - Number(a.total));
    else if (sortF === 'amt-a') all.sort((a, b) => Number(a.total) - Number(b.total));
    renderRecordsByBatch(el, all);
  }
}
function renderRecordsByMonth(el, cash, bank) {
  const months = {};
  cash.forEach((p) => {
    const k = p.date.substring(0, 7);
    if (!months[k]) months[k] = { cash: 0, bank: 0, cashP: 0, bankP: 0 };
    months[k].cash += Number(p.total);
    if (!p.paid_to_vv) months[k].cashP += Number(p.total);
  });
  bank.forEach((p) => {
    const k = p.date.substring(0, 7);
    if (!months[k]) months[k] = { cash: 0, bank: 0, cashP: 0, bankP: 0 };
    months[k].bank += Number(p.total);
    if (!p.receipt_sent) months[k].bankP += Number(p.total);
  });
  const keys = Object.keys(months).sort((a, b) => b.localeCompare(a));
  if (!keys.length) {
    el.innerHTML = `<div class="empty"><div class="ei">📁</div>No records match filters</div>`;
    return;
  }
  el.innerHTML = keys
    .map((k) => {
      const m = months[k];
      const [y, mo] = k.split('-');
      const totalNet = Math.round(net(m.cash + m.bank));
      const pendingNet = Math.round(net(m.cashP + m.bankP));
      return `<div class="card" style="margin-bottom:.75rem"><div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:.75rem"><div style="font-weight:700;font-size:1rem">${fmonth(Number(y), Number(mo) - 1)}</div><div style="text-align:right"><div style="font-family:'DM Mono',monospace;font-size:1rem;font-weight:500;color:var(--green)">₪${totalNet} <span style="font-size:.7rem;color:var(--muted)">net</span></div>${pendingNet > 0 ? `<div style="font-size:.7rem;color:var(--amber)">₪${pendingNet} pending</div>` : ''}</div></div><div style="display:flex;gap:1.5rem;font-size:.8rem;color:var(--muted);flex-wrap:wrap">${m.cash > 0 ? `<span>💵 Cash: ₪${Math.round(net(m.cash))} net${m.cashP > 0 ? ` <span style="color:var(--amber)">(₪${Math.round(net(m.cashP))} pending)</span>` : ''}</span>` : ''} ${m.bank > 0 ? `<span>🏦 Bank: ₪${Math.round(net(m.bank))} net${m.bankP > 0 ? ` <span style="color:var(--amber)">(₪${Math.round(net(m.bankP))} pending)</span>` : ''}</span>` : ''}</div></div>`;
    })
    .join('');
}
function renderRecordsByBatch(el, all) {
  if (!all.length) {
    el.innerHTML = `<div class="empty"><div class="ei">📁</div>No records match filters</div>`;
    return;
  }
  const rows = all
    .map((p) => {
      const names =
        [
          ...new Set(
            (p.session_ids || [])
              .map((sid) => {
                const s = sessions.find((x) => x.id === sid);
                return s ? cname(s.client_id) : null;
              })
              .filter(Boolean),
          ),
        ].join(', ') || '—';
      const cnt = (p.session_ids || []).length;
      const statBadge =
        p._t === 'cash'
          ? p.paid_to_vv
            ? '<span class="badge bg">VV paid</span>'
            : '<span class="badge ba">VV pending</span>'
          : p.receipt_sent
            ? '<span class="badge bg">Receipt sent</span>'
            : '<span class="badge ba">No receipt</span>';
      return `<tr><td style="font-family:'DM Mono',monospace;font-size:.77rem;color:var(--muted)">${fdate(p.date)}</td><td>${p._t === 'cash' ? '<span class="badge bc">Cash</span>' : '<span class="badge bb">Bank</span>'}</td><td style="font-size:.82rem">${names} <span style="color:var(--dim);font-size:.72rem">(${cnt})</span></td><td style="font-family:'DM Mono',monospace;font-size:.78rem">₪${Math.round(Number(p.total))}</td><td style="font-family:'DM Mono',monospace;font-size:.78rem;color:var(--green)">₪${Math.round(net(Number(p.total)))}</td><td>${statBadge}</td></tr>`;
    })
    .join('');
  el.innerHTML = `<div class="tw"><table><thead><tr><th>Date</th><th>Type</th><th>Clients</th><th>Gross</th><th>Net (85%)</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

// ─── UTILS ───────────────────────────────────────────────────
function closeModal(name) {
  document.getElementById('modal-' + name).style.display = 'none';
}
function toast(msg, type = '') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'toast' + (type ? ' ' + type : '');
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 3000);
}

window.addEventListener('resize', () => {
  const g = document.getElementById('home-grid');
  if (g) g.style.gridTemplateColumns = window.innerWidth < 650 ? '1fr' : '1fr 1fr';
});
window.dispatchEvent(new Event('resize'));
