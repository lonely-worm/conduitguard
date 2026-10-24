# ConduitGuard

## Ringkasan eksekutif

ConduitGuard adalah purwarupa pendukung keputusan untuk memvalidasi perubahan kebijakan akses jaringan IT/OT sebelum perubahan diterapkan. Operator memasukkan konfigurasi baseline, konfigurasi kandidat, dan probe konektivitas sintetis. Sistem lalu menunjukkan perubahan makna kebijakan, temuan risiko yang dapat ditelusuri, dampak terhadap probe, rekomendasi mitigasi, serta ringkasan audit agregat.

Sistem bekerja offline terhadap model generik. Ia tidak terhubung ke firewall, perangkat OT, maupun jaringan produksi.

## Masalah yang ditangani

Perubahan aturan akses yang terlihat kecil dapat membuka jalur administratif dari sumber yang terlalu luas, menutup konektivitas yang diperlukan, atau membuat aturan yang dimaksudkan tidak pernah dipakai karena tertutupi oleh aturan lebih awal. Review manual sulit dilakukan konsisten saat operator perlu membaca banyak aturan, urutan prioritas, CIDR, port, dan dampak perubahan secara bersamaan.

## Pendekatan teknis

1. **Validasi ketat.** Konfigurasi dan probe divalidasi untuk tipe data, IP/CIDR, port, protokol, ID unik, dan batas ukuran.
2. **Semantic policy diff.** Perubahan dibandingkan berdasarkan ID aturan, sehingga perubahan urutan array tidak menghasilkan alarm palsu.
3. **Simulasi deterministik.** Mesin mengevaluasi aturan berdasarkan prioritas lalu ID aturan. Hasil before/after ditampilkan untuk tiap probe.
4. **Temuan yang dapat dijelaskan.** Mesin mendeteksi akses tanpa pembatasan, port administratif, konflik prioritas yang sama, perluasan akses, dan aturan yang tertutupi penuh oleh aturan lebih awal.
5. **Skor risiko transparan.** Temuan diberi bobot tetap berdasarkan keparahan untuk memprioritaskan review, dan level hasil tidak pernah lebih rendah dari temuan paling parah. Skor bukan probabilitas insiden.
6. **Jejak audit minimal.** PostgreSQL menyimpan ringkasan agregat tanpa konfigurasi, alamat IP, probe, atau bukti temuan.

## Skenario IT/OT sintetis

Demo memodelkan jalur HMI ke historian, engineering workstation ke zona kontrol, dan sebuah perubahan kandidat yang membuka RDP sementara dari sumber mana pun ke aset zona kontrol. Data memakai alamat dokumentasi sintetis dan tidak merepresentasikan satuan atau infrastruktur nyata.

ConduitGuard mendeteksi akses administratif RDP tersebut, menghubungkannya dengan perubahan aturan, dan memperlihatkan perubahan keputusan probe dari alamat eksternal. Jalur HMI dan engineering yang dibutuhkan tetap diuji sebagai pembanding.

## Kesesuaian dengan penilaian

| Kriteria | Bukti dalam purwarupa |
| --- | --- |
| Relevansi dan manfaat | Review sebelum perubahan untuk membatasi kesalahan konfigurasi pada jalur akses IT/OT. |
| Inovasi teknis | Diff semantik, simulasi deterministik, deteksi shadow rule, temuan berbukti, dan skor risiko terjelaskan. |
| Fungsionalitas | Antarmuka web, API, validasi, simulasi, ekspor laporan, riwayat PostgreSQL, unit test, dan CI. |
| Kelayakan implementasi | Stack ringan Next.js/FastAPI/PostgreSQL, mode lokal, tanpa koneksi ke firewall, serta penyimpanan minim data. |
| Dokumentasi | Skema, semantik evaluasi, batasan, audit baseline, skenario demo, dan panduan teknis tersedia di repository. |

## Batasan dan kontrol keselamatan

ConduitGuard adalah model kebijakan generik. Sistem tidak memodelkan sintaks vendor, routing, NAT, interface, zona, identitas, sesi stateful, topologi, atau konektivitas fisik. Temuan dan rekomendasi memerlukan review manusia. Sistem tidak pernah mengirim atau menerapkan perubahan ke perangkat jaringan atau OT.
