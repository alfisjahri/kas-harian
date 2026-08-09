import './style.css';
import { 
  CATEGORIES,
  getCloudConfig, 
  saveCloudConfig, 
  fetchTransactions, 
  addTransaction, 
  batchAddTransactions,
  updateTransaction, 
  deleteTransaction 
} from './dbAdapter.js';

// --- SERVICE WORKER REGISTRATION ---
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(err => console.log('SW reg error:', err));
}

let cachedTransactions = [];
let isPitisHidden = true;
let cachedSisaPitisFormatted = "Rp 0";
let cachedPemasukanFormatted = "Rp 0";
let cachedPengeluaranFormatted = "Rp 0";
let currentActiveTab = 'catat';

// --- AUTO CATEGORIZATION KEYWORDS ---
const AUTO_CAT_KEYWORDS = {
  makanan: ['makan', 'minum', 'kopi', 'nasi', 'cafe', 'resto', 'warung', 'food', 'snack', 'roti', 'bakso', 'mie', 'sate', 'pizza', 'ayam', 'teh', 'boba', 'es', 'kantin'],
  transportasi: ['bensin', 'pertamax', 'pertalite', 'parkir', 'tol', 'grab', 'gojek', 'maxim', 'indrive', 'ojek', 'taksi', 'angkot', 'bus', 'kereta', 'servis', 'oli'],
  tagihan: ['listrik', 'pln', 'wifi', 'indihome', 'biznet', 'pulsa', 'kuota', 'air', 'pdam', 'bpjs', 'iuran', 'pajak', 'sewa', 'kontrakan', 'kost'],
  belanja: ['baju', 'celana', 'sepatu', 'tokopedia', 'shopee', 'lazada', 'tiktok', 'indomaret', 'alfamart', 'supermarket', 'mall', 'skincare', 'makeup'],
  hiburan: ['bioskop', 'xxi', 'cinema', 'game', 'steam', 'netflix', 'spotify', 'youtube', 'liburan', 'travel', 'hotel', 'konser', 'topup'],
  kesehatan: ['obat', 'apotek', 'dokter', 'klinik', 'rumah sakit', 'vitamin', 'lab', 'dental', 'gigi'],
  gaji: ['gaji', 'salary', 'bonus', 'freelance', 'project', 'honor', 'insentif', 'thr', 'dividen', 'omzet'],
  investasi: ['tabungan', 'reksadana', 'saham', 'crypto', 'bibit', 'bareksa', 'deposito', 'emas', 'transfer']
};

function autoDetectCategory(text) {
  if (!text) return null;
  const str = text.toLowerCase();
  for (const [catKey, keywords] of Object.entries(AUTO_CAT_KEYWORDS)) {
    if (keywords.some(kw => str.includes(kw))) {
      return catKey;
    }
  }
  return null;
}

// --- THEME MANAGEMENT ---
function initTheme() {
  const savedTheme = localStorage.getItem('pitis-theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const isDark = savedTheme ? savedTheme === 'dark' : prefersDark;

  setTheme(isDark ? 'dark' : 'light');
}

function setTheme(theme) {
  const html = document.documentElement;
  const icon = document.getElementById('theme-toggle-icon');

  if (theme === 'dark') {
    html.classList.add('dark');
    if (icon) icon.innerText = '☀️';
  } else {
    html.classList.remove('dark');
    if (icon) icon.innerText = '🌙';
  }
  localStorage.setItem('pitis-theme', theme);
}

function toggleTheme() {
  const isDark = document.documentElement.classList.contains('dark');
  setTheme(isDark ? 'light' : 'dark');
}

// --- TAB SWITCHER ---
function switchTab(tabName) {
  const panes = document.querySelectorAll('.tab-pane');
  panes.forEach(pane => pane.classList.add('hidden'));

  const targetPane = document.getElementById(`tab-pane-${tabName}`);
  if (targetPane) {
    targetPane.classList.remove('hidden');
    targetPane.classList.add('animate-fade-in');
  }

  const navBtns = document.querySelectorAll('.btn-tab-nav');
  navBtns.forEach(btn => {
    const isTarget = btn.getAttribute('data-tab') === tabName;
    if (isTarget) {
      btn.className = 'btn-tab-nav flex flex-col items-center justify-center py-1.5 px-1 rounded-xl text-indigo-600 dark:text-indigo-400 font-bold bg-indigo-500/10 border border-indigo-500/20 shadow-sm transition-all scale-105';
    } else {
      btn.className = 'btn-tab-nav flex flex-col items-center justify-center py-1.5 px-1 rounded-xl text-slate-500 dark:text-slate-400 font-medium hover:text-indigo-600 dark:hover:text-indigo-400 transition-all';
    }
  });

  currentActiveTab = tabName;
  renderFilteredList();
}

// --- UTILITY: DEBOUNCE ---
function debounce(fn, delay = 150) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

// --- INITIALIZATION ---
window.addEventListener('DOMContentLoaded', async () => {
  initTheme();

  const dateInput = document.getElementById('tx-date');
  if (dateInput) dateInput.valueAsDate = new Date();

  // Tab Navigation Event Listeners
  document.querySelectorAll('.btn-tab-nav').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.getAttribute('data-tab');
      if (tab) switchTab(tab);
    });
  });

  document.querySelectorAll('.btn-switch-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.getAttribute('data-target');
      if (target) switchTab(target);
    });
  });

  // Header & Cloud Listeners
  document.getElementById('btn-theme-toggle')?.addEventListener('click', toggleTheme);
  document.getElementById('btn-cloud-config')?.addEventListener('click', openCloudModal);
  document.getElementById('btn-banner-cloud')?.addEventListener('click', openCloudModal);
  document.getElementById('btn-close-cloud-modal')?.addEventListener('click', closeCloudModal);
  document.getElementById('btn-open-gas-guide')?.addEventListener('click', openGasModal);
  document.getElementById('btn-close-gas-modal')?.addEventListener('click', closeGasModal);
  document.getElementById('btn-close-gas-guide')?.addEventListener('click', closeGasModal);
  document.getElementById('btn-copy-gas-code')?.addEventListener('click', copyGasCode);

  document.getElementById('cloud-config-form')?.addEventListener('submit', handleSaveCloudConfig);

  // Backup & Reset Listeners
  document.getElementById('btn-export-json')?.addEventListener('click', handleExportJSON);
  document.getElementById('json-file-input')?.addEventListener('change', handleImportJSON);
  document.getElementById('btn-reset-local-data')?.addEventListener('click', handleResetLocalData);

  // Budget Modal Listeners
  document.getElementById('btn-set-budget')?.addEventListener('click', openBudgetModal);
  document.getElementById('btn-close-budget-modal')?.addEventListener('click', closeBudgetModal);
  document.getElementById('budget-form')?.addEventListener('submit', handleSaveBudget);
  document.getElementById('btn-clear-budget')?.addEventListener('click', handleClearBudget);

  // Quick Amount Presets
  document.querySelectorAll('.quick-amt-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const addVal = Number(btn.getAttribute('data-add') || 0);
      const amountInput = document.getElementById('tx-amount');
      if (amountInput) {
        const current = Number(amountInput.value || 0);
        amountInput.value = current + addVal;
      }
    });
  });

  // Description input Auto-categorization
  const descInput = document.getElementById('tx-desc');
  descInput?.addEventListener('input', (e) => {
    const detected = autoDetectCategory(e.target.value);
    const catSelect = document.getElementById('tx-category');
    const badge = document.getElementById('auto-cat-badge');

    if (detected && catSelect) {
      catSelect.value = detected;
      if (badge) badge.classList.remove('hidden');
    } else {
      if (badge) badge.classList.add('hidden');
    }
  });

  // Radio provider change
  const providerRadios = document.querySelectorAll('input[name="cloud-provider"]');
  providerRadios.forEach(radio => {
    radio.addEventListener('change', (e) => toggleProviderFields(e.target.value));
  });

  // Toggle Sensor Angka Nominal
  document.querySelectorAll('#card-sisa-pitis, #card-sisa-pitis-mini, #btn-toggle-eye').forEach(el => {
    el?.addEventListener('click', (e) => {
      e.stopPropagation();
      isPitisHidden = !isPitisHidden;
      updatePitisDisplay();
    });
  });

  // Populate Dropdown Tahun
  const currentYear = new Date().getFullYear();
  const yearSelectors = ['picker-quarter-year', 'picker-semester-year', 'picker-year-only'];
  yearSelectors.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.innerHTML = '';
    for (let y = currentYear; y >= currentYear - 5; y--) {
      el.innerHTML += `<option value="${y}">${y}</option>`;
    }
  });

  const today = new Date();
  const currentYM = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  const monthPicker = document.getElementById('picker-month');
  if (monthPicker) monthPicker.value = currentYM;

  document.getElementById('filter-type')?.addEventListener('change', handleFilterTypeChange);
  document.getElementById('picker-submonth')?.addEventListener('change', (e) => {
    const dayPicker = document.getElementById('picker-specific-day');
    if (e.target.value === 'custom_day') dayPicker?.classList.remove('hidden');
    else dayPicker?.classList.add('hidden');
    renderFilteredList();
  });

  ['picker-month', 'picker-specific-day', 'picker-quarter-year', 'picker-quarter-q', 
   'picker-semester-year', 'picker-semester-s', 'picker-year-only', 
   'filter-category', 'filter-tx-type', 'sort-order'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', renderFilteredList);
  });

  document.getElementById('btn-cancel-edit')?.addEventListener('click', resetForm);
  document.getElementById('btn-import-csv')?.addEventListener('click', handleImportCSV);
  
  document.getElementById('csv-file-input')?.addEventListener('change', (e) => {
    const fileNameEl = document.getElementById('csv-file-name');
    const file = e.target.files?.[0];
    if (file && fileNameEl) {
      fileNameEl.innerText = `📄 ${file.name}`;
    }
  });
  
  const searchInput = document.getElementById('search-tx');
  if (searchInput) {
    searchInput.addEventListener('input', debounce(renderFilteredList, 150));
  }

  document.getElementById('btn-export-csv')?.addEventListener('click', handleExportCSV);
  document.getElementById('tx-form')?.addEventListener('submit', handleSaveTx);

  // Event Delegation Edit & Delete
  document.querySelectorAll('#tx-list, #tx-recent-list').forEach(container => {
    container?.addEventListener('click', (e) => {
      const target = e.target.closest('[data-action]');
      if (!target) return;
      const action = target.getAttribute('data-action');
      const id = target.getAttribute('data-id');

      if (action === 'edit') prepareEdit(id);
      else if (action === 'delete') handleDelete(id);
    });
  });

  // Default initial tab: Catat
  switchTab('catat');
  updateCloudStatusUI();
  await loadTransactions();
});

function handleFilterTypeChange(e) {
  const type = e.target.value;
  document.getElementById('ctrl-month')?.classList.toggle('hidden', type !== 'month');
  document.getElementById('ctrl-quarter')?.classList.toggle('hidden', type !== 'quarter');
  document.getElementById('ctrl-semester')?.classList.toggle('hidden', type !== 'semester');
  document.getElementById('ctrl-year')?.classList.toggle('hidden', type !== 'year');
  renderFilteredList();
}

// --- MODALS CONTROLLER ---
function openCloudModal() {
  const config = getCloudConfig();
  const modal = document.getElementById('cloud-modal');
  const radio = document.querySelector(`input[name="cloud-provider"][value="${config.provider}"]`);
  if (radio) radio.checked = true;

  document.getElementById('cfg-gas-url').value = config.gasUrl || '';
  document.getElementById('cfg-supabase-url').value = config.supabaseUrl || '';
  document.getElementById('cfg-supabase-key').value = config.supabaseAnonKey || '';

  toggleProviderFields(config.provider);
  modal?.classList.remove('hidden');
}

function closeCloudModal() {
  document.getElementById('cloud-modal')?.classList.add('hidden');
}

function openGasModal() {
  document.getElementById('gas-modal')?.classList.remove('hidden');
}

function closeGasModal() {
  document.getElementById('gas-modal')?.classList.add('hidden');
}

function openBudgetModal() {
  const currentLimit = localStorage.getItem('pitis_budget_limit') || '';
  document.getElementById('input-budget-limit').value = currentLimit;
  document.getElementById('budget-modal')?.classList.remove('hidden');
}

function closeBudgetModal() {
  document.getElementById('budget-modal')?.classList.add('hidden');
}

function copyGasCode() {
  const codeText = document.getElementById('gas-code-block')?.innerText || '';
  navigator.clipboard.writeText(codeText).then(() => {
    showToast("Kode Google Apps Script berhasil disalin!", "success");
  }).catch(() => {
    showToast("Gagal menyalin kode. Silakan salin manual.", "error");
  });
}

function toggleProviderFields(provider) {
  const gasGroup = document.getElementById('group-gas-input');
  const supabaseGroup = document.getElementById('group-supabase-input');
  gasGroup?.classList.toggle('hidden', provider !== 'gas');
  supabaseGroup?.classList.toggle('hidden', provider !== 'supabase');
}

async function handleSaveCloudConfig(e) {
  e.preventDefault();
  const prevConfig = getCloudConfig();
  const selectedProvider = document.querySelector('input[name="cloud-provider"]:checked')?.value || 'local';
  const gasUrl = document.getElementById('cfg-gas-url').value.trim();
  const supabaseUrl = document.getElementById('cfg-supabase-url').value.trim();
  const supabaseAnonKey = document.getElementById('cfg-supabase-key').value.trim();

  if (selectedProvider === 'gas' && !gasUrl) {
    showToast("Masukkan URL Google Apps Script WebApp kamu!", "error");
    return;
  }

  if (selectedProvider === 'supabase' && (!supabaseUrl || !supabaseAnonKey)) {
    showToast("Masukkan Supabase URL & Anon Key kamu!", "error");
    return;
  }

  saveCloudConfig({ provider: selectedProvider, gasUrl, supabaseUrl, supabaseAnonKey });
  showToast("Pengaturan Cloud Database disimpan!", "success");
  closeCloudModal();
  updateCloudStatusUI();

  if (prevConfig.provider === 'local' && selectedProvider !== 'local') {
    try {
      const localRaw = localStorage.getItem('pitis_local_transactions');
      if (localRaw) {
        const localList = JSON.parse(localRaw);
        if (Array.isArray(localList) && localList.length > 0) {
          const isSync = await showConfirm(`Kamu memiliki ${localList.length} transaksi di mode offline. Upload semua data ke cloud sekarang?`);
          if (isSync) {
            showToast(`Mengunggah ${localList.length} transaksi...`, "info");
            await batchAddTransactions(localList);
            showToast("Berhasil men-sinkronkan semua data ke cloud!", "success");
          }
        }
      }
    } catch (err) {
      console.error("Gagal sync data lokal ke cloud:", err);
    }
  }

  await loadTransactions();
}

function updateCloudStatusUI() {
  const config = getCloudConfig();
  const statusEl = document.getElementById('user-status');
  const banner = document.getElementById('cloud-info-banner');

  if (config.provider === 'gas' && config.gasUrl) {
    if (statusEl) {
      statusEl.innerText = "Google Sheets";
      statusEl.className = "text-[11px] text-indigo-600 dark:text-indigo-400 font-semibold truncate";
    }
    banner?.classList.add('hidden');
  } else if (config.provider === 'supabase' && config.supabaseUrl) {
    if (statusEl) {
      statusEl.innerText = "Supabase Cloud";
      statusEl.className = "text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold truncate";
    }
    banner?.classList.add('hidden');
  } else {
    if (statusEl) {
      statusEl.innerText = "Mode Offline";
      statusEl.className = "text-[11px] text-slate-500 dark:text-slate-400 font-medium truncate";
    }
    banner?.classList.remove('hidden');
  }
}

function updatePitisDisplay() {
  const statSisaEl = document.getElementById('stat-sisa');
  const statSisaMiniEl = document.getElementById('stat-sisa-mini');
  const statPemasukan = document.getElementById('stat-pemasukan');
  const statPengeluaran = document.getElementById('stat-pengeluaran');
  const eyeLabelEl = document.getElementById('pitis-eye-label');

  if (isPitisHidden) {
    if (statSisaEl) statSisaEl.innerText = "Rp •••••••";
    if (statSisaMiniEl) statSisaMiniEl.innerText = "Rp •••••••";
    if (statPemasukan) statPemasukan.innerText = "Rp •••••••";
    if (statPengeluaran) statPengeluaran.innerText = "Rp •••••••";
    if (eyeLabelEl) eyeLabelEl.innerText = "Tampilkan";
  } else {
    if (statSisaEl) statSisaEl.innerText = cachedSisaPitisFormatted;
    if (statSisaMiniEl) statSisaMiniEl.innerText = cachedSisaPitisFormatted;
    if (statPemasukan) statPemasukan.innerText = cachedPemasukanFormatted;
    if (statPengeluaran) statPengeluaran.innerText = cachedPengeluaranFormatted;
    if (eyeLabelEl) eyeLabelEl.innerText = "Sembunyikan";
  }
}

// --- DATE PARSER HELPER ---
function normalizeDate(raw) {
  if (!raw) return { year: NaN, month: NaN, dateNum: NaN, ymd: '' };
  let str = raw.toString().trim();
  if (str.includes('T')) str = str.split('T')[0];

  let year = NaN, month = NaN, dateNum = NaN;

  if (str.includes('-')) {
    const parts = str.split('-');
    if (parts[0].length === 4) {
      year = Number(parts[0]);
      month = Number(parts[1]);
      dateNum = Number(parts[2]);
    } else if (parts[2].length === 4) {
      year = Number(parts[2]);
      month = Number(parts[1]);
      dateNum = Number(parts[0]);
    }
  } else if (str.includes('/')) {
    const parts = str.split('/');
    if (parts[2].length === 4) {
      year = Number(parts[2]);
      const p0 = Number(parts[0]);
      const p1 = Number(parts[1]);
      if (p0 > 12) {
        dateNum = p0;
        month = p1;
      } else {
        month = p0;
        dateNum = p1;
      }
    } else if (parts[0].length === 4) {
      year = Number(parts[0]);
      month = Number(parts[1]);
      dateNum = Number(parts[2]);
    }
  }

  if (isNaN(year) || isNaN(month) || isNaN(dateNum)) {
    const d = new Date(str);
    if (!isNaN(d.getTime())) {
      year = d.getFullYear();
      month = d.getMonth() + 1;
      dateNum = d.getDate();
    }
  }

  const ymd = (!isNaN(year) && !isNaN(month) && !isNaN(dateNum))
    ? `${year}-${String(month).padStart(2, '0')}-${String(dateNum).padStart(2, '0')}`
    : str;

  return { year, month, dateNum, ymd };
}

// --- FETCH & LOAD DATA ---
async function loadTransactions() {
  try {
    cachedTransactions = await fetchTransactions();
  } catch (err) {
    showToast(err.message, "error");
    cachedTransactions = [];
  }
  renderFilteredList();
}

// --- BUDGET SECTION RENDERER ---
function renderBudgetSection(monthlyExpense) {
  const limitStr = localStorage.getItem('pitis_budget_limit');
  const limit = Number(limitStr || 0);

  const usedText = document.getElementById('budget-used-text');
  const targetText = document.getElementById('budget-target-text');
  const bar = document.getElementById('budget-bar');
  const msg = document.getElementById('budget-status-msg');

  if (!usedText || !targetText || !bar || !msg) return;

  if (limit <= 0) {
    usedText.innerText = `Pengeluaran: ${formatRp(monthlyExpense)}`;
    targetText.innerText = `Limit: Belum di-set`;
    bar.style.width = '0%';
    msg.innerHTML = `<span>Set limit bulanan agar pengeluaran kamu terkontrol!</span>`;
    return;
  }

  const pct = Math.min(Math.round((monthlyExpense / limit) * 100), 100);
  const actualPct = Math.round((monthlyExpense / limit) * 100);

  usedText.innerText = `Pengeluaran: ${formatRp(monthlyExpense)}`;
  targetText.innerText = `Limit: ${formatRp(limit)}`;
  bar.style.width = `${pct}%`;

  if (actualPct >= 100) {
    bar.className = 'h-full bg-rose-500 rounded-full transition-all duration-500';
    msg.innerHTML = `<span class="text-rose-600 dark:text-rose-400 font-bold">⚠️ Over Budget! (${actualPct}%)</span><span>Melewati limit ${formatRp(limit)}</span>`;
  } else if (actualPct >= 80) {
    bar.className = 'h-full bg-amber-500 rounded-full transition-all duration-500';
    msg.innerHTML = `<span class="text-amber-600 dark:text-amber-400 font-semibold">⚠️ Mendekati Limit (${actualPct}%)</span><span>Sisa budget ${formatRp(limit - monthlyExpense)}</span>`;
  } else {
    bar.className = 'h-full bg-emerald-500 rounded-full transition-all duration-500';
    msg.innerHTML = `<span class="text-emerald-600 dark:text-emerald-400 font-semibold">✅ Budget Aman (${actualPct}%)</span><span>Sisa budget ${formatRp(limit - monthlyExpense)}</span>`;
  }
}

// --- DONUT CHART RENDERER (SVG) ---
function renderCategoryDonutChart(filteredTx) {
  const chartSvg = document.getElementById('category-donut-chart');
  const legendEl = document.getElementById('category-legend');
  const centerVal = document.getElementById('donut-center-val');
  if (!chartSvg || !legendEl || !centerVal) return;

  const categoryTotals = {};
  let totalExpense = 0;

  filteredTx.forEach(t => {
    if (t.type === 'pengeluaran') {
      const cat = t.category || 'lainnya';
      const amt = Number(t.amount);
      categoryTotals[cat] = (categoryTotals[cat] || 0) + amt;
      totalExpense += amt;
    }
  });

  centerVal.innerText = formatRp(totalExpense);

  if (totalExpense === 0) {
    chartSvg.innerHTML = `<circle cx="50" cy="50" r="35" fill="none" stroke="#e2e8f0" stroke-width="12" class="dark:stroke-slate-800" />`;
    legendEl.innerHTML = `<p class="col-span-2 text-[11px] text-slate-400 text-center py-2">Belum ada data pengeluaran.</p>`;
    return;
  }

  const sliceColors = {
    makanan: '#10b981',
    transportasi: '#3b82f6',
    tagihan: '#f59e0b',
    belanja: '#a855f7',
    hiburan: '#ec4899',
    kesehatan: '#ef4444',
    gaji: '#14b8a6',
    investasi: '#6366f1',
    lainnya: '#64748b'
  };

  const circumference = 2 * Math.PI * 35; // ~219.91
  let accumulatedAngle = 0;
  let svgContent = '';
  let legendContent = '';

  const sortedCats = Object.entries(categoryTotals).sort((a, b) => b[1] - a[1]);

  sortedCats.forEach(([catKey, amt]) => {
    const ratio = amt / totalExpense;
    const dashLength = ratio * circumference;
    const dashOffset = -accumulatedAngle;
    accumulatedAngle += dashLength;

    const color = sliceColors[catKey] || '#64748b';
    const catInfo = CATEGORIES[catKey] || CATEGORIES.lainnya;
    const pctStr = (ratio * 100).toFixed(1) + '%';

    svgContent += `
      <circle cx="50" cy="50" r="35" fill="none" stroke="${color}" stroke-width="12"
        stroke-dasharray="${dashLength} ${circumference - dashLength}"
        stroke-dashoffset="${dashOffset}"
        class="transition-all duration-500 hover:opacity-80 cursor-pointer" />
    `;

    legendContent += `
      <div class="flex items-center justify-between p-1.5 rounded-lg border border-slate-200/60 dark:border-slate-800/60 bg-white/50 dark:bg-slate-900/40">
        <div class="flex items-center gap-1.5 min-w-0">
          <span class="w-2.5 h-2.5 rounded-full flex-shrink-0" style="background-color: ${color}"></span>
          <span class="truncate text-[11px] font-medium text-slate-700 dark:text-slate-300">${catInfo.icon} ${catInfo.name}</span>
        </div>
        <span class="font-mono text-[10px] font-bold text-slate-800 dark:text-slate-200 ml-1">${pctStr}</span>
      </div>
    `;
  });

  chartSvg.innerHTML = svgContent;
  legendEl.innerHTML = legendContent;
}

// --- RENDER FILTERED LIST & METRICS ---
function renderFilteredList() {
  const transactions = cachedTransactions;

  // 1. SALDO KAS GLOBAL
  let globalMasuk = 0;
  let globalKeluar = 0;

  for (let i = 0; i < transactions.length; i++) {
    const t = transactions[i];
    if (t.type === 'pemasukan') globalMasuk += Number(t.amount);
    else globalKeluar += Number(t.amount);
  }

  const totalSisaKasGlobal = globalMasuk - globalKeluar;
  cachedSisaPitisFormatted = formatRp(totalSisaKasGlobal);
  updatePitisDisplay();

  // 2. REKAPAN PERIODE & FILTERED
  const filtered = getFilteredData(transactions);

  let totalMasukPeriode = 0;
  let totalKeluarPeriode = 0;
  let maxExpense = 0;
  const uniqueDates = new Set();

  for (let i = 0; i < filtered.length; i++) {
    const t = filtered[i];
    const amt = Number(t.amount);
    if (t.date) uniqueDates.add(t.date);

    if (t.type === 'pemasukan') {
      totalMasukPeriode += amt;
    } else {
      totalKeluarPeriode += amt;
      if (amt > maxExpense) maxExpense = amt;
    }
  }

  cachedPemasukanFormatted = formatRp(totalMasukPeriode);
  cachedPengeluaranFormatted = formatRp(totalKeluarPeriode);
  updatePitisDisplay();

  // 3. INSIGHT METRICS
  const avgDaily = uniqueDates.size > 0 ? totalKeluarPeriode / uniqueDates.size : 0;
  const metricAvgEl = document.getElementById('metric-avg-daily');
  const metricMaxEl = document.getElementById('metric-max-expense');
  const metricCountEl = document.getElementById('metric-count');

  if (metricAvgEl) metricAvgEl.innerText = formatRp(avgDaily);
  if (metricMaxEl) metricMaxEl.innerText = formatRp(maxExpense);
  if (metricCountEl) metricCountEl.innerText = filtered.length;

  // 4. BUDGET & DONUT CHART UPDATE
  renderBudgetSection(totalKeluarPeriode);
  renderCategoryDonutChart(filtered);

  // 5. RENDER TRANSACTIONS CARDS FOR FULL HISTORY (TAB 2)
  const listContainer = document.getElementById('tx-list');
  if (listContainer) {
    if (filtered.length === 0) {
      listContainer.innerHTML = `<p class="text-xs text-slate-500 dark:text-slate-400 text-center py-6">Belum ada transaksi di periode ini.</p>`;
    } else {
      const fragment = document.createDocumentFragment();
      for (let i = 0; i < filtered.length; i++) {
        fragment.appendChild(createTxCard(filtered[i]));
      }
      listContainer.replaceChildren(fragment);
    }
  }

  // 6. RENDER RECENT 3 TRANSACTIONS (TAB 1 CATAT)
  const recentContainer = document.getElementById('tx-recent-list');
  if (recentContainer) {
    const recentTx = transactions.slice(0, 3);
    if (recentTx.length === 0) {
      recentContainer.innerHTML = `<p class="text-[11px] text-slate-400 text-center py-3">Belum ada transaksi recorded.</p>`;
    } else {
      const recentFragment = document.createDocumentFragment();
      for (let i = 0; i < recentTx.length; i++) {
        recentFragment.appendChild(createTxCard(recentTx[i]));
      }
      recentContainer.replaceChildren(recentFragment);
    }
  }
}

function createTxCard(t) {
  const isIncome = t.type === 'pemasukan';
  const catInfo = CATEGORIES[t.category] || CATEGORIES.lainnya;

  const card = document.createElement('div');
  card.className = 'flex justify-between items-center p-3 border border-slate-200/80 dark:border-slate-800/80 rounded-xl bg-white/80 dark:bg-slate-900/60 backdrop-blur-sm text-sm hover:border-slate-300 dark:hover:border-slate-700/80 transition-all duration-150 animate-fade-in';
  card.innerHTML = `
    <div class="space-y-1 min-w-0 flex-1 mr-2">
      <div class="flex items-center gap-1.5">
        <span class="px-2 py-0.5 rounded-md text-[10px] font-semibold border ${catInfo.bg}">
          ${catInfo.icon} ${catInfo.name}
        </span>
      </div>
      <p class="font-semibold text-slate-800 dark:text-slate-100 truncate">${escapeHtml(t.description)}</p>
      <p class="text-[11px] text-slate-400 dark:text-slate-500 font-mono">${t.date}</p>
    </div>
    <div class="text-right flex-shrink-0">
      <p class="font-bold font-mono ${isIncome ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}">
        ${isIncome ? '+' : '-'} ${formatRp(t.amount)}
      </p>
      <div class="space-x-2 text-xs mt-1">
        <button data-action="edit" data-id="${t.id}" class="text-indigo-600 dark:text-indigo-400 hover:underline font-medium">Edit</button>
        <button data-action="delete" data-id="${t.id}" class="text-rose-600 dark:text-rose-400 hover:underline font-medium">Hapus</button>
      </div>
    </div>
  `;
  return card;
}

function getFilteredData(data) {
  const mode = document.getElementById('filter-type')?.value || 'month';
  const categoryFilter = document.getElementById('filter-category')?.value || 'all';
  const typeFilter = document.getElementById('filter-tx-type')?.value || 'all';
  const searchQuery = (document.getElementById('search-tx')?.value || '').toLowerCase();
  const sortOrder = document.getElementById('sort-order')?.value || 'newest';

  const filtered = data.filter(t => {
    if (searchQuery && !t.description.toLowerCase().includes(searchQuery)) {
      return false;
    }

    if (categoryFilter !== 'all' && (t.category || 'lainnya') !== categoryFilter) {
      return false;
    }

    if (typeFilter !== 'all' && t.type !== typeFilter) {
      return false;
    }

    if (mode === 'all') return true;

    const { year, month, dateNum, ymd } = normalizeDate(t.date);
    if (isNaN(year) || isNaN(month)) return true;

    if (mode === 'month') {
      const ymVal = document.getElementById('picker-month')?.value;
      if (!ymVal) return true;
      const [targetY, targetM] = ymVal.split('-').map(Number);
      if (year !== targetY || month !== targetM) return false;

      const sub = document.getElementById('picker-submonth')?.value;
      if (sub === 'w1') return dateNum >= 1 && dateNum <= 7;
      if (sub === 'w2') return dateNum >= 8 && dateNum <= 14;
      if (sub === 'w3') return dateNum >= 15 && dateNum <= 21;
      if (sub === 'w4') return dateNum >= 22;
      if (sub === 'custom_day') {
        const dayVal = document.getElementById('picker-specific-day')?.value;
        return dayVal ? ymd === dayVal : true;
      }
      return true;

    } else if (mode === 'quarter') {
      const qYear = Number(document.getElementById('picker-quarter-year')?.value);
      const qVal = document.getElementById('picker-quarter-q')?.value;
      if (year !== qYear) return false;
      if (qVal === 'q1') return month >= 1 && month <= 3;
      if (qVal === 'q2') return month >= 4 && month <= 6;
      if (qVal === 'q3') return month >= 7 && month <= 9;
      if (qVal === 'q4') return month >= 10 && month <= 12;

    } else if (mode === 'semester') {
      const sYear = Number(document.getElementById('picker-semester-year')?.value);
      const sVal = document.getElementById('picker-semester-s')?.value;
      if (year !== sYear) return false;
      if (sVal === 's1') return month >= 1 && month <= 6;
      if (sVal === 's2') return month >= 7 && month <= 12;

    } else if (mode === 'year') {
      const yVal = Number(document.getElementById('picker-year-only')?.value);
      return year === yVal;
    }

    return true;
  });

  // Sortasi Data
  filtered.sort((a, b) => {
    if (sortOrder === 'highest') return Number(b.amount) - Number(a.amount);
    if (sortOrder === 'lowest') return Number(a.amount) - Number(b.amount);

    const ymdA = normalizeDate(a.date).ymd || String(a.date);
    const ymdB = normalizeDate(b.date).ymd || String(b.date);

    if (ymdA !== ymdB) {
      return sortOrder === 'newest' ? ymdB.localeCompare(ymdA) : ymdA.localeCompare(ymdB);
    }

    const idA = String(a.id || '');
    const idB = String(b.id || '');
    return sortOrder === 'newest' ? idB.localeCompare(idA) : idA.localeCompare(idB);
  });

  return filtered;
}

// --- BUDGET SAVE & CLEAR ---
function handleSaveBudget(e) {
  e.preventDefault();
  const val = Number(document.getElementById('input-budget-limit').value || 0);
  if (val < 0) {
    showToast("Limit budget harus berupa angka positif!", "error");
    return;
  }
  localStorage.setItem('pitis_budget_limit', val);
  showToast("Limit budget bulanan berhasil disimpan!", "success");
  closeBudgetModal();
  renderFilteredList();
}

function handleClearBudget() {
  localStorage.removeItem('pitis_budget_limit');
  showToast("Limit budget bulanan telah dihapus.", "info");
  closeBudgetModal();
  renderFilteredList();
}

// --- BACKUP & RESTORE JSON ---
function handleExportJSON() {
  const localRaw = localStorage.getItem('pitis_local_transactions') || '[]';
  const data = JSON.parse(localRaw);
  const payload = {
    app: "Pitis",
    version: "2.5",
    exportedAt: new Date().toISOString(),
    transactions: data
  };

  const jsonStr = JSON.stringify(payload, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Pitis_Backup_${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast("Backup JSON berhasil didownload!", "success");
}

function handleImportJSON(e) {
  const file = e.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (evt) => {
    try {
      const parsed = JSON.parse(evt.target.result);
      const list = Array.isArray(parsed) ? parsed : (parsed.transactions || []);
      if (!Array.isArray(list) || list.length === 0) {
        showToast("File JSON tidak berisi data transaksi yang valid!", "error");
        return;
      }

      await batchAddTransactions(list);
      showToast(`${list.length} transaksi dari backup JSON berhasil diimpor!`, "success");
      await loadTransactions();
      switchTab('riwayat');
    } catch (err) {
      showToast(`Gagal membaca file JSON: ${err.message}`, "error");
    }
  };
  reader.readAsText(file);
}

async function handleResetLocalData() {
  const isOk = await showConfirm("⚠️ YAKIN INGIN MENGHAPUS SEMUA DATA LOKAL? Tindakan ini tidak bisa dibatalkan!");
  if (!isOk) return;

  localStorage.removeItem('pitis_local_transactions');
  showToast("Semua data transaksi lokal telah di-reset.", "info");
  await loadTransactions();
}

// --- IMPORT CSV ---
function parseCSVDate(rawDate) {
  if (!rawDate) return new Date().toISOString().split('T')[0];
  let str = rawDate.toString().trim();

  if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
    return str.substring(0, 10);
  }

  if (str.includes('/') || str.includes('-')) {
    const sep = str.includes('/') ? '/' : '-';
    const parts = str.split(sep);
    if (parts.length === 3) {
      let day, month, year;
      if (parts[0].length === 4) {
        year = parts[0];
        month = parts[1].padStart(2, '0');
        day = parts[2].padStart(2, '0');
      } else {
        day = parts[0].padStart(2, '0');
        month = parts[1].padStart(2, '0');
        year = parts[2].length === 2 ? '20' + parts[2] : parts[2];
        if (Number(day) > 12 && Number(month) <= 12) {
          const tmp = day; day = month; month = tmp;
        }
      }
      return `${year}-${month}-${day}`;
    }
  }

  const d = new Date(str);
  if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
  return new Date().toISOString().split('T')[0];
}

async function handleImportCSV() {
  const fileInput = document.getElementById('csv-file-input');
  const file = fileInput?.files?.[0];

  if (!file) {
    showToast("Pilih file .csv terlebih dahulu!");
    return;
  }

  const PapaModule = await import('papaparse');
  const Papa = PapaModule.default || PapaModule;
  showToast("Membaca file CSV...", "info");

  Papa.parse(file, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: false,
    transformHeader: function(h) {
      return h.replace(/^\ufeff/, '').trim().toLowerCase();
    },
    complete: async function(results) {
      const rows = results.data;
      if (!rows || rows.length === 0) {
        showToast("File CSV kosong!", "error");
        return;
      }

      let parsedRecords = [];

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const keys = Object.keys(row);
        
        const dateKey = keys.find(k => k.includes('tanggal') || k.includes('date') || k.includes('tgl'));
        const typeKey = keys.find(k => k.includes('tipe') || k.includes('type') || k.includes('jenis'));
        const catKey = keys.find(k => k.includes('kategori') || k.includes('category') || k.includes('cat'));
        const amountKey = keys.find(k => k.includes('nominal') || k.includes('amount') || k.includes('jumlah') || k.includes('total'));
        const descKey = keys.find(k => k.includes('keterangan') || k.includes('desc') || k.includes('catatan') || k.includes('rincian'));

        const rawDate = dateKey ? row[dateKey] : null;
        const rawType = typeKey ? row[typeKey] : '';
        const rawCat = catKey ? row[catKey] : '';
        const rawAmount = amountKey ? row[amountKey] : null;
        const desc = descKey && row[descKey] ? row[descKey] : (keys[0] ? row[keys[0]] : 'Import CSV');

        if (rawAmount !== null && rawAmount !== undefined) {
          const cleanAmountStr = rawAmount.toString().replace(/[^0-9.-]/g, '');
          const amount = Math.abs(Number(cleanAmountStr));

          if (amount > 0) {
            const typeStr = rawType.toString().trim().toLowerCase();
            const isPemasukan = 
              typeStr.includes('masuk') || 
              typeStr.includes('pemasukan') || 
              typeStr.includes('income') || 
              typeStr === '+' || typeStr === 'in';

            const finalType = isPemasukan ? 'pemasukan' : 'pengeluaran';
            const formattedDate = parseCSVDate(rawDate);
            const descStr = desc.toString().trim();
            const category = rawCat ? rawCat.toString().toLowerCase() : (autoDetectCategory(descStr) || 'lainnya');

            parsedRecords.push({
              date: formattedDate,
              type: finalType,
              category: category,
              amount: amount,
              description: descStr
            });
          }
        }
      }

      if (parsedRecords.length === 0) {
        showToast("Gagal membaca CSV! Pastikan kolom Tanggal, Nominal, dan Keterangan tersedia.", "error");
        return;
      }

      showToast(`Mengimpor ${parsedRecords.length} transaksi...`, "info");

      try {
        await batchAddTransactions(parsedRecords);
        showToast(`Selesai! ${parsedRecords.length} transaksi berhasil diimpor.`, "success");
        if (fileInput) fileInput.value = '';
        await loadTransactions();
        switchTab('riwayat');
      } catch (err) {
        showToast(`Gagal impor: ${err.message}`, "error");
      }
    }
  });
}

// --- SAVE / EDIT TRANSAKSI ---
async function handleSaveTx(e) {
  e.preventDefault();
  
  const id = document.getElementById('tx-id').value;
  const date = document.getElementById('tx-date').value;
  const type = document.getElementById('tx-type').value;
  const category = document.getElementById('tx-category').value;
  const amount = Number(document.getElementById('tx-amount').value);
  const description = document.getElementById('tx-desc').value;

  try {
    if (id) {
      await updateTransaction(id, { date, type, category, amount, description });
      showToast('Transaksi berhasil diperbarui!', 'success');
    } else {
      await addTransaction({ date, type, category, amount, description });
      showToast('Transaksi berhasil disimpan!', 'success');
    }
    resetForm();
    await loadTransactions();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function prepareEdit(id) {
  const tx = cachedTransactions.find(t => String(t.id) === String(id));
  if (!tx) return;

  switchTab('catat');

  document.getElementById('tx-id').value = tx.id;
  document.getElementById('tx-date').value = tx.date;
  document.getElementById('tx-type').value = tx.type;
  document.getElementById('tx-category').value = tx.category || 'lainnya';
  document.getElementById('tx-amount').value = tx.amount;
  document.getElementById('tx-desc').value = tx.description;

  const formTitle = document.getElementById('form-title');
  if (formTitle) formTitle.innerHTML = `<span>✏️</span> Edit Transaksi`;
  document.getElementById('btn-cancel-edit')?.classList.remove('hidden');

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function handleDelete(id) {
  const isOk = await showConfirm('Yakin mau hapus catatan ini?');
  if (!isOk) return;

  try {
    await deleteTransaction(id);
    showToast('Transaksi dihapus.', 'success');
    await loadTransactions();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function resetForm() {
  const form = document.getElementById('tx-form');
  if (form) form.reset();
  document.getElementById('tx-id').value = '';
  const dateInput = document.getElementById('tx-date');
  if (dateInput) dateInput.valueAsDate = new Date();
  const formTitle = document.getElementById('form-title');
  if (formTitle) formTitle.innerHTML = `<span>✏️</span> Tambah Transaksi`;
  document.getElementById('btn-cancel-edit')?.classList.add('hidden');
  document.getElementById('auto-cat-badge')?.classList.add('hidden');
}

// --- EXPORT CSV ---
async function handleExportCSV() {
  const data = getFilteredData(cachedTransactions);
  if (data.length === 0) {
    showToast("Tidak ada data untuk diexport!", "error");
    return;
  }

  const PapaModule = await import('papaparse');
  const Papa = PapaModule.default || PapaModule;

  const exportData = data.map(t => ({
    'Tanggal': t.date,
    'Tipe': t.type,
    'Kategori': CATEGORIES[t.category]?.name || t.category || 'Lain-lain',
    'Nominal': t.amount,
    'Keterangan': t.description
  }));

  const csvString = Papa.unparse(exportData);
  const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
  const url = window.URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.setAttribute('hidden', '');
  a.setAttribute('href', url);
  a.setAttribute('download', `Pitis_Export_${new Date().toISOString().split('T')[0]}.csv`);
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  
  showToast("Data berhasil diexport!", "success");
}

// --- UTILS ---
function formatRp(num) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(num || 0);
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  
  const colors = {
    info: 'bg-slate-900 border border-indigo-500/30 text-indigo-200 dark:bg-slate-900 dark:text-indigo-200',
    success: 'bg-emerald-950 border border-emerald-500/30 text-emerald-200',
    error: 'bg-rose-950 border border-rose-500/30 text-rose-200'
  };
  
  toast.className = `${colors[type]} p-3 rounded-xl shadow-xl text-xs font-semibold pointer-events-auto transform transition-all duration-300 translate-y-4 opacity-0 flex items-center justify-between gap-2 backdrop-blur-md`;
  toast.innerText = message;
  
  container.appendChild(toast);
  
  requestAnimationFrame(() => {
    toast.classList.remove('translate-y-4', 'opacity-0');
  });
  
  setTimeout(() => {
    toast.classList.add('opacity-0', '-translate-y-4');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

function showConfirm(message) {
  return new Promise((resolve) => {
    const modal = document.getElementById('confirm-modal');
    const msgEl = document.getElementById('confirm-message');
    const btnOk = document.getElementById('btn-confirm-ok');
    const btnCancel = document.getElementById('btn-confirm-cancel');
    
    if (!modal || !msgEl || !btnOk || !btnCancel) {
      resolve(confirm(message));
      return;
    }

    msgEl.innerText = message;
    modal.classList.remove('hidden');
    
    const cleanup = () => {
      modal.classList.add('hidden');
      btnOk.removeEventListener('click', onOk);
      btnCancel.removeEventListener('click', onCancel);
    };
    
    const onOk = () => { cleanup(); resolve(true); };
    const onCancel = () => { cleanup(); resolve(false); };
    
    btnOk.addEventListener('click', onOk);
    btnCancel.addEventListener('click', onCancel);
  });
}
