# Product Requirements Document (PRD) — SandiChat

**Versi Dokumen:** 1.0  
**Tanggal:** 19 November 2026  
**Nama Produk:** SandiChat  
**Tipe Aplikasi:** Web Full-Stack (React SPA + Express/WebSocket Zero-Knowledge Relay)

---

## 1. Ringkasan Eksekutif & Latar Belakang

**SandiChat** adalah aplikasi komunikasi pesan teks dan suara *real-time* yang dirancang dengan prinsip **enkripsi end-to-end (E2EE)** dan **privasi zero-knowledge**. Aplikasi ini memungkinkan pengguna mendaftar dengan `@username`, menemukan serta menghubungi sesama pengguna secara langsung, mengirim pesan teks dan rekaman suara terenkripsi, melakukan panggilan suara *peer-to-peer*, serta terhubung dengan ruang kerja **Google Chat** secara aman.

Seluruh proses enkripsi dan dekripsi berlangsung 100% di sisi klien (*browser*) menggunakan **Web Crypto API**, sehingga server penghubung (*relay*) maupun pihak ketiga tidak dapat membaca isi pesan teks ataupun mendengarkan rekaman suara.

---

## 2. Tujuan Produk & Sasaran Pengguna

### 2.1 Tujuan Utama
1. Menyediakan sarana komunikasi teks dan suara yang mudah digunakan melalui identitas `@username` tanpa mengorbankan privasi kriptografi.
2. Menjamin kerahasiaan data (*confidentiality*) dan keutuhan pesan (*integrity*) melalui enkripsi terotentikasi **AES-256-GCM** dan pertukaran kunci **ECDH P-256**.
3. Memberikan transparansi keamanan kepada pengguna melalui inspeksi *ciphertext* dan verifikasi sidik jari kunci (*safety number*).
4. Mendukung kolaborasi lintas ekosistem melalui integrasi **Google Chat** dengan opsi pembungkus sandi *end-to-end*.

### 2.2 Target Pengguna
- Individu atau tim yang membutuhkan komunikasi teks dan suara rahasia tanpa pelacakan isi pesan oleh server.
- Organisasi pengguna **Google Workspace** yang ingin menambahkan lapisan enkripsi klien di atas *Space* Google Chat.

---

## 3. Ruang Lingkup Fitur & Kebutuhan Fungsional

### 3.1 Autentikasi Akun & Direktori Pengguna (`@username`)
| ID | Fitur | Deskripsi Fungsional |
|---|---|---|
| AUTH-01 | Registrasi Akun | Pengguna mendaftar dengan `username` unik (3–24 karakter `[a-z0-9._]`), `displayName`, dan `password` (min. 6 karakter). |
| AUTH-02 | Pembuatan & Cadangan Kunci Privat | Saat registrasi, klien membuat pasangan kunci **ECDH P-256** dan mengenkripsi kunci privatnya secara lokal (PBKDF2-SHA256 200.000 iterasi + AES-256-GCM) sebelum dicadangkan ke server. |
| AUTH-03 | Login Lintas Perangkat | Saat login, server memverifikasi kata sandi (`scrypt` + `timingSafeEqual`) dan mengembalikan cadangan kunci terenkripsi untuk dibuka secara lokal di peramban. |
| AUTH-04 | Pencarian & Kontak `@username` | Pengguna dapat mencari pengguna terdaftar lain melalui kolom pencarian `@username` di sidebar dan langsung membuka obrolan terenkripsi (*Direct Message*). |

### 3.2 Ruang Percakapan Terenkripsi E2EE (Teks & Suara)
| ID | Fitur | Deskripsi Fungsional |
|---|---|---|
| E2EE-01 | Obrolan Langsung (DM) Otomatis | Kunci sesi diturunkan otomatis melalui pertukaran kunci **ECDH P-256 + HKDF-SHA256** antara kunci privat lokal dan kunci publik rekan (`@username`). |
| E2EE-02 | Ruang Grup E2EE | Pengguna dapat membuat atau bergabung ke ruang grup menggunakan ID Ruang dan *passphrase* rahasia (diturunkan dengan **PBKDF2-SHA256** 250.000 iterasi). |
| E2EE-03 | Tautan Undangan Zero-Knowledge | Tautan undangan grup menyematkan kunci pada *URL fragment* (`#room=...&k=...`) yang secara standar peramban tidak pernah dikirim ke server HTTP. |
| E2EE-04 | Pesan Teks Terenkripsi Real-Time | Pengiriman dan penerimaan pesan instan melalui WebSocket (`/ws`) dengan IV acak 96-bit unik per pesan serta AAD terikat ke ID ruang. |
| E2EE-05 | Pesan Suara Terenkripsi | Perekaman mikrofon (Opus/WebM via `MediaRecorder`) dengan visualisasi spektrum *real-time* (`AnalyserNode`), dienkripsi sebagai data biner sebelum dikirim, dan diputar dengan *waveform scrubber* (`1x` / `1.5x`). |
| E2EE-06 | Panggilan Suara Langsung P2P | Panggilan suara langsung berbasis **WebRTC** (`RTCPeerConnection`) dengan enkripsi media **DTLS-SRTP**, *signaling* via WebSocket, kontrol bisukan (*mute*), dan akhiri panggilan. |

### 3.3 Fitur Privasi & Audit Kriptografi
| ID | Fitur | Deskripsi Fungsional |
|---|---|---|
| PRIV-01 | Pesan Sementara (*Ephemeral TTL*) | Opsi penghapusan otomatis pesan di ruang grup (Mati, 30 detik, 5 menit, 1 jam) yang dipangkas berkala oleh server. |
| PRIV-02 | Samarkan Layar (*Privacy Blur*) | Tombol instan untuk memburamkan seluruh riwayat pesan dari pengamat sekitar. |
| PRIV-03 | Inspeksi Ciphertext | Setiap pesan memiliki tombol audit untuk melihat *Initialization Vector* (96-bit) dan *ciphertext* AES-GCM mentah yang melewati jaringan. |
| PRIV-04 | Verifikasi Sidik Jari & Identicon | Menampilkan sidik jari **SHA-256** kunci publik dan *identicon* geometris 3x3 deterministik, serta opsi memutar ulang kunci identitas perangkat. |

### 3.4 Integrasi Google Chat
| ID | Fitur | Deskripsi Fungsional |
|---|---|---|
| GCHAT-01 | Autentikasi Google Workspace | Masuk dengan Google menggunakan Firebase Auth (`GoogleAuthProvider`) untuk *scope* `chat.spaces`, `chat.messages`, dan `chat.memberships.readonly`. |
| GCHAT-02 | Manajemen Space & Pesan | Melihat daftar *Space*, membuat *Space* baru, melihat anggota, membaca, mengirim, dan menghapus pesan di Google Chat. |
| GCHAT-03 | Mode Pembungkus E2EE | Opsi mengenkripsi pesan ke format `[SANDICHAT-E2EE:v1:...]` sebelum dikirim ke Google Chat agar hanya pemilik *passphrase Space* yang dapat membacanya. |
| GCHAT-04 | Dialog Konfirmasi Mutasi | Setiap aksi yang mengubah/menghapus data Google Chat (kirim pesan, buat *Space*, hapus pesan) mewajibkan konfirmasi eksplisit pengguna melalui modal. |

---

## 4. Arsitektur Teknis & Keamanan

### 4.1 Tumpukan Teknologi (*Tech Stack*)
- **Frontend:** React 19, TypeScript, Vite, Tailwind CSS v4, Lucide Icons, Web Crypto API, Web Audio API, WebRTC, Firebase SDK (`firebase/auth`).
- **Backend:** Node.js, Express (`server.ts`), WebSocket (`ws` pada path `/ws`), persistensi data lokal `.data/sandichat-store.json`.
- **Branding & Aset:** Logo aplikasi menggunakan ikon Yuhu (`/assets/aistudio/Glossy_Blue_Yuhu_Calling_Icon_da168689.png`) sebagai *favicon*, *apple-touch-icon*, header, dan layar masuk.

### 4.2 Spesifikasi Kriptografi
| Komponen | Algoritma / Standar | Keterangan |
|---|---|---|
| Kunci Identitas | ECDH Kurva P-256 | Dibuat di browser, disimpan lokal di IndexedDB. |
| Sidik Jari Kunci | SHA-256 | Dihitung dari JWK kanonis kunci publik, ditampilkan dalam 8 blok heksadesimal. |
| Enkripsi Pesan & Suara | AES-256-GCM | IV acak 12-byte unik per pesan + *Additional Authenticated Data* (`roomId`). |
| Derivasi Kunci DM | ECDH + HKDF-SHA256 | Menghasilkan kunci AES-256 bersama yang identik di kedua pengguna tanpa pertukaran rahasia lewat server. |
| Derivasi Kunci Grup | PBKDF2-SHA256 | 250.000 iterasi dari *passphrase* ruang dengan *salt* spesifik ruang. |
| Hashing Kata Sandi Server | `scrypt` (64-byte) | Menggunakan *salt* acak 16-byte per akun dan perbandingan `timingSafeEqual`. |

### 4.3 Keamanan Token & Penanganan Error
- Token OAuth Google Chat disimpan **hanya di memori aplikasi** (*in-memory*), tidak pernah di `localStorage` atau `sessionStorage`, dan dibersihkan saat *sign-out*.
- Prasyarat Google Chat API (akun **Google Workspace Business/Enterprise** dan konfigurasi satu kali di Google Cloud Console) ditampilkan dengan pesan diagnostik jelas beserta tautan langsung bila terjadi error 404/403.

---

## 5. Endpoint API & Event WebSocket

### 5.1 REST API (`server.ts`)
- `GET /api/health` — Status kesehatan server, jumlah ruang aktif, dan pengguna terdaftar.
- `POST /api/auth/register` — Pendaftaran `@username`, kata sandi, kunci publik, dan cadangan kunci terenkripsi.
- `POST /api/auth/login` — Autentikasi `@username` & kata sandi, mengembalikan token sesi dan daftar DM.
- `GET /api/auth/me` — Validasi sesi berjalan dan pemuatan profil + daftar DM.
- `POST /api/auth/logout` — Penghapusan sesi aktif.
- `GET /api/users/search?q=` — Pencarian direktori pengguna terdaftar berdasarkan `@username` atau nama tampilan.
- `POST /api/dm/open` — Membuka atau mengambil *thread* DM terenkripsi antara dua pengguna.

### 5.2 WebSocket Events (`/ws`)
- `user:online` — Mendaftarkan koneksi online pengguna untuk notifikasi DM *real-time*.
- `room:join` / `room:state` / `room:presence` — Sinkronisasi keanggotaan ruang dan riwayat *ciphertext*.
- `message:send` / `message:new` — Pengiriman dan siaran amplop pesan teks/suara terenkripsi secara idempoten.
- `message:delete` / `message:deleted` / `message:expired` — Penghapusan pesan manual maupun otomatis (TTL).
- `room:activity` — Indikator status mengetik atau merekam suara tanpa membocorkan konten.
- `webrtc:signal` — Pertukaran *offer*, *answer*, *ICE candidate*, dan *hangup* untuk panggilan suara WebRTC.

---

## 6. Kriteria Keberhasilan & Batasan Saat Ini

### 6.1 Kriteria Penerimaan (*Acceptance Criteria*)
- Pengguna dapat mendaftar dengan `@username` & kata sandi, keluar, lalu masuk kembali dengan kunci identitas yang tetap utuh.
- Pengguna A dapat mencari `@username` Pengguna B, membuka DM, lalu bertukar pesan teks, pesan suara, dan panggilan suara terenkripsi secara *real-time*.
- Server tidak pernah menyimpan atau mencatat *plaintext* pesan maupun kata sandi mentah.
- Fitur Google Chat menampilkan dialog konfirmasi sebelum mengirim/menghapus pesan atau membuat *Space*.

### 6.2 Batasan & Catatan Operasional
- Penyimpanan akun dan riwayat *ciphertext* DM saat ini menggunakan berkas lokal JSON (`.data/sandichat-store.json`) untuk kemudahan penerapan tanpa basis data eksternal.
- Integrasi langsung ke **Google Chat API** memerlukan akun Google Workspace berbayar (bukan akun `@gmail.com` konsumen) dan konfigurasi awal pada Google Cloud Console.
