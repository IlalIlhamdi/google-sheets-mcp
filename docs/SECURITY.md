# Keamanan dan batas rancangan

## Pembatas yang diterapkan

- Semua operasi Sheets memeriksa ID terhadap allowlist, termasuk membaca metadata. Perintah CLI `verify` adalah pengecualian yang sengaja dibuat untuk operator menguji kandidat sebelum dimasukkan; tidak diekspos sebagai MCP tool.
- Default hanya baca. Tools tulis tidak diiklankan sampai `ENABLE_WRITES=true`; service juga memeriksa ulang sakelar itu. Mode tulis memerlukan scope Google yang cocok dan login ulang.
- OAuth Desktop memakai `state`, PKCE S256, callback loopback port acak, dan timeout. URL auth/token Google ditetapkan library, bukan diambil bebas dari JSON yang diunduh.
- Windows menyimpan refresh token dengan DPAPI CurrentUser. Access token berada di memori dan disegarkan oleh library Google. Tidak ada token yang dicetak ke log. File token ditulis secara atomik. Pada non-Windows, vault berupa JSON dengan mode 0600; enkripsi at-rest non-Windows belum diimplementasikan.
- Fitur HTTP wajib OAuth JWT. Memeriksa tanda tangan, issuer, audience, expiration, subject, dan scope. Subject harus ada dalam daftar eksplisit. Tidak ada fallback anonymous/static key.
- HTTP memeriksa Host dan Origin, membatasi body 256 KB, serta menerapkan batas bersama 120 request MCP/menit. Proses bind ke loopback. Mode HTTP stateless tidak menyimpan session bearer tambahan.
- Tool input dibatasi: nama tab valid, rentang A1 terbatas, matriks persegi, ukuran payload, batas hasil. Tidak menerima batchUpdate arbitrer, URL API, Drive query, atau path filesystem dari model.
- `write_cells` dan `append_rows` memakai RAW untuk menghindari formula dieksekusi dari teks biasa. Rumus hanya lewat `set_formula` yang eksplisit.
- Log MCP hanya nama tool, status, dan durasi; tidak berisi nilai sel, argumen lengkap, token, atau respons error Google mentah. `doctor`/`verify` memang menampilkan ID, judul, dan metadata untuk operator.
- Pembacaan dapat diulang maksimal dua kali untuk error Google sementara. Operasi tulis menonaktifkan retry request pada client API; tidak ada janji exactly-once jika klien/AI mengirim ulang operasi.

## Hal yang bukan jaminan keamanan

Allowlist tidak mengecilkan scope token di Google. Scope `spreadsheets` dapat mencakup file lain yang dapat diakses akun pemilik. Gunakan akun khusus dengan berbagi file terbatas jika ingin pembatas Google-side. Protected ranges dan hak Viewer/Editor tetap ditegakkan Google.

`confirm:true`, anotasi MCP, dan instruksi untuk AI membantu transparansi. Itu **bukan persetujuan manusia yang diverifikasi secara kriptografis**; AI/klien dapat mengisi boolean. Persetujuan sesungguhnya harus berasal dari permintaan pengguna dan kontrol aksi klien. Untuk pembatas keras, matikan writes atau gunakan akun Google hanya-baca. Tidak ada workflow approval terpisah dalam server ini.

Semua subject yang diperbolehkan memakai **Google token pemilik yang sama**. Jangan menambahkan rekan kerja ke subject allowlist tanpa memang hendak memberi akses file tersebut. Penyimpanan per-user/per-tenant dan isolasi grant belum tersedia. Mode tunnel mengandalkan kebijakan akses tunnel yang setara.

Teks di sel bisa berisi prompt injection. Instruksi server menyatakan data sel tidak boleh diperlakukan sebagai perintah; ini tidak menjamin model kebal. Batasi file yang dibaca, gunakan kontrol aksi klien, dan periksa target serta perubahan. Formula yang sengaja dijalankan bisa memakai fungsi eksternal seperti IMPORTXML/IMPORTRANGE; penilaian rumus tetap diperlukan. Paket tidak mencoba memblokir fungsi tertentu dengan pencocokan teks yang mudah dilewati.

Tidak ada transaksi lintas beberapa tool, undo otomatis, penguncian terhadap editor lain, compare-and-swap, atau deduplikasi append yang persisten. `append_rows` dan `create_tab` tidak idempotent. Jika timeout setelah tulis, lihat isi aktual dan riwayat perubahan Google sebelum memutuskan mengulang. Label idempotent pada update berarti payload sama menargetkan rentang sama, bukan jaminan bebas konflik saat orang lain mengedit.

## Menjaga rahasia

Folder `.secrets` dan `.env` diabaikan Git, tetapi `.gitignore` bukan enkripsi atau kontrol akses. Jangan unggah ke chat/repo, memasukkannya ke ZIP, atau menyajikan folder proyek lewat web server. Skrip setup membatasi ACL `.secrets`; bila path rahasia diubah ke luar folder itu, operator perlu membatasi ACL lokasi baru. DPAPI tidak melindungi dari malware yang berjalan sebagai akun Windows yang sama.

Gunakan akun Windows dan Google yang sesuai untuk menjalankan proses. Menjalankan sebagai SYSTEM atau akun service berbeda tidak dapat membuka vault milik akun sebelumnya. Backup source dan konfigurasi nonrahasia; login ulang lebih aman daripada mengirim refresh token antarmesin.

## Pencabutan dan insiden

1. Hentikan server/tunnel untuk menghentikan akses baru.
2. Jalankan `npm.cmd run revoke` untuk mencabut grant Google dan menghapus vault lokal setelah revocation sukses. Jika token sudah rusak atau pencabutan gagal, cabut aplikasi melalui [koneksi akun Google](https://myaccount.google.com/connections) dan hapus file token lokal secara manual.
3. Cabut sesi/token/grant pada provider MCP serta runtime key tunnel jika ada. Menghapus koneksi ChatGPT saja tidak sama dengan mencabut token Google server.
4. Putar kredensial yang bocor, tinjau berbagi file dan riwayat perubahan, lalu login ulang.

Untuk produksi, tambahkan pengelolaan TLS/provider yang stabil, monitoring, kuota/proxy sesuai kebutuhan, patch dependensi, retensi log, dan pemulihan. Paket ini adalah server pribadi yang dapat dijalankan, bukan layanan SaaS multi-tenant yang sudah diaudit.
