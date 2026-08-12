// ── Config
const DATA_VERSION  = '7';
const GITHUB_REPO   = 'brjidweoio/sadasddasdsa';
const RAW_FIXED_URL = () => `https://raw.githubusercontent.com/${GITHUB_REPO}/main/public/fixed.json?t=${Date.now()}`;
const RAW_DATA_URL  = () => `https://raw.githubusercontent.com/${GITHUB_REPO}/main/public/data.json?t=${Date.now()}`;
const FN_URL        = '/.netlify/functions/toggle-fixed';

// ── State
let nick         = '';
let vulns        = [];
let fixedMap     = {};
let activeSite   = 'all';
let activeStatus = 'all';
let selectedSeverity = 'critical';
let toggling     = false;

// ── Init
window.addEventListener('DOMContentLoaded', async () => {
  if (localStorage.getItem('vt_version') !== DATA_VERSION) {
    localStorage.removeItem('vt_vulns');
    localStorage.setItem('vt_version', DATA_VERSION);
  }
  nick = localStorage.getItem('vt_nick') || '';

  await Promise.all([loadVulns(), loadFixed()]);

  if (nick) showMain();

  bindEvents();
});

async function loadVulns() {
  const stored = localStorage.getItem('vt_vulns');
  if (stored) { try { vulns = JSON.parse(stored); return; } catch {} }
  try {
    const r = await fetch(RAW_DATA_URL());
    vulns = await r.json();
    localStorage.setItem('vt_vulns', JSON.stringify(vulns));
  } catch { vulns = []; }
}

async function loadFixed() {
  try {
    const r = await fetch(RAW_FIXED_URL());
    if (r.ok) fixedMap = await r.json();
  } catch { fixedMap = {}; }
}

// ── Nick
function showMain() {
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('main-screen').classList.remove('hidden');
  render();
}

// ── Events
function bindEvents() {
  document.getElementById('nick-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') submitNick();
  });
  document.getElementById('nick-btn').addEventListener('click', submitNick);

  document.querySelectorAll('.site-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.site-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeSite = btn.dataset.site;
      render();
    });
  });

  document.querySelectorAll('.status-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.status-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeStatus = btn.dataset.status;
      render();
    });
  });

  document.getElementById('add-btn').addEventListener('click', openAddModal);
  document.getElementById('modal-close').addEventListener('click', closeAddModal);
  document.getElementById('modal').addEventListener('click', e => {
    if (e.target === document.getElementById('modal')) closeAddModal();
  });

  document.querySelectorAll('.sev-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.sev-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedSeverity = btn.dataset.sev;
    });
  });

  document.getElementById('form-submit').addEventListener('click', submitVuln);
}

function submitNick() {
  const val = document.getElementById('nick-input').value.trim();
  if (!val) return;
  nick = val;
  localStorage.setItem('vt_nick', nick);
  showMain();
}

// ── Add modal
function openAddModal() {
  document.getElementById('modal').classList.remove('hidden');
  document.getElementById('form-title').focus();
}

function closeAddModal() {
  document.getElementById('modal').classList.add('hidden');
  document.getElementById('form-title').value = '';
  document.getElementById('form-desc').value  = '';
  document.querySelectorAll('.sev-btn').forEach(b => b.classList.remove('active'));
  document.querySelector('.sev-btn[data-sev="critical"]').classList.add('active');
  selectedSeverity = 'critical';
}

function submitVuln() {
  const site  = document.getElementById('form-site').value;
  const title = document.getElementById('form-title').value.trim();
  const desc  = document.getElementById('form-desc').value.trim();
  if (!title) {
    const inp = document.getElementById('form-title');
    inp.focus();
    inp.style.borderColor = 'var(--red)';
    setTimeout(() => { inp.style.borderColor = ''; }, 1500);
    return;
  }
  const v = {
    id: Date.now(), site, title,
    description: desc,
    severity: selectedSeverity,
    date: new Date().toISOString().split('T')[0],
    addedBy: nick
  };
  vulns.unshift(v);
  localStorage.setItem('vt_vulns', JSON.stringify(vulns));
  closeAddModal();
  render();
}

// ── Toggle fixed (global via Netlify Function)
async function toggleFixed(id) {
  if (toggling) return;
  toggling = true;

  const key     = String(id);
  const isFixed = !!fixedMap[key];
  const action  = isFixed ? 'unfix' : 'fix';

  // Optimistic update
  const prev = Object.assign({}, fixedMap);
  if (action === 'fix') {
    fixedMap[key] = { nick, date: new Date().toISOString().split('T')[0] };
  } else {
    delete fixedMap[key];
  }
  render();

  try {
    const res = await fetch(FN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, nick, action })
    });

    if (res.ok) {
      fixedMap = await res.json();
    } else {
      fixedMap = prev;
    }
  } catch {
    fixedMap = prev;
  }

  toggling = false;
  render();
}

// ── Render
function render() {
  const list = document.getElementById('vuln-list');

  let filtered = vulns.slice();
  if (activeSite !== 'all')    filtered = filtered.filter(v => v.site === activeSite);
  if (activeStatus === 'open') filtered = filtered.filter(v => !fixedMap[String(v.id)]);
  if (activeStatus === 'fixed') filtered = filtered.filter(v => !!fixedMap[String(v.id)]);

  const base = activeSite === 'all' ? vulns : vulns.filter(v => v.site === activeSite);
  document.getElementById('count-all').textContent   = base.length;
  document.getElementById('count-open').textContent  = base.filter(v => !fixedMap[String(v.id)]).length;
  document.getElementById('count-fixed').textContent = base.filter(v => !!fixedMap[String(v.id)]).length;

  if (filtered.length === 0) {
    list.innerHTML = `<div class="empty-state"><p>Уязвимостей не найдено</p></div>`;
    return;
  }

  list.innerHTML = filtered.map(v => {
    const key     = String(v.id);
    const isFixed = !!fixedMap[key];
    const fixer   = fixedMap[key];
    return `
      <div class="vuln-card ${isFixed ? 'fixed' : ''}" data-id="${v.id}" onclick="toggleFixed(${v.id})">
        <div class="vuln-checkbox">${isFixed ? '&#10003;' : ''}</div>
        <div class="vuln-body">
          <div class="vuln-meta">
            <span class="site-badge site-${v.site}">${v.site}</span>
            <span class="sev-badge sev-${v.severity}">${sevLabel(v.severity)}</span>
            <span class="vuln-date">${v.date}</span>
          </div>
          <div class="vuln-title">${escHtml(v.title)}</div>
          ${v.description ? `<div class="vuln-desc">${escHtml(v.description)}</div>` : ''}
          ${isFixed ? `<div class="fixer-info">Исправлено: ${escHtml(fixer.nick)}, ${fixer.date}</div>` : ''}
          ${v.addedBy ? `<div class="vuln-added">Добавил: ${escHtml(v.addedBy)}</div>` : ''}
        </div>
      </div>`;
  }).join('');
}

function sevLabel(sev) {
  return { critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low' }[sev] || sev;
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
