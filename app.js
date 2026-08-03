import { createClient } from '@supabase/supabase-js';

// --- SERVICE WORKER REGISTRATION ---
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(err => console.log('SW reg error:', err));
}

// --- SUPABASE CONFIGURATION ---
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || ''; 
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

const supabaseClient = (SUPABASE_URL && SUPABASE_ANON_KEY) 
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) 
  : null;

let dummyTransactions = [
  { id: '1', date: new Date().toISOString().split('T')[0], type: 'pemasukan', amount: 500000, description: 'Gaji Freelance (Demo)' },
  { id: '2', date: new Date().toISOString().split('T')[0], type: 'pengeluaran', amount: 25000, description: 'Kopi & Snack (Demo)' }
];

let currentUser = null;
let realTransactions = [];
let loginAttempts = 0;
let isLocked = false;

// State Sensor Sisa Pitis
let isPitisHidden = true;
let cachedSisaPitisFormatted = "Rp 0";

// --- INITIALIZATION ---
window.addEventListener('DOMContentLoaded', async () => {
  const dateInput = document.getElementById('tx-date');
  if (dateInput) dateInput.valueAsDate = new Date();

  // Accordion 1: Sisa Pitis
  document.getElementById('btn-toggle-pitis-acc')?.addEventListener('click', () => {
    const content = document.getElementById('pitis-acc-content');
    const arrow = document.getElementById('pitis-acc-arrow');
    content.classList.toggle('hidden');
    arrow.classList.toggle('rotate-180');
  });

  // Accordion 2: Rekapan & Filter
  document.getElementById('btn-toggle-summary')?.addEventListener('click', () => {
    const content = document.getElementById('summary-content');
    const arrow = document.getElementById('summary-arrow');
    content.classList.toggle('hidden');
    arrow.classList.toggle('rotate-180');
  });

  // Accordion 3: Import CSV
  document.getElementById('btn-toggle-import')?.addEventListener('click', () => {
    const content = document.getElementById('import-content');
    const arrow = document.getElementById('import-arrow');
    content.classList.toggle('hidden');
    arrow.classList.toggle('rotate-180');
  });

  // Toggle Sensor Angka Pitis
  document.getElementById('pitis-acc-content')?.addEventListener('click', () => {
    isPitisHidden = !isPitisHidden;
    updatePitisDisplay();
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
   'picker-semester-year', 'picker-semester-s', 'picker-year-only'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', renderFilteredList);
  });

  document.getElementById('btn-login-trigger')?.addEventListener('click', openModal);
  document.getElementById('btn-login-banner')?.addEventListener('click', openModal);
  document.getElementById('btn-close-modal')?.addEventListener('click', closeModal);
  document.getElementById('btn-logout')?.addEventListener('click', handleLogout);
  document.getElementById('btn-cancel-edit')?.addEventListener('click', resetForm);
  document.getElementById('btn-import-csv')?.addEventListener('click', handleImportCSV);
  document.getElementById('search-tx')?.addEventListener('input', renderFilteredList);
  document.getElementById('btn-export-csv')?.addEventListener('click', handleExportCSV);

  document.getElementById('tx-form')?.addEventListener('submit', handleSaveTx);
  document.getElementById('auth-form')?.addEventListener('submit', handleAuth);

  // Event Delegation untuk Edit & Hapus pada Daftar Transaksi (Mencegah Memory Leak)
  document.getElementById('tx-list')?.addEventListener('click', (e) => {
    const target = e.target.closest('[data-action]');
    if (!target) return;
    const action = target.getAttribute('data-action');
    const id = target.getAttribute('data-id');

    if (action === 'edit') prepareEdit(id);
    else if (action === 'delete') handleDelete(id);
  });

  if (supabaseClient) {
    try {
      const { data: { user } } = await supabaseClient.auth.getUser();
      currentUser = user;
    } catch (err) {
      console.warn("Supabase Auth check skipped or offline", err);
    }

    supabaseClient.auth.onAuthStateChange(async (_event, session) => {
      currentUser = session?.user || null;
      await updateUIForAuth();
    });
  }

  await updateUIForAuth();
});

function handleFilterTypeChange(e) {
  const type = e.target.value;
  document.getElementById('ctrl-month')?.classList.toggle('hidden', type !== 'month');
  document.getElementById('ctrl-quarter')?.classList.toggle('hidden', type !== 'quarter');
  document.getElementById('ctrl-semester')?.classList.toggle('hidden', type !== 'semester');
  document.getElementById('ctrl-year')?.classList.toggle('hidden', type !== 'year');
  renderFilteredList();
}

function openModal() { document.getElementById('auth-modal')?.classList.remove('hidden'); }
function closeModal() { document.getElementById('auth-modal')?.classList.add('hidden'); }

async function updateUIForAuth() {
  const statusEl = document.getElementById('user-status');
  const loginBtn = document.getElementById('btn-login-trigger');
  const logoutBtn = document.getElementById('btn-logout');
  const demoBanner = document.getElementById('demo-banner');

  if (currentUser) {
    if (statusEl) {
      statusEl.innerText = `Pemilik: ${currentUser.email}`;
      statusEl.className = "text-xs text-emerald-400 font-medium";
    }
    loginBtn?.classList.add('hidden');
    logoutBtn?.classList.remove('hidden');
    demoBanner?.classList.add('hidden');
  } else {
    if (statusEl) {
      statusEl.innerText = "Mode Demo (Khusus Pratinjau)";
      statusEl.className = "text-xs text-slate-400 font-medium";
    }
    loginBtn?.classList.remove('hidden');
    logoutBtn?.classList.add('hidden');
    demoBanner?.classList.remove('hidden');
  }

  await loadTransactions();
}

function updatePitisDisplay() {
  const statSisaEl = document.getElementById('stat-sisa');
  const eyeIconEl = document.getElementById('pitis-eye-icon');

  if (isPitisHidden) {
    if (statSisaEl) statSisaEl.innerText = "Rp •••••••";
    if (eyeIconEl) eyeIconEl.innerText = "👁️";
  } else {
    if (statSisaEl) statSisaEl.innerText = cachedSisaPitisFormatted;
    if (eyeIconEl) eyeIconEl.innerText = "🙈";
  }
}

// --- FETCH DATA (Hanya Dipanggil Saat Auth / Modifikasi Data) ---
async function loadTransactions() {
  if (currentUser && supabaseClient) {
    const { data, error } = await supabaseClient
      .from('transactions')
      .select('*')
      .order('date', { ascending: false });

    if (!error && data) realTransactions = data;
  }
  renderFilteredList();
}

// --- RENDER FILTERED LIST (Tanpa Network Query / Pure In-Memory) ---
function renderFilteredList() {
  const transactions = currentUser ? realTransactions : dummyTransactions;

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

  // 2. REKAPAN TERFILTER
  const filtered = getFilteredData(transactions);

  let totalMasukPeriode = 0;
  let totalKeluarPeriode = 0;

  for (let i = 0; i < filtered.length; i++) {
    const t = filtered[i];
    if (t.type === 'pemasukan') totalMasukPeriode += Number(t.amount);
    else totalKeluarPeriode += Number(t.amount);
  }

  const statPemasukan = document.getElementById('stat-pemasukan');
  const statPengeluaran = document.getElementById('stat-pengeluaran');
  if (statPemasukan) statPemasukan.innerText = formatRp(totalMasukPeriode);
  if (statPengeluaran) statPengeluaran.innerText = formatRp(totalKeluarPeriode);

  // 3. RENDER RIWAYAT (Optimal String Construction)
  const listContainer = document.getElementById('tx-list');
  if (!listContainer) return;

  if (filtered.length === 0) {
    listContainer.innerHTML = `<p class="text-xs text-slate-500 text-center py-6">Belum ada transaksi di periode ini.</p>`;
    return;
  }

  let html = '';
  for (let i = 0; i < filtered.length; i++) {
    const t = filtered[i];
    const isIncome = t.type === 'pemasukan';

    html += `
      <div class="flex justify-between items-center p-3 border border-slate-800/80 rounded-xl bg-slate-900/60 backdrop-blur-sm text-sm hover:border-slate-700/80 transition-colors">
        <div class="space-y-0.5">
          <p class="font-semibold text-slate-100">${escapeHtml(t.description)}</p>
          <p class="text-xs text-slate-400 font-mono">${t.date}</p>
        </div>
        <div class="text-right">
          <p class="font-bold font-mono ${isIncome ? 'text-emerald-400' : 'text-rose-400'}">
            ${isIncome ? '+' : '-'} ${formatRp(t.amount)}
          </p>
          <div class="space-x-2 text-xs mt-1">
            <button data-action="edit" data-id="${t.id}" class="text-indigo-400 hover:text-indigo-300 font-medium">Edit</button>
            <button data-action="delete" data-id="${t.id}" class="text-rose-400 hover:text-rose-300 font-medium">Hapus</button>
          </div>
        </div>
      </div>
    `;
  }
  listContainer.innerHTML = html;
}

function getFilteredData(data) {
  const mode = document.getElementById('filter-type')?.value || 'month';
  const searchQuery = (document.getElementById('search-tx')?.value || '').toLowerCase();

  return data.filter(t => {
    if (searchQuery && !t.description.toLowerCase().includes(searchQuery)) {
      return false;
    }

    const tDate = new Date(t.date);
    const year = tDate.getFullYear();
    const month = tDate.getMonth() + 1;
    const dateNum = tDate.getDate();

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
        return dayVal ? t.date === dayVal : true;
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
}

// --- IMPORT CSV (Dynamic Lazy Loading PapaParse) ---
async function handleImportCSV() {
  if (!currentUser) {
    showToast("Harap login dulu sebagai pemilik untuk bisa mengimpor data!");
    return;
  }

  const fileInput = document.getElementById('csv-file-input');
  const file = fileInput?.files?.[0];

  if (!file) {
    showToast("Pilih file .csv dari Google Sheets kamu terlebih dahulu!");
    return;
  }

  // Dynamic Lazy Loading PapaParse (Hanya dimuat saat digunakan!)
  const PapaModule = await import('papaparse');
  const Papa = PapaModule.default || PapaModule;

  Papa.parse(file, {
    header: true,
    skipEmptyLines: true,
    transformHeader: function(h) {
      return h.replace(/^\ufeff/, '').trim().toLowerCase();
    },
    complete: async function(results) {
      const rows = results.data;
      let newRecords = [];

      rows.forEach((row) => {
        const keys = Object.keys(row);
        
        const dateKey = keys.find(k => k.includes('tanggal') || k.includes('date'));
        const typeKey = keys.find(k => k.includes('tipe') || k.includes('type') || k.includes('jenis'));
        const amountKey = keys.find(k => k.includes('nominal') || k.includes('amount') || k.includes('jumlah'));
        const descKey = keys.find(k => k.includes('keterangan') || k.includes('desc') || k.includes('catatan'));

        const rawDate = dateKey ? row[dateKey] : null;
        const rawType = typeKey ? row[typeKey] : '';
        const rawAmount = amountKey ? row[amountKey] : null;
        const desc = descKey && row[descKey] ? row[descKey] : 'Import CSV';

        if (rawDate && rawAmount) {
          const amount = Number(rawAmount.toString().replace(/[^0-9]/g, ''));

          const typeStr = rawType.toString().trim().toLowerCase();
          const isPemasukan = 
            typeStr.includes('masuk') || 
            typeStr.includes('pemasukan') || 
            typeStr.includes('income') || 
            typeStr.includes('in') || 
            typeStr.includes('debit') ||
            typeStr.includes('kredit') ||
            typeStr === 'p' || 
            typeStr === '+';

          const finalType = isPemasukan ? 'pemasukan' : 'pengeluaran';

          let formattedDate = rawDate.toString().trim();
          if (formattedDate.includes('/')) {
            const parts = formattedDate.split('/');
            if (parts.length === 3) {
              const day = parts[0].padStart(2, '0');
              const month = parts[1].padStart(2, '0');
              const year = parts[2].length === 2 ? '20' + parts[2] : parts[2];
              formattedDate = `${year}-${month}-${day}`;
            }
          }

          if (amount > 0) {
            newRecords.push({
              user_id: currentUser.id,
              date: formattedDate,
              type: finalType,
              amount: amount,
              description: desc.toString().trim()
            });
          }
        }
      });

      if (newRecords.length === 0) {
        showToast("Gagal membaca CSV! Pastikan header kolom di file kamu ada kata: Tanggal, Tipe, Nominal, Keterangan.");
        return;
      }

      if (!supabaseClient) {
        showToast("Supabase belum terkonfigurasi di env.");
        return;
      }

      const { error } = await supabaseClient.from('transactions').insert(newRecords);

      if (error) {
        showToast("Error Supabase: " + error.message);
      } else {
        showToast(`Selesai! ${newRecords.length} transaksi berhasil diimpor.`);
        if (fileInput) fileInput.value = '';
        await loadTransactions();
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
  const amount = Number(document.getElementById('tx-amount').value);
  const description = document.getElementById('tx-desc').value;

  if (!currentUser) {
    if (id) {
      const idx = dummyTransactions.findIndex(t => t.id === id);
      if (idx !== -1) dummyTransactions[idx] = { id, date, type, amount, description };
    } else {
      dummyTransactions.unshift({ id: Date.now().toString(), date, type, amount, description });
    }
    resetForm();
    renderFilteredList();
    showToast('Tersimpan di mode demo!');
    return;
  }

  if (!supabaseClient) return;

  if (id) {
    await supabaseClient.from('transactions').update({ date, type, amount, description }).eq('id', id);
  } else {
    await supabaseClient.from('transactions').insert([{ user_id: currentUser.id, date, type, amount, description }]);
  }

  resetForm();
  await loadTransactions();
}

function prepareEdit(id) {
  const list = currentUser ? realTransactions : dummyTransactions;
  const tx = list.find(t => t.id === id);
  if (!tx) return;

  document.getElementById('tx-id').value = tx.id;
  document.getElementById('tx-date').value = tx.date;
  document.getElementById('tx-type').value = tx.type;
  document.getElementById('tx-amount').value = tx.amount;
  document.getElementById('tx-desc').value = tx.description;

  const formTitle = document.getElementById('form-title');
  if (formTitle) formTitle.innerHTML = `<span>✏️</span> Edit Transaksi`;
  document.getElementById('btn-cancel-edit')?.classList.remove('hidden');
}

async function handleDelete(id) {
  const isOk = await showConfirm('Yakin mau hapus catatan ini?');
  if (!isOk) return;

  if (!currentUser) {
    dummyTransactions = dummyTransactions.filter(t => t.id !== id);
    renderFilteredList();
  } else if (supabaseClient) {
    await supabaseClient.from('transactions').delete().eq('id', id);
    await loadTransactions();
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
}

// --- AUTHENTICATION ---
async function handleAuth(e) {
  e.preventDefault();

  if (isLocked) {
    showToast("Terlalu banyak percobaan gagal! Kunci dibuka dalam 30 detik.");
    return;
  }

  if (!supabaseClient) {
    showToast("Supabase client belum terhubung. Periksa file .env kamu!");
    return;
  }

  const email = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value;

  const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });

  if (error) {
    loginAttempts++;
    const sisa = 3 - loginAttempts;

    if (loginAttempts >= 3) {
      isLocked = true;
      showToast("Gagal 3 kali! Akses login dikunci selama 30 detik.");
      setTimeout(() => {
        isLocked = false;
        loginAttempts = 0;
      }, 30000);
      return;
    }

    showToast(`Gagal login: ${error.message}\nSisa percobaan: ${sisa}`);
    return;
  }

  loginAttempts = 0;
  currentUser = data.user;
  showToast("Berhasil login sebagai Pemilik!");
  closeModal();
  await updateUIForAuth();
}

async function handleLogout() {
  if (supabaseClient) {
    await supabaseClient.auth.signOut();
  }
  currentUser = null;
  await updateUIForAuth();
  showToast("Berhasil logout!");
}

// --- EXPORT CSV (Dynamic Lazy Load PapaParse) ---
async function handleExportCSV() {
  const data = getFilteredData(currentUser ? realTransactions : dummyTransactions);
  if (data.length === 0) {
    showToast("Tidak ada data untuk diexport!", "error");
    return;
  }

  const PapaModule = await import('papaparse');
  const Papa = PapaModule.default || PapaModule;

  const exportData = data.map(t => ({
    'Tanggal': t.date,
    'Tipe': t.type,
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
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(num);
}

function escapeHtml(str) {
  return String(str)
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
    info: 'bg-slate-900 border border-indigo-500/30 text-indigo-200',
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
