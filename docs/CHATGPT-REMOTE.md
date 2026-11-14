# Menghubungkan ChatGPT

## Dukungan klien dan status paket

Custom MCP tidak otomatis tersedia pada semua akun, paket, atau permukaan ChatGPT. Dokumen OpenAI yang diperiksa 14 November 2026 menyebut dukungan penuh, termasuk tulis, pada Business dan Enterprise/Edu dengan izin workspace; Pro disebut mendukung custom MCP baca/fetch. Deep research hanya memakai kemampuan baca. Periksa fitur yang benar-benar terlihat di akun Anda dan aturan admin. [Ketentuan dan batas klien](https://help.openai.com/en/articles/12584461-connecting-custom-mcp-servers-in-chatgpt).

ChatGPT web tidak menjalankan entri `command: node` di komputer Anda seperti Antigravity. Pilih **Secure MCP Tunnel** untuk server privat jika tersedia, atau endpoint **HTTPS Streamable HTTP**. Custom MCP kini dapat ditambahkan melalui [ChatGPT Plugins](https://chatgpt.com/plugins) → `+` → Add custom MCP server. Jalur workspace lama bisa melalui Apps/Manage Legacy Apps. Menu, izin, dan ketersediaan dapat berubah. [Petunjuk koneksi resmi](https://developers.openai.com/plugins/deploy/connect-chatgpt).

Paket ini tidak mendaftarkan, menerbitkan, atau memasang plugin ke akun Anda. File `antigravity.windows.json` bukan paket yang dapat diunggah langsung ke ChatGPT. Menempelkan kode server atau URL localhost ke chat juga tidak membuat tools aktif.

## Pilihan A — Secure MCP Tunnel ke stdio

Pilihan ini memakai server lokal yang sama dengan Antigravity. Google OAuth dan allowlist tetap berlaku. Akses ke tunnel bergantung pada organisasi Platform, workspace ChatGPT, dan izin tunnel; siapa pun yang diizinkan memakai tunnel dapat menjalankan tools menggunakan akun Google pemilik. Jangan membagikan tunnel ini ke pengguna yang tidak dipercaya.

1. Selesaikan `npm.cmd run doctor` dan `npm.cmd run smoke` di Windows.
2. Buka [Platform tunnel settings](https://platform.openai.com/settings/organization/tunnels), buat tunnel, dan kaitkan ke workspace tujuan. Pastikan Anda memiliki izin membuat/menggunakan tunnel.
3. Unduh `tunnel-client` Windows dari tautan di halaman tersebut atau [rilis resmi](https://github.com/openai/tunnel-client/releases/latest). Periksa petunjuk versi terpasang dengan `tunnel-client help quickstart`.
4. Masukkan runtime API key secara lokal, tanpa menaruhnya di chat atau file proyek. Contoh PowerShell:

```powershell
$runtimeKey = Read-Host 'Runtime API key untuk tunnel' -AsSecureString
$env:CONTROL_PLANE_API_KEY = [Net.NetworkCredential]::new('', $runtimeKey).Password
```

5. Dari folder proyek, buat profil stdio sesuai opsi yang ditampilkan versi CLI Anda. Contoh untuk path tanpa spasi:

```powershell
tunnel-client init --sample sample_mcp_stdio_local --profile sheets-local --tunnel-id TUNNEL_ID_ANDA --mcp-command "node C:/MCP/google-sheets-mcp/src/index.mjs"
tunnel-client doctor --profile sheets-local --explain
tunnel-client run --profile sheets-local
```

6. Pada Add custom MCP server di ChatGPT, pilih Connection: **Tunnel**, lalu tunnel yang sama. Selesaikan kontrol autentikasi/akses yang disediakan akun; mode stdio paket ini mengandalkan batas akses tunnel dan tidak meminta JWT endpoint publik.
7. Buat koneksi/plugin, lihat daftar tools, lalu panggil `list_tabs` dan `read_sheet`. Setelah itu uji tulis pada file percobaan hanya jika klien mengizinkannya.

Jaga proses tunnel dan komputer tetap hidup. Setelah berhenti, hapus key dari sesi terminal dengan `Remove-Item Env:CONTROL_PLANE_API_KEY`; tutup terminal. Runtime key tunnel bukan Google token. Opsi ini belum dijalankan dalam penyusunan paket; tersedia sesuai dokumentasi resmi dan harus diuji pada workspace Anda. [Setup dan batas Secure MCP Tunnel](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels).

## Pilihan B — Endpoint HTTPS dengan OAuth

Server sudah mengimplementasikan `/mcp`, metadata protected resource, challenge 401, dan validasi JWT. Anda masih perlu **alamat HTTPS stabil dan authorization server OAuth**. Tidak ada mode HTTP publik tanpa autentikasi atau kunci statis dalam proyek ini.

Ada dua hubungan izin yang terpisah:

| Hubungan | Kredensial | Penyimpanan/validasi |
| --- | --- | --- |
| Server → Google | Google OAuth Desktop pemilik | Refresh token DPAPI lokal |
| ChatGPT → server MCP | Access token dari penyedia OAuth MCP | JWT diverifikasi issuer, audience, exp, sub, scope, dan tanda tangan |

Jangan menggunakan Google access token sebagai bearer token endpoint MCP. Audience token Google bukan server MCP. Server tidak meneruskan token ChatGPT ke Google.

### B1. Authorization server

Gunakan penyedia OAuth/OIDC yang mendukung authorization code + PKCE S256 dan konfigurasi klien ChatGPT. Proyek ini menerima access token JWT **RS256 atau ES256** dengan claim `scope` berupa string, serta OIDC discovery. Token opaque/introspection, HS256, dan provider dengan format claim lain belum didukung.

Contoh konkret memakai **Keycloak dengan HTTPS yang sudah dikelola**:

1. Buat realm privat, misalnya `sheets`. Matikan registrasi mandiri jika tidak diperlukan. Buat akun pemilik dan catat UUID user sebagai `MCP_ALLOWED_SUBJECTS`.
2. Buat client OIDC untuk ChatGPT. Aktifkan Standard flow, wajibkan PKCE `S256`, matikan Direct access grants dan Service accounts. Pilih metode autentikasi client yang didukung pengaturan ChatGPT Anda.
3. Buat client scope `sheets:mcp`, aktifkan penyertaan dalam claim `scope`, dan kaitkan ke client sebagai Optional scope. Tambahkan mapper Audience dengan **Included Custom Audience** = URL MCP persis, misalnya `https://sheets.example.com/mcp`, untuk access token.
4. Atur redirect URI persis dari halaman pengaturan koneksi ChatGPT. Jangan menebak callback lama atau memasang wildcard. Simpan client ID/secret pada pengaturan OAuth ChatGPT bila jalur predefined client tersedia. Jangan taruh secret tersebut di `.env` server: server hanya memverifikasi token publik melalui JWKS.
5. Bila workspace memakai CIMD/DCR, konfigurasi mekanisme tersebut pada provider, termasuk batas domain dan izin pendaftaran. Jangan membuka registrasi klien tak terbatas hanya untuk melewati error. Ikuti panduan versi provider.
6. Buka `https://AUTH_DOMAIN/realms/sheets/.well-known/openid-configuration`. Catat `issuer` dan `jwks_uri` persis; pastikan `code_challenge_methods_supported` memuat `S256` dan endpoint OAuth menggunakan HTTPS.

Keycloak mendokumentasikan pengikatan audience melalui client scope; dukungan native `resource-indicators` dan CIMD bergantung versi/fitur dan masih ditandai eksperimental pada dokumen yang diperiksa. Gunakan mekanisme yang didukung deployment Anda dan verifikasi bahwa `aud` token sama dengan URL MCP. [Panduan Keycloak MCP](https://www.keycloak.org/securing-apps/mcp-authz-server).

ChatGPT dapat memakai predefined clients, CIMD, atau DCR sesuai permukaan dan konfigurasi. Discovery/PKCE/audience yang salah membuat koneksi gagal walaupun login browser terlihat berhasil. Paket ini tidak menyediakan authorization server atau menangani login multi-pengguna. [Kontrak autentikasi OpenAI](https://developers.openai.com/plugins/build/auth).

### B2. Isi konfigurasi remote

```dotenv
HTTP_PORT=3000
MCP_PUBLIC_URL=https://sheets.example.com/mcp
MCP_OAUTH_ISSUER=https://auth.example.com/realms/sheets
MCP_JWKS_URI=https://auth.example.com/realms/sheets/protocol/openid-connect/certs
MCP_REQUIRED_SCOPE=sheets:mcp
MCP_ALLOWED_SUBJECTS=UUID_USER_PEMILIK
MCP_ALLOWED_ORIGINS=
```

Domain dan UUID di atas hanya contoh. `MCP_PUBLIC_URL` harus berakhir `/mcp`, tanpa slash tambahan. Nilai ini juga menjadi audience JWT. Scope MCP `sheets:mcp` berbeda dari scope Google. Tambahkan browser origin secara eksplisit hanya jika memang dibutuhkan; klien server-to-server biasanya tidak mengirim header Origin.

Jalankan:

```powershell
npm.cmd run doctor -- --remote
npm.cmd run start:http
```

Startup gagal jika konfigurasi atau discovery provider tidak cocok. `doctor --remote` mengecek discovery, bukan membuktikan seluruh alur login provider.

### B3. Hubungkan HTTPS

Jalankan reverse proxy/tunnel HTTPS tepercaya **pada komputer yang sama** ke `http://127.0.0.1:3000`. Server sengaja hanya bind loopback. Gunakan alamat stabil agar resource/audience tidak berubah. Proxy harus meneruskan header `Authorization`, content type, dan header MCP; Host upstream harus berupa host publik yang dikonfigurasi atau `127.0.0.1:3000`/`localhost:3000`.

Publikasikan `/mcp`, `/.well-known/oauth-protected-resource/mcp`, dan `/.well-known/oauth-protected-resource`. Jangan mengaktifkan akses file statis ke folder proyek. `.env`, `.secrets`, dan source token tidak boleh disajikan oleh proxy. Node tidak mengakhiri TLS sendiri; sertifikat dan HTTPS ditangani proxy. Tidak perlu membuka port 3000 ke LAN/internet.

Periksa dari jaringan yang bisa mencapai endpoint:

```powershell
Invoke-RestMethod 'https://sheets.example.com/.well-known/oauth-protected-resource/mcp'
curl.exe -i -X POST 'https://sheets.example.com/mcp' -H 'Content-Type: application/json' --data '{}'
```

Tanpa token, respons `/mcp` **harus 401** dengan `WWW-Authenticate` yang menunjuk ke metadata. Respons 200 tanpa token adalah kegagalan pengamanan. `/healthz` hanya membuktikan proses hidup, bukan akses Google.

### B4. Tambahkan ke ChatGPT dan uji

Di ChatGPT Plugins → Add custom MCP server, masukkan `https://DOMAIN_ANDA/mcp`, pilih OAuth, dan selesaikan konfigurasi provider serta login pemilik. Tinjau daftar tools yang ditemukan. Panggil berurutan `list_spreadsheets`, `list_tabs`, dan `read_sheet` pada rentang kecil. Refresh metadata setelah kemampuan tulis diaktifkan.

MCP tools generik dapat digunakan untuk aksi jika klien mendukungnya; tools khusus `search`/`fetch` tidak diwajibkan untuk percakapan biasa. Namun integrasi pencarian/company knowledge memiliki persyaratan sendiri dan paket ini tidak mengimplementasikan kontrak search/fetch. [Batasan ChatGPT](https://help.openai.com/en/articles/12584461-connecting-custom-mcp-servers-in-chatgpt).

Jika akun tidak menyediakan custom MCP atau aksi tulis, server tidak dapat memaksakan dukungan itu. Gunakan Antigravity lokal, workspace yang mendukungnya, atau integrasi API terpisah yang memang diotorisasi. Langganan ChatGPT tidak otomatis berarti izin/billing API maupun tunnel sudah disiapkan.

## Operasional

Untuk penggunaan pribadi, jalankan proses di foreground selama pengujian. Untuk selalu aktif, gunakan Windows Task Scheduler dengan akun Windows yang sama (token DPAPI terikat akun tersebut), direktori kerja proyek, restart saat gagal, dan log terlindungi. Jangan memindahkan vault DPAPI ke server Linux; autentikasi dan pengelolaan secret harus disiapkan ulang di host baru. Hosting HTTP, penyedia identitas, TLS publik, dan login dari ChatGPT belum diuji end-to-end dalam paket ini.
