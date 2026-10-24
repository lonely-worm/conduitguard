# Skenario Demo Langsung — ConduitGuard

## Tujuan

Membuktikan bahwa perubahan akses yang tampak sederhana dapat dianalisis sebelum diterapkan, dengan bukti konfigurasi, dampak probe, rekomendasi, dan jejak audit.

## Persiapan

1. Jalankan backend dengan `backend/.env` agar riwayat PostgreSQL tersedia.
2. Jalankan frontend dan buka `/configuration`.
3. Tekan **Muat contoh**. Semua data adalah sintetis.

## Alur 4 menit

1. **Konteks, 20 detik.** Jelaskan baseline: HMI ke historian dan engineering workstation ke zona kontrol adalah jalur yang diperlukan.
2. **Perubahan kandidat, 30 detik.** Tunjukkan aturan `temporary-remote-admin`: RDP port 3389 dari `*` ke aset zona kontrol.
3. **Analisis, 30 detik.** Tekan **Analisis perubahan**. Tunjukkan ringkasan diff dan status risiko **Tinggi**: temuan administratif berkeparahan tinggi tidak akan ditampilkan sebagai level sedang hanya karena total bobotnya belum melewati ambang berikutnya. Tegaskan bahwa skor adalah prioritas review, bukan probabilitas insiden.
4. **Bukti risiko, 45 detik.** Buka **Temuan**. Tunjukkan temuan port administratif, aturan terkait, bukti source/port, alasan, dan mitigasi.
5. **Dampak layanan, 45 detik.** Buka **Simulasi**. Tunjukkan probe RDP eksternal berubah dari ditolak menjadi diizinkan, sedangkan probe HMI dan engineering tetap dievaluasi.
6. **Perbaikan aman, 40 detik.** Kembali ke konfigurasi. Ganti sumber aturan RDP dari `*` menjadi CIDR manajemen sintetis yang kecil, atau hapus aturan. Jalankan ulang analisis dan tunjukkan perubahan temuan serta skor.
7. **Audit, 20 detik.** Buka Ringkasan. Tunjukkan riwayat audit agregat dan batas data yang disimpan.
8. **Penutup, 10 detik.** Tegaskan bahwa sistem membantu review sebelum perubahan menyentuh perangkat nyata.

## Hasil yang diharapkan

- Aturan RDP luas menghasilkan temuan `CG-POL-002`, skor `28/100`, level `high`, dan perubahan keputusan probe eksternal menjadi `allow`.
- Jalur HMI dan engineering tetap terlihat sebagai probe pembanding.
- Hasil ekspor JSON berisi waktu pembuatan, diff, temuan, skor risiko, simulasi, asumsi, dan batasan.
- Jika PostgreSQL tidak tersedia, analisis tetap berjalan; UI menjelaskan bahwa riwayat tidak tersedia.

## Fallback yang jujur

Jika database tidak bisa diakses, gunakan analisis, temuan, simulasi, dan ekspor JSON. Jangan menyebut riwayat tersimpan. Jika backend tidak tersedia, gunakan rekaman demo atau laporan JSON yang dihasilkan sebelumnya dan nyatakan bahwa itu adalah hasil demo tersimpan.
