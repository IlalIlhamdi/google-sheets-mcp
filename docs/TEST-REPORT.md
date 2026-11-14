# Laporan pengujian

Tanggal: **14 November 2026** (Asia/Bangkok).

Lingkungan: Windows, Node.js **24.19.0**, npm **11.17.0**. Versi dependensi direkam dalam `package-lock.json`.

## Hasil yang benar-benar dijalankan

| Pemeriksaan | Hasil |
| --- | --- |
| Instalasi paket dari npm, lockfile terbentuk | Berhasil; audit saat pemasangan melaporkan 0 kerentanan |
| `npm.cmd run check` | Lulus pemeriksaan sintaks JavaScript |
| Parser PowerShell untuk `scripts/setup.ps1` | Lulus; skrip setup tidak dijalankan terhadap kredensial pengguna |
| `npm.cmd test` | **16 lulus, 0 gagal** |
| Proses stdio dengan SDK MCP client asli | Initialize, list tools, read tool, dan tool tulis simulasi berhasil |
| HTTP loopback dengan SDK MCP client asli | Metadata, challenge 401, initialize, list tools, read tool berhasil |
| Validasi JWT bertanda tangan lokal | Token benar diterima; issuer/audience/scope/sub/expiry/signature salah ditolak |
| Host dan Origin tidak diizinkan | Ditolak |
| Allowlist setiap operasi Sheets | ID di luar daftar ditolak sebelum pemanggilan Google simulasi |
| Sakelar read-only dan flag confirm | Ditegakkan; tools tulis hanya muncul saat diaktifkan |
| Escaping nama tab, RAW vs formula, batas range/matriks | Lulus |
| Write gagal dengan status sementara | Tidak dicoba ulang otomatis oleh service |
| Vault token Windows | Round-trip DPAPI lulus; token uji tidak terlihat dalam file tersimpan |
| Tautan Drive lama pada perintah verify | Ditolak sebagai URL yang belum membuktikan spreadsheet |
| `npm.cmd run doctor` tanpa konfigurasi pengguna | Berhenti dengan pesan "No spreadsheet configured", sebagaimana diharapkan |

Uji HTTP pertama terhalang izin koneksi loopback lingkungan, lalu dijalankan dengan akses jaringan lokal yang diizinkan. Ada penyesuaian fixture host pengujian agar memakai port dinamis; pengujian akhir seluruhnya lulus. Ini tidak mengubah pengamanan host server produksi.

## Batas bukti

Google Sheets API dalam pengujian otomatis menggunakan objek simulasi. Pengujian ini membuktikan pemetaan request, pembatas input/akses, protokol MCP lokal/HTTP, dan pemeriksaan token, **bukan** akses ke akun Google nyata.

Belum tersedia dalam sesi penyusunan:

- JSON Google OAuth Desktop milik pengguna dan consent Google.
- Spreadsheet tujuan yang telah terverifikasi melalui Sheets API.
- Penyedia OAuth remote, domain/TLS publik, dan login pengguna provider.
- Koneksi terpasang di Antigravity, ChatGPT, atau Secure MCP Tunnel.

Karena itu belum ada klaim koneksi Google, izin tulis aktual, refresh token nyata, rumus Google, endpoint internet, maupun kompatibilitas akun ChatGPT yang sudah berhasil end-to-end. Tidak ada spreadsheet pengguna yang dibaca atau diubah.

## Penerimaan setelah konfigurasi pengguna

1. `npm.cmd run auth`: consent berhasil dan vault dibuat.
2. `npm.cmd run verify -- URL_SHEETS`: ID dikonfirmasi oleh Google.
3. Isi allowlist; jalankan `npm.cmd run doctor` dan `npm.cmd run smoke`: metadata serta pembacaan lewat MCP berhasil.
4. Untuk tulis, gunakan spreadsheet percobaan; aktifkan scope/write, login ulang, dan jalankan `npm.cmd run smoke:write -- ID --confirm`. Periksa tab `MCP_Test_*` yang ditinggalkan.
5. Dari Antigravity, panggil list_tabs dan read_sheet. Dari ChatGPT yang mendukungnya, lakukan hal yang sama melalui tunnel atau HTTPS + OAuth. Catat hasil aktual serta izin/konfirmasi klien.

Jangan mengubah status tahapan tersebut menjadi "lulus" hanya karena endpoint hidup atau uji simulasi berhasil.
