# 💰 CatatDuit Privat (PWA)

Aplikasi pencatat keuangan harian privat, simpel, mobile-first, dan tanpa pusing setup environment local (`npm`/VS Code). Tinggal gas lewat browser!

Aplikasi ini dibuat khusus buat pemakaian pribadi yang praktis: data aman tersimpan di cloud (Supabase), bisa di-install ke HP (PWA), dan support impor data bertahun-tahun dari Google Sheets / AppSheet.

---

## 🔥 Fitur Utama

- **📱 Mobile-First & PWA Support:** Tampilan responsif pas di layar HP, bisa langsung *Add to Home Screen* atau di-install layaknya aplikasi native.
- **🔒 Mode Demo vs Mode Pemilik:** Kalau belum login, orang lain cuma bisa ngeliat versi demo (data sementara). Khusus pemilik yang punya akses penuh ke database cloud.
- **🛡️ Aman & Privat (Supabase RLS):** Menggunakan Row Level Security (RLS) & Publishable Key bawaan Supabase. Data transaksi cuma bisa diakses oleh akun kamu sendiri.
- **🤖 Rate Limiting Anti-Bot:** Proteksi login otomatis terkunci kalau salah password 3 kali berturut-turut.
- **💰 Sisa Pitis (Kas Global):** Menghitung total saldo akumulasi sepanjang masa, lengkap dengan fitur **sensor angka (peek/hide)** biar aman pas dibuka di tempat umum.
- **📊 Rekapan & Filter Advance:** Filter transaksi fleksibel: Per Bulan, Per Kuartal (Q1–Q4), Per Semester (6 Bulan), sampai Per Tahun.
- **📑 Impor CSV dari Google Sheets:** Bebas pusing migrasi dari AppSheet atau Google Sheets lama. Sekali upload `.csv`, data langsung masuk otomatis ke Supabase!

---

## 🛠️ Tech Stack

- **Frontend:** Single-file HTML5 + Tailwind CSS (via CDN) + JavaScript ES6
- **Database & Auth:** Supabase (PostgreSQL + RLS + Auth Client)
- **CSV Parser:** PapaParse JS (via CDN)
- **Deployment:** Vercel / GitHub Pages

---

## 🚀 Cara Setup Database (Supabase)

1. Buka [supabase.com](https://supabase.com) dan buat project baru.
2. Masuk ke **SQL Editor**, lalu jalankan query berikut buat bikin tabel & aktifkan keamanan RLS:

```sql
-- 1. Buat tabel transaksi
create table transactions (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  date date not null default current_date,
  type text check (type in ('pemasukan', 'pengeluaran')) not null,
  amount numeric not null,
  description text not null
);

-- 2. Aktifkan Row Level Security (RLS)
alter table transactions enable row level security;

-- 3. Policy RLS: User cuma bisa CRUD datanya sendiri
create policy "User bisa mengelola transaksi sendiri" 
on transactions for all 
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
