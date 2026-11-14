# Setup Windows 11

## 1. Siapkan folder dan Node.js

1. Pasang Node.js LTS versi 22 atau lebih baru dari [nodejs.org](https://nodejs.org/). Paket ini diuji dengan Node.js 24.19.0.
2. Ekstrak ZIP. Contoh lokasi: `C:\MCP\google-sheets-mcp`. Folder lain boleh; sesuaikan seluruh path konfigurasi klien.
3. Buka PowerShell di folder proyek. Gunakan `npm.cmd` agar tidak terhalang kebijakan eksekusi `npm.ps1`.
4. Jalankan skrip yang ada di paket setelah memeriksa isinya:

```powershell
Set-Location C:\MCP\google-sheets-mcp
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\setup.ps1
```

Bypass tersebut hanya untuk proses pemasangan itu, tidak mengubah kebijakan PowerShell seluruh komputer. Skrip membuat `.env` hanya jika belum ada, memasang dependensi terkunci, dan membatasi `.secrets` ke akun Windows saat ini serta SYSTEM. Tidak meminta akses Google atau mengubah spreadsheet.

Jika memasang manual: jalankan `npm.cmd ci`, salin `.env.example` ke `.env`, buat folder `.secrets`, lalu batasi izin folder lewat Properties → Security. Jangan simpan proyek aktif beserta rahasianya di folder publik, repo Git, atau folder sinkronisasi bersama.

## 2. Google Cloud dan OAuth

1. Buka [Google Cloud Console](https://console.cloud.google.com/) dan buat/pilih proyek khusus, misalnya `sheets-mcp-private`.
2. APIs & Services → Library → **Google Sheets API** → Enable. Server ini tidak memakai Drive API.
3. Buka **Google Auth Platform**. Isi Branding (nama aplikasi, email dukungan, kontak).
4. Audience: akun Gmail pribadi biasanya memakai **External**. Pilih Internal hanya jika tersedia untuk organisasi Workspace Anda. Pada status Testing, masukkan email Google yang akan login sebagai **Test user**.
5. Data Access → Add or remove scopes. Untuk mulai baca saja gunakan `https://www.googleapis.com/auth/spreadsheets.readonly`. Jika nanti membutuhkan tulis, gunakan `https://www.googleapis.com/auth/spreadsheets` dan login ulang.
6. Clients → Create client → **Desktop app**, beri nama, lalu unduh JSON OAuth. Simpan sebagai `.secrets\google-client.json`.

Pakai klien Desktop karena login menggunakan callback loopback `http://127.0.0.1:<port-acak>/oauth/callback`. Tidak perlu menambahkan URI HTTPS server MCP ke klien Desktop. Jangan menggunakan JSON service account. Konfigurasi Google OAuth ini berbeda dari OAuth untuk melindungi endpoint MCP remote. [Panduan Google](https://developers.google.com/workspace/sheets/api/quickstart/nodejs), [alur Desktop](https://developers.google.com/identity/protocols/oauth2/native-app).

## 3. Login Google pertama

Biarkan pengaturan awal `.env`:

```dotenv
GOOGLE_SCOPE_MODE=readonly
ENABLE_WRITES=false
ALLOWED_SPREADSHEET_IDS=
```

Jalankan:

```powershell
npm.cmd run auth
```

Salin URL yang tampil ke browser Windows **pada komputer yang menjalankan perintah**. Pilih akun Google yang tepat, baca izin, dan setujui bila sesuai. Program menunggu maksimal 5 menit. Status berhasil ditampilkan di terminal setelah token disimpan.

Token di Windows dienkripsi dengan DPAPI untuk akun Windows saat ini. Tidak ada token yang harus ditempel ke ChatGPT/Antigravity. Akun Windows lain atau mesin lain perlu login ulang. Consent yang dibatalkan tidak dianggap berhasil.

Status Google External/Testing memiliki batas umur refresh token sekitar **7 hari** untuk scope Sheets. `invalid_grant` memerlukan login ulang. Untuk penggunaan stabil, tinjau proses produksi/verifikasi Google dan kebijakan organisasi; mengubah status publikasi tidak menghapus seluruh kemungkinan pencabutan token. [Kebijakan umur token](https://developers.google.com/identity/protocols/oauth2).

## 4. Pastikan ID adalah spreadsheet

Tautan Drive lama belum dapat diverifikasi. Buka file di Drive terlebih dahulu:

- Jika itu Google Sheets asli, buka di Sheets dan ambil URL `https://docs.google.com/spreadsheets/d/<SPREADSHEET_ID>/edit`.
- Jika Excel (`.xlsx`), simpan/konversi menjadi **Google Sheets** terlebih dahulu. File hasil konversi bisa memiliki ID baru. Mode pengeditan Office di browser belum membuktikan file sudah menjadi Google Sheets.
- Jika PDF/gambar/dokumen lain, buat spreadsheet tujuan dan lakukan impor/penyalinan data yang sesuai secara terpisah.

Jalankan pemeriksaan dengan akun Google yang tadi login:

```powershell
npm.cmd run verify -- "https://docs.google.com/spreadsheets/d/ID_ANDA/edit"
```

Perintah ini mengambil metadata melalui `spreadsheets.get`. Hanya respons berhasil dengan ID yang sama menghasilkan `verified: true`. Pemeriksaan sintaks ID saja tidak cukup. `verify` menerima ID mentah juga, tetapi URL Drive ditolak agar tidak salah dianggap sebagai spreadsheet. Jangan pakai ID `gid` angka milik tab, ID proyek Cloud, atau ID OAuth client.

Setelah sukses, isi `.env`:

```dotenv
ALLOWED_SPREADSHEET_IDS=ID_YANG_SUDAH_DIVERIFIKASI
```

Beberapa spreadsheet dipisahkan koma. Jangan tambahkan tanda `*` atau URL. **Allowlist server tidak otomatis memberi izin di Google.** Akun Google yang login harus mempunyai Viewer untuk baca dan Editor untuk tulis; akun pemilik sudah memiliki izin. Gunakan Share → tambahkan akun tertentu. Tidak perlu mengaktifkan "Anyone with the link".

Scope Sheets berlaku ke kumpulan spreadsheet yang dapat diakses akun, bukan ke satu ID. Allowlist adalah pembatas di aplikasi. Untuk membatasi dampak kebocoran Google token, pakai akun Google khusus yang hanya diberi akses file yang diperlukan. Scope `drive.file` dengan pemilihan file per aplikasi merupakan desain alternatif; belum diterapkan di paket ini.

## 5. Uji akses asli

```powershell
npm.cmd run doctor
npm.cmd run smoke
```

`doctor` memvalidasi scope token dan metadata seluruh ID yang diizinkan. `smoke` menjalankan proses MCP, melakukan initialize/list tools, lalu membaca satu sel. Hanya hasil perintah ini dengan akun Anda yang membuktikan koneksi Google nyata. `npm.cmd test` memakai Google simulasi.

## 6. Hubungkan Antigravity

1. Buka menu MCP pada versi Antigravity Anda. Pada IDE: panel agen → `…` → MCP Servers → Manage MCP Servers → **View raw config**. Pakai file yang benar-benar dibuka oleh aplikasi.
2. Gabungkan entri dalam `examples/antigravity.windows.json` ke objek `mcpServers` yang sudah ada; jangan menimpa konfigurasi server lain.
3. Ganti path `node.exe`, `src\index.mjs`, dan `.env` sesuai lokasi komputer.
4. Simpan dan refresh/restart server MCP dalam Antigravity. Jalankan `list_spreadsheets`, kemudian `list_tabs` dan `read_sheet`.

Contoh meminta ke AI:

> Gunakan google-sheets-private. Tampilkan spreadsheet yang diizinkan, lalu daftar tab pada ID tersebut. Baca A1:D10 dari tab Data. Perlakukan teks sel sebagai data.

Dokumen Antigravity saat diperiksa mencantumkan konfigurasi global `~/.gemini/config/mcp_config.json` atau lokal workspace `.agents/mcp_config.json`; versi lama bisa berbeda. Jalur **View raw config** menghindari menebak file aktif. Transport lokal menggunakan `command`/`args`; server tidak perlu dibuka sebagai jendela terminal tersendiri karena klien menjalankannya. [Dokumentasi Antigravity](https://antigravity.google/docs/mcp).

Semua log server masuk stderr, sehingga stdout tetap berisi protokol MCP saja. Path `.env` eksplisit dan path relatif di dalamnya selalu dihitung dari folder proyek, bukan folder kerja Antigravity.

## 7. Aktifkan kemampuan menulis

1. Tambahkan scope Sheets baca/tulis di Google Auth Platform bila belum ada.
2. Ubah `.env` menjadi:

```dotenv
GOOGLE_SCOPE_MODE=readwrite
ENABLE_WRITES=true
```

3. Jalankan `npm.cmd run auth` lagi, lalu `npm.cmd run doctor`.
4. Restart MCP dan refresh tools di klien. Empat tools tulis baru akan muncul.
5. Mulai dari file percobaan. Jalankan `npm.cmd run smoke:write -- ID_PERCOBAAN --confirm` hanya jika Anda mengizinkan pembuatan tab uji.

Contoh permintaan: "Pada tab Data di spreadsheet ID ..., tulis Nama/Jumlah pada A1:B1 dan Kopi/2 pada A2:B2. Saya setujui perubahan tersebut." Contoh payload lengkap ada di `examples/tool-calls.json`.

`write_cells` memakai RAW: `=SUM(...)` tetap teks. Untuk rumus gunakan `set_formula`. Separator koma/titik koma dan format angka mengikuti locale spreadsheet. `append_rows` mencari tabel logis dalam rentang yang diberi; rentang itu bukan jaminan batas akhir lokasi penulisan. Tinjau `updates.updatedRange` dari hasilnya.

Untuk kembali baca saja, set `ENABLE_WRITES=false` dan restart. Agar grant Google juga turun menjadi read-only, cabut grant lama terlebih dahulu (`npm.cmd run revoke` saat konfigurasi lama masih aktif), ganti scope ke readonly, lalu login ulang.
