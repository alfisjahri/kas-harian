import { createClient } from '@supabase/supabase-js';

const CONFIG_KEY = 'pitis_cloud_config';
const LOCAL_TX_KEY = 'pitis_local_transactions';

export const CATEGORIES = {
  makanan: { name: 'Makanan & Minuman', icon: '🍔', color: 'emerald', bg: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20' },
  transportasi: { name: 'Transportasi', icon: '🚗', color: 'blue', bg: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20' },
  tagihan: { name: 'Tagihan & Pulsa', icon: '⚡', color: 'amber', bg: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20' },
  belanja: { name: 'Belanja', icon: '🛍️', color: 'purple', bg: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20' },
  hiburan: { name: 'Hiburan', icon: '🎮', color: 'pink', bg: 'bg-pink-500/10 text-pink-600 dark:text-pink-400 border-pink-500/20' },
  kesehatan: { name: 'Kesehatan', icon: '🏥', color: 'red', bg: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20' },
  gaji: { name: 'Gaji & Pendapatan', icon: '💰', color: 'teal', bg: 'bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/20' },
  investasi: { name: 'Investasi & Tabungan', icon: '📈', color: 'indigo', bg: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20' },
  lainnya: { name: 'Lain-lain', icon: '📦', color: 'slate', bg: 'bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20' }
};

const defaultDummyData = [
  { id: '1', date: new Date().toISOString().split('T')[0], type: 'pemasukan', category: 'gaji', amount: 5000000, description: 'Gaji Freelance Project (Demo)' },
  { id: '2', date: new Date().toISOString().split('T')[0], type: 'pengeluaran', category: 'makanan', amount: 35000, description: 'Kopi & Toast Cafe (Demo)' },
  { id: '3', date: new Date().toISOString().split('T')[0], type: 'pengeluaran', category: 'transportasi', amount: 25000, description: 'Bensin Motor (Demo)' },
  { id: '4', date: new Date().toISOString().split('T')[0], type: 'pengeluaran', category: 'tagihan', amount: 150000, description: 'Tagihan WiFi Indihome (Demo)' }
];

// Memory cache untuk instance Supabase
let supabaseClientInstance = null;
let currentSupabaseConfigKey = '';

// --- CONFIG MANAGEMENT ---
export function getCloudConfig() {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.error("Gagal membaca pitis_cloud_config", e);
  }
  return { provider: 'local', gasUrl: '', supabaseUrl: '', supabaseAnonKey: '' };
}

export function saveCloudConfig(config) {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
  // Reset cache Supabase
  supabaseClientInstance = null;
  currentSupabaseConfigKey = '';
}

function getSupabaseClient(config) {
  const key = `${config.supabaseUrl}_${config.supabaseAnonKey}`;
  if (supabaseClientInstance && currentSupabaseConfigKey === key) {
    return supabaseClientInstance;
  }
  if (config.supabaseUrl && config.supabaseAnonKey && config.supabaseUrl.startsWith('http')) {
    supabaseClientInstance = createClient(config.supabaseUrl, config.supabaseAnonKey, {
      auth: { persistSession: false }
    });
    currentSupabaseConfigKey = key;
    return supabaseClientInstance;
  }
  return null;
}

// --- LOCAL STORAGE HELPERS ---
function getLocalTransactions() {
  try {
    const raw = localStorage.getItem(LOCAL_TX_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.error("Gagal membaca LocalStorage", e);
  }
  localStorage.setItem(LOCAL_TX_KEY, JSON.stringify(defaultDummyData));
  return defaultDummyData;
}

function saveLocalTransactions(list) {
  localStorage.setItem(LOCAL_TX_KEY, JSON.stringify(list));
}

// --- UNIFIED DATABASE ADAPTOR ---

export async function fetchTransactions() {
  const config = getCloudConfig();

  if (config.provider === 'gas' && config.gasUrl) {
    try {
      const url = `${config.gasUrl}?action=get&t=${Date.now()}`;
      const res = await fetch(url, { redirect: 'follow' });
      const json = await res.json();
      if (json.status === 'success' && Array.isArray(json.data)) {
        const rawData = json.data;
        const seen = new Set();
        const uniqueList = [];
        for (let i = 0; i < rawData.length; i++) {
          const item = rawData[i];
          const rawId = item.id ? String(item.id).trim() : '';
          const key = (rawId && !rawId.startsWith('tx_'))
            ? 'id_' + rawId
            : (item.date + '_' + item.type + '_' + item.amount + '_' + item.description);
          if (!seen.has(key)) {
            seen.add(key);
            uniqueList.push(item);
          }
        }
        return uniqueList;
      }
    } catch (err) {
      console.error("Gagal membaca dari Google Sheets (GAS):", err);
      throw new Error("Gagal terhubung ke Google Sheets. Periksa URL GAS WebApp kamu!");
    }
  }

  if (config.provider === 'supabase' && config.supabaseUrl && config.supabaseAnonKey) {
    const client = getSupabaseClient(config);
    if (client) {
      const { data, error } = await client
        .from('transactions')
        .select('*')
        .order('date', { ascending: false });

      if (error) {
        console.error("Supabase fetch error:", error);
        throw new Error(`Supabase Error: ${error.message}`);
      }
      return data || [];
    }
  }

  return getLocalTransactions();
}

export async function addTransaction(txData) {
  const config = getCloudConfig();
  const newTx = {
    id: txData.id || Date.now().toString(),
    date: txData.date,
    type: txData.type,
    category: txData.category || 'lainnya',
    amount: Number(txData.amount),
    description: txData.description
  };

  if (config.provider === 'gas' && config.gasUrl) {
    const res = await fetch(config.gasUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'add', data: newTx })
    });
    const json = await res.json();
    if (json.status !== 'success') {
      throw new Error(json.message || "Gagal menambah transaksi di Google Sheets.");
    }
    return newTx;
  }

  if (config.provider === 'supabase' && config.supabaseUrl && config.supabaseAnonKey) {
    const client = getSupabaseClient(config);
    if (client) {
      const { data, error } = await client
        .from('transactions')
        .insert([{ date: newTx.date, type: newTx.type, category: newTx.category, amount: newTx.amount, description: newTx.description }])
        .select();

      if (error) throw new Error(`Supabase Insert Error: ${error.message}`);
      return data?.[0] || newTx;
    }
  }

  const localList = getLocalTransactions();
  localList.unshift(newTx);
  saveLocalTransactions(localList);
  return newTx;
}

export async function batchAddTransactions(txList) {
  if (!txList || txList.length === 0) return [];
  const config = getCloudConfig();

  const formattedList = txList.map((tx, idx) => ({
    id: tx.id || (Date.now() + idx).toString(),
    date: tx.date,
    type: tx.type,
    category: tx.category || 'lainnya',
    amount: Number(tx.amount),
    description: tx.description
  }));

  if (config.provider === 'gas' && config.gasUrl) {
    let isBatchSuccess = false;

    try {
      const res = await fetch(config.gasUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'batch_add', data: formattedList })
      });
      const json = await res.json();
      if (json && json.status === 'success') {
        isBatchSuccess = true;
        return formattedList;
      }
    } catch (e) {
      console.warn("GAS batch_add gagal...", e);
    }

    if (!isBatchSuccess) {
      for (let i = 0; i < formattedList.length; i++) {
        const res = await fetch(config.gasUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({ action: 'add', data: formattedList[i] })
        });
        const json = await res.json();
        if (json && json.status !== 'success') {
          throw new Error(json.message || `Gagal mengimpor transaksi ke-${i + 1} ke Google Sheets.`);
        }
      }
      return formattedList;
    }
  }

  if (config.provider === 'supabase' && config.supabaseUrl && config.supabaseAnonKey) {
    const client = getSupabaseClient(config);
    if (client) {
      const recordsToInsert = formattedList.map(t => ({
        date: t.date,
        type: t.type,
        category: t.category,
        amount: t.amount,
        description: t.description
      }));
      const { error } = await client.from('transactions').insert(recordsToInsert);
      if (error) throw new Error(`Supabase Batch Insert Error: ${error.message}`);
      return formattedList;
    }
  }

  // LocalStorage
  const localList = getLocalTransactions();
  const merged = [...formattedList, ...localList];
  saveLocalTransactions(merged);
  return formattedList;
}

export async function updateTransaction(id, txData) {
  const config = getCloudConfig();
  const updatedTx = {
    id,
    date: txData.date,
    type: txData.type,
    category: txData.category || 'lainnya',
    amount: Number(txData.amount),
    description: txData.description
  };

  if (config.provider === 'gas' && config.gasUrl) {
    const res = await fetch(config.gasUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'update', data: updatedTx })
    });
    const json = await res.json();
    if (json.status !== 'success') {
      throw new Error(json.message || "Gagal mengedit transaksi di Google Sheets.");
    }
    return updatedTx;
  }

  if (config.provider === 'supabase' && config.supabaseUrl && config.supabaseAnonKey) {
    const client = getSupabaseClient(config);
    if (client) {
      const { error } = await client
        .from('transactions')
        .update({ date: updatedTx.date, type: updatedTx.type, category: updatedTx.category, amount: updatedTx.amount, description: updatedTx.description })
        .eq('id', id);

      if (error) throw new Error(`Supabase Update Error: ${error.message}`);
      return updatedTx;
    }
  }

  const localList = getLocalTransactions();
  const idx = localList.findIndex(t => String(t.id) === String(id));
  if (idx !== -1) {
    localList[idx] = updatedTx;
    saveLocalTransactions(localList);
  }
  return updatedTx;
}

export async function deleteTransaction(id) {
  const config = getCloudConfig();

  if (config.provider === 'gas' && config.gasUrl) {
    const res = await fetch(config.gasUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'delete', id: String(id) })
    });
    const json = await res.json();
    if (json.status !== 'success') {
      throw new Error(json.message || "Gagal menghapus transaksi di Google Sheets.");
    }
    return true;
  }

  if (config.provider === 'supabase' && config.supabaseUrl && config.supabaseAnonKey) {
    const client = getSupabaseClient(config);
    if (client) {
      const { error } = await client
        .from('transactions')
        .delete()
        .eq('id', id);

      if (error) throw new Error(`Supabase Delete Error: ${error.message}`);
      return true;
    }
  }

  let localList = getLocalTransactions();
  localList = localList.filter(t => String(t.id) !== String(id));
  saveLocalTransactions(localList);
  return true;
}
