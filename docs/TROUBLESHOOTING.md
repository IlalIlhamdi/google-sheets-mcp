# Mengatasi masalah

| Gejala | Periksa / tindakan |
| --- | --- |
| `npm.ps1 cannot be loaded` | Gunakan `npm.cmd`; tidak perlu mengubah execution policy global. |
| `node` tidak ditemukan | Pasang Node LTS >=22, buka terminal baru, atau gunakan path lengkap node.exe. |
| JSON OAuth tidak terbaca | Nama/path `.secrets\google-client.json`, JSON valid, tipe **Desktop app**, bukan service account. |
| `access_denied` saat consent | Akun yang dipilih harus ada di Test users; cek kebijakan Workspace. Jangan mengatasi dengan berbagi file publik. |
| `redirect_uri_mismatch` | Gunakan OAuth Desktop, login di browser komputer yang sama, bukan klien Web dengan callback lain. |
| OAuth timeout | Perintah dan browser harus berjalan pada PC yang sama; selesaikan dalam 5 menit lalu ulangi jika perlu. Jangan menempelkan code ke chat. |
| `invalid_grant` / token kedaluwarsa | Login ulang. External/Testing untuk scope Sheets memiliki umur refresh token terbatas; grant juga bisa dicabut. |
| Cannot access token vault | Pakai akun Windows/mesin pembuat token. Jika berubah, lakukan auth ulang; jangan menonaktifkan enkripsi. |
| No spreadsheet configured | Login dulu, jalankan `verify`, masukkan ID hasilnya ke `.env`. |
| Drive URL ditolak | Buka/konversi menjadi Google Sheets, ambil URL `/spreadsheets/d/...`; file Drive tidak otomatis Sheets. |
| Google 404 | Salah ID/jenis file atau akun tidak punya akses. `gid` bukan spreadsheet ID. |
| Google 403 | Aktifkan Sheets API di proyek yang benar, periksa scope, Viewer/Editor, protected ranges, dan kebijakan organisasi. |
| Tools tulis tidak muncul | Set mode readwrite dan ENABLE_WRITES=true, auth ulang, restart proses MCP, lalu refresh daftar tools klien. |
| Range invalid | Pisahkan `sheet` dan `range`. Gunakan `A1:D20`, bukan `Data!A1:D20`, `A:A`, atau named range. |
| Nilai `=SUM(...)` tampil sebagai teks | RAW memang mempertahankan teks. Gunakan `set_formula` untuk rumus. |
| Rumus error | Lihat locale dari list_tabs, separator argumen, nama tab, dan fungsi Sheets. Baca kembali dengan render FORMULA. |
| Append masuk ke baris tidak terduga | Google mendeteksi tabel logis. Pilih tableRange yang benar, periksa updatedRange, dan jangan mengulang tanpa membaca hasil. |
| 429 Google | Tunggu, kecilkan rentang/frekuensi; periksa kuota proyek. Baca otomatis mencoba ulang terbatas, tulis tidak. |
| MCP process closed / JSON invalid | Jalankan node langsung sesuai contoh, path absolut, dan pastikan auth sudah dilakukan. Jangan menambahkan banner stdout ke server. |
| HTTP startup ditolak | Isi public URL, issuer, JWKS, allowed subject; gunakan HTTPS dan discovery yang menyebut S256. |
| HTTP 401 | Metadata itu normal tanpa token. Setelah login, cek issuer/audience/scope/sub/expiry; jangan log token mentah. |
| HTTP 403 | Host/Origin tidak diizinkan. Sesuaikan proxy ke host yang dikonfigurasi; jangan menonaktifkan pemeriksaan. |
| HTTP 405 pada GET /mcp | Mode stateless tidak menyediakan SSE GET persisten. Gunakan klien Streamable HTTP yang melakukan POST. |
| HTTP 413 / hasil terlalu besar | Pecah request/rentang; jangan menaikkan batas sembarangan. |
| ChatGPT tidak menemukan localhost | Gunakan Secure MCP Tunnel yang tersedia atau HTTPS remote; command stdio tidak dijalankan oleh ChatGPT web. |
| Tidak ada menu custom MCP / write diblokir | Periksa paket akun, workspace, izin admin, dan permukaan ChatGPT; server tidak dapat mengubah pembatas klien. |
| Tunnel tidak muncul | Periksa asosiasi workspace/organisasi dan izin Read + Use, lalu kesehatan tunnel-client. |
| Uji HTTP otomatis gagal EACCES | Lingkungan mungkin melarang koneksi loopback; jalankan tes di terminal Windows yang mengizinkan jaringan lokal. Jangan mematikan firewall seluruhnya. |

## Urutan diagnosis

```powershell
node --version
npm.cmd ci
npm.cmd run check
npm.cmd test
npm.cmd run doctor
npm.cmd run smoke
```

Untuk HTTP tambahkan `npm.cmd run doctor -- --remote`, cek metadata HTTPS, challenge 401, lalu login provider dan panggil tool dari klien. `healthz=ok` tidak menggantikan tes Google. Kirim hanya pesan error yang sudah disamarkan, versi Node, dan tahap yang gagal jika memerlukan bantuan; jangan sertakan `.env`, JSON kredensial, URL callback berisi code, atau vault token.
