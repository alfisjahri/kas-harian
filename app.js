    // Register Service Worker Resmi (sw.js)
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js').catch(err => console.log('SW reg error:', err));
    }

    // --- KONFIGURASI SUPABASE ---
    const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL; 
    const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

    const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

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

    // --- INITIALIZATION & EVENT LISTENERS ---
    window.addEventListener('DOMContentLoaded', async () => {
      document.getElementById('tx-date').valueAsDate = new Date();

      // Accordion 1: Sisa Pitis
      document.getElementById('btn-toggle-pitis-acc').addEventListener('click', () => {
        const content = document.getElementById('pitis-acc-content');
        const arrow = document.getElementById('pitis-acc-arrow');
        content.classList.toggle('hidden');
        arrow.classList.toggle('rotate-180');
      });

      // Accordion 2: Rekapan & Filter
      document.getElementById('btn-toggle-summary').addEventListener('click', () => {
        const content = document.getElementById('summary-content');
        const arrow = document.getElementById('summary-arrow');
        content.classList.toggle('hidden');
        arrow.classList.toggle('rotate-180');
      });

      // Accordion 3: Import CSV
      document.getElementById('btn-toggle-import').addEventListener('click', () => {
        const content = document.getElementById('import-content');
        const arrow = document.getElementById('import-arrow');
        content.classList.toggle('hidden');
        arrow.classList.toggle('rotate-180');
      });

      // Toggle Sensor Angka Pitis
      document.getElementById('pitis-acc-content').addEventListener('click', () => {
        isPitisHidden = !isPitisHidden;
        updatePitisDisplay();
      });

      // Populate Dropdown Tahun
      const currentYear = new Date().getFullYear();
      const yearSelectors = ['picker-quarter-year', 'picker-semester-year', 'picker-year-only'];
      yearSelectors.forEach(id => {
        const el = document.getElementById(id);
        el.innerHTML = '';
        for (let y = currentYear; y >= currentYear - 5; y--) {
          el.innerHTML += `<option value="${y}">${y}</option>`;
        }
      });

      const today = new Date();
      const currentYM = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
      document.getElementById('picker-month').value = currentYM;

      document.getElementById('filter-type').addEventListener('change', handleFilterTypeChange);
      document.getElementById('picker-submonth').addEventListener('change', (e) => {
        const dayPicker = document.getElementById('picker-specific-day');
        if (e.target.value === 'custom_day') dayPicker.classList.remove('hidden');
        else dayPicker.classList.add('hidden');
        renderApp();
      });

      ['picker-month', 'picker-specific-day', 'picker-quarter-year', 'picker-quarter-q', 
       'picker-semester-year', 'picker-semester-s', 'picker-year-only'].forEach(id => {
        document.getElementById(id).addEventListener('change', renderApp);
      });

      document.getElementById('btn-login-trigger').addEventListener('click', openModal);
      document.getElementById('btn-login-banner').addEventListener('click', openModal);
      document.getElementById('btn-close-modal').addEventListener('click', closeModal);
      document.getElementById('btn-logout').addEventListener('click', handleLogout);
      document.getElementById('btn-cancel-edit').addEventListener('click', resetForm);
      document.getElementById('btn-import-csv').addEventListener('click', handleImportCSV);
      document.getElementById('search-tx').addEventListener('input', renderApp);
      document.getElementById('btn-export-csv').addEventListener('click', handleExportCSV);

      document.getElementById('tx-form').addEventListener('submit', handleSaveTx);
      document.getElementById('auth-form').addEventListener('submit', handleAuth);

      const { data: { user } } = await supabaseClient.auth.getUser();
      currentUser = user;
      updateUIForAuth();

      supabaseClient.auth.onAuthStateChange((_event, session) => {
        currentUser = session?.user || null;
        updateUIForAuth();
      });
    });

    function handleFilterTypeChange(e) {
      const type = e.target.value;
      document.getElementById('ctrl-month').classList.toggle('hidden', type !== 'month');
      document.getElementById('ctrl-quarter').classList.toggle('hidden', type !== 'quarter');
      document.getElementById('ctrl-semester').classList.toggle('hidden', type !== 'semester');
      document.getElementById('ctrl-year').classList.toggle('hidden', type !== 'year');
      renderApp();
    }

    function openModal() { document.getElementById('auth-modal').classList.remove('hidden'); }
    function closeModal() { document.getElementById('auth-modal').classList.add('hidden'); }

    function updateUIForAuth() {
      const statusEl = document.getElementById('user-status');
      const loginBtn = document.getElementById('btn-login-trigger');
      const logoutBtn = document.getElementById('btn-logout');
      const demoBanner = document.getElementById('demo-banner');

      if (currentUser) {
        statusEl.innerText = `Pemilik: ${currentUser.email}`;
        statusEl.className = "text-xs text-emerald-200 font-medium";
        loginBtn.classList.add('hidden');
        logoutBtn.classList.remove('hidden');
        demoBanner.classList.add('hidden');
      } else {
        statusEl.innerText = "Mode Demo (Khusus Pratinjau)";
        statusEl.className = "text-xs text-indigo-200";
        loginBtn.classList.remove('hidden');
        logoutBtn.classList.add('hidden');
        demoBanner.classList.remove('hidden');
      }
      renderApp();
    }

    function updatePitisDisplay() {
      const statSisaEl = document.getElementById('stat-sisa');
      const eyeIconEl = document.getElementById('pitis-eye-icon');

      if (isPitisHidden) {
        statSisaEl.innerText = "Rp •••••••";
        eyeIconEl.innerText = "👁️";
      } else {
        statSisaEl.innerText = cachedSisaPitisFormatted;
        eyeIconEl.innerText = "🙈";
      }
    }

    // --- RENDER & REKAPAN KALKULASI ---
    async function renderApp() {
      let transactions = [];

      if (currentUser) {
        const { data, error } = await supabaseClient
          .from('transactions')
          .select('*')
          .order('date', { ascending: false });

        if (!error && data) realTransactions = data;
        transactions = realTransactions;
      } else {
        transactions = dummyTransactions;
      }

      // 1. SALDO KAS GLOBAL (SISA PITIS)
      let globalMasuk = 0;
      let globalKeluar = 0;

      transactions.forEach(t => {
        if (t.type === 'pemasukan') globalMasuk += Number(t.amount);
        else globalKeluar += Number(t.amount);
      });

      const totalSisaKasGlobal = globalMasuk - globalKeluar;
      cachedSisaPitisFormatted = formatRp(totalSisaKasGlobal);
      updatePitisDisplay();

      // 2. REKAPAN TERFILTER
      const filtered = getFilteredData(transactions);

      let totalMasukPeriode = 0;
      let totalKeluarPeriode = 0;

      filtered.forEach(t => {
        if (t.type === 'pemasukan') totalMasukPeriode += Number(t.amount);
        else totalKeluarPeriode += Number(t.amount);
      });

      document.getElementById('stat-pemasukan').innerText = formatRp(totalMasukPeriode);
      document.getElementById('stat-pengeluaran').innerText = formatRp(totalKeluarPeriode);

      // Render Riwayat
      const listContainer = document.getElementById('tx-list');
      listContainer.innerHTML = '';

      if (filtered.length === 0) {
        listContainer.innerHTML = `<p class="text-xs text-gray-400 text-center py-4">Belum ada transaksi di periode ini.</p>`;
        return;
      }

      filtered.forEach(t => {
        const isIncome = t.type === 'pemasukan';
        const card = document.createElement('div');
        card.className = "flex justify-between items-center p-3 border rounded-lg bg-gray-50 text-sm";
        card.innerHTML = `
          <div>
            <p class="font-semibold text-gray-800">${t.description}</p>
            <p class="text-xs text-gray-400">${t.date}</p>
          </div>
          <div class="text-right">
            <p class="font-bold ${isIncome ? 'text-emerald-600' : 'text-rose-600'}">
              ${isIncome ? '+' : '-'} ${formatRp(t.amount)}
            </p>
            <div class="space-x-2 text-xs mt-1">
              <button onclick="prepareEdit('${t.id}')" class="text-indigo-600 hover:underline">Edit</button>
              <button onclick="handleDelete('${t.id}')" class="text-rose-600 hover:underline">Hapus</button>
            </div>
          </div>
        `;
        listContainer.appendChild(card);
      });
    }

    function getFilteredData(data) {
      const mode = document.getElementById('filter-type').value;
      const searchQuery = document.getElementById('search-tx').value.toLowerCase();

      return data.filter(t => {
        // 1. Filter by search
        if (searchQuery && !t.description.toLowerCase().includes(searchQuery)) {
          return false;
        }

        // 2. Filter by date mode
        const tDate = new Date(t.date);
        const year = tDate.getFullYear();
        const month = tDate.getMonth() + 1;
        const dateNum = tDate.getDate();

        if (mode === 'month') {
          const ymVal = document.getElementById('picker-month').value;
          if (!ymVal) return true;
          const [targetY, targetM] = ymVal.split('-').map(Number);

          if (year !== targetY || month !== targetM) return false;

          const sub = document.getElementById('picker-submonth').value;
          if (sub === 'w1') return dateNum >= 1 && dateNum <= 7;
          if (sub === 'w2') return dateNum >= 8 && dateNum <= 14;
          if (sub === 'w3') return dateNum >= 15 && dateNum <= 21;
          if (sub === 'w4') return dateNum >= 22;
          if (sub === 'custom_day') {
            const dayVal = document.getElementById('picker-specific-day').value;
            return dayVal ? t.date === dayVal : true;
          }
          return true;

        } else if (mode === 'quarter') {
          const qYear = Number(document.getElementById('picker-quarter-year').value);
          const qVal = document.getElementById('picker-quarter-q').value;
          if (year !== qYear) return false;

          if (qVal === 'q1') return month >= 1 && month <= 3;
          if (qVal === 'q2') return month >= 4 && month <= 6;
          if (qVal === 'q3') return month >= 7 && month <= 9;
          if (qVal === 'q4') return month >= 10 && month <= 12;

        } else if (mode === 'semester') {
          const sYear = Number(document.getElementById('picker-semester-year').value);
          const sVal = document.getElementById('picker-semester-s').value;
          if (year !== sYear) return false;

          if (sVal === 's1') return month >= 1 && month <= 6;
          if (sVal === 's2') return month >= 7 && month <= 12;

        } else if (mode === 'year') {
          const yVal = Number(document.getElementById('picker-year-only').value);
          return year === yVal;
        }

        return true;
      });
    }

    // --- IMPORT CSV GOOGLE SHEETS ---
    function handleImportCSV() {
      if (!currentUser) {
        showToast("Harap login dulu sebagai pemilik untuk bisa mengimpor data!");
        return;
      }

      const fileInput = document.getElementById('csv-file-input');
      const file = fileInput.files[0];

      if (!file) {
        showToast("Pilih file .csv dari Google Sheets kamu terlebih dahulu!");
        return;
      }

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

          const { error } = await supabaseClient.from('transactions').insert(newRecords);

          if (error) {
            showToast("Error Supabase: " + error.message);
          } else {
            showToast(`Selesai! ${newRecords.length} transaksi berhasil diimpor.`);
            fileInput.value = '';
            renderApp();
          }
        }
      });
    }

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
        renderApp();
        showToast('Tersimpan di mode demo!');
        return;
      }

      if (id) {
        await supabaseClient.from('transactions').update({ date, type, amount, description }).eq('id', id);
      } else {
        await supabaseClient.from('transactions').insert([{ user_id: currentUser.id, date, type, amount, description }]);
      }

      resetForm();
      renderApp();
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

      document.getElementById('form-title').innerText = "Edit Transaksi";
      document.getElementById('btn-cancel-edit').classList.remove('hidden');
    }

    async function handleDelete(id) {
      const isOk = await showConfirm('Yakin mau hapus catatan ini?');
      if (!isOk) return;

      if (!currentUser) {
        dummyTransactions = dummyTransactions.filter(t => t.id !== id);
      } else {
        await supabaseClient.from('transactions').delete().eq('id', id);
      }
      renderApp();
    }

    function resetForm() {
      document.getElementById('tx-form').reset();
      document.getElementById('tx-id').value = '';
      document.getElementById('tx-date').valueAsDate = new Date();
      document.getElementById('form-title').innerText = "Tambah Transaksi";
      document.getElementById('btn-cancel-edit').classList.add('hidden');
    }

    // --- AUTHENTICATION ---
    async function handleAuth(e) {
      e.preventDefault();

      if (isLocked) {
        showToast("Terlalu banyak percobaan gagal! Kunci dibuka dalam 30 detik.");
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
      updateUIForAuth();
    }

    async function handleLogout() {
      await supabaseClient.auth.signOut();
      currentUser = null;
      updateUIForAuth();
      showToast("Berhasil logout!");
    }

    // --- UTILS ---
    function handleExportCSV() {
      const data = getFilteredData(currentUser ? realTransactions : dummyTransactions);
      if (data.length === 0) {
        showToast("Tidak ada data untuk diexport!", "error");
        return;
      }

      const csvRows = [];
      const headers = ['Tanggal', 'Tipe', 'Nominal', 'Keterangan'];
      csvRows.push(headers.join(','));

      data.forEach(t => {
        // Wrap description in quotes to handle commas
        const desc = `"${t.description.replace(/"/g, '""')}"`;
        const row = [t.date, t.type, t.amount, desc];
        csvRows.push(row.join(','));
      });

      const csvString = csvRows.join('\n');
      const blob = new Blob([csvString], { type: 'text/csv' });
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

    function formatRp(num) {
      return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(num);
    }

    function showToast(message, type = 'info') {
      const container = document.getElementById('toast-container');
      const toast = document.createElement('div');
      
      const colors = {
        info: 'bg-gray-800 text-white',
        success: 'bg-emerald-600 text-white',
        error: 'bg-rose-600 text-white'
      };
      
      toast.className = `${colors[type]} p-3 rounded-lg shadow-lg text-sm font-semibold pointer-events-auto transform transition-all duration-300 translate-y-4 opacity-0`;
      toast.innerText = message;
      
      container.appendChild(toast);
      
      // Animate in
      requestAnimationFrame(() => {
        toast.classList.remove('translate-y-4', 'opacity-0');
      });
      
      // Animate out and remove
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
