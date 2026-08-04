import { createClient } from '@supabase/supabase-js';

const CONFIG_KEY = 'pitis_cloud_config';
const LOCAL_TX_KEY = 'pitis_local_transactions';

const defaultDummyData = [
  { id: '1', date: new Date().toISOString().split('T')[0], type: 'pemasukan', amount: 500000, description: 'Gaji Freelance (Demo)' },
  { id: '2', date: new Date().toISOString().split('T')[0], type: 'pengeluaran', amount: 25000, description: 'Kopi & Snack (Demo)' }
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
        return json.data;
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
        .insert([{ date: newTx.date, type: newTx.type, amount: newTx.amount, description: newTx.description }])
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
    amount: Number(tx.amount),
    description: tx.description
  }));

  if (config.provider === 'gas' && config.gasUrl) {
    let isBatchSuccess = false;

    // 1. Coba batch_add terlebih dahulu (Super Cepat)
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
      console.warn("GAS batch_add gagal atau belum di-update di Apps Script pengguna, mencoba fallback...", e);
    }

    // 2. Fallback otomatis jika Apps Script pengguna masih versi lama (belum ada batch_add)
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
        .update({ date: updatedTx.date, type: updatedTx.type, amount: updatedTx.amount, description: updatedTx.description })
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
