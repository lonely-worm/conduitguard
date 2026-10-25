"use client";

import Image from "next/image";
import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type DemoProfile = { name: string; email: string; role: string };
const PROFILE_KEY = "conduitguard-demo-profile-v1";
const defaultProfile: DemoProfile = { name: "Operator ConduitGuard", email: "operator@conduitguard.local", role: "Analis kebijakan" };

function readProfile(): DemoProfile {
  try {
    const value = window.sessionStorage.getItem(PROFILE_KEY);
    return value ? { ...defaultProfile, ...JSON.parse(value) as Partial<DemoProfile> } : defaultProfile;
  } catch { return defaultProfile; }
}

function saveProfile(profile: DemoProfile) {
  window.sessionStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
}

function AccountFrame({ children, title, subtitle }: { children: React.ReactNode; title: string; subtitle: string }) {
  return <main className="account-shell">
    <section className="account-panel">
      <Link className="account-brand" href="/" aria-label="Kembali ke ConduitGuard">
        <span className="account-logo"><Image src="https://i.imgur.com/E8ikoao.png" unoptimized alt="Logo tim ConduitGuard" width={128} height={128} priority /></span>
        <span>conduit<span>guard</span><small>NETWORK CHANGE CONTROL</small></span>
      </Link>
      <div className="account-copy"><span className="account-eyebrow">RUANG KERJA TERKENDALI</span><h1>{title}</h1><p>{subtitle}</p></div>
      {children}
      <p className="account-safety">Mode demonstrasi lokal. Tidak ada kredensial yang dikirim atau disimpan di server.</p>
    </section>
    <aside className="account-aside" aria-label="Informasi ConduitGuard"><span className="grid-orb"/><div><span className="account-eyebrow">SIMULASI OFFLINE</span><h2>Keputusan perubahan jaringan, sebelum diterapkan.</h2><p>ConduitGuard memeriksa konfigurasi kebijakan dalam model simulasi terisolasi—tanpa koneksi ke firewall atau perangkat OT.</p></div><div className="account-aside-status"><i/> Lingkungan demo aktif</div></aside>
  </main>;
}

export function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError("");
    if (!email.trim() || !email.includes("@")) { setError("Masukkan alamat email yang valid."); return; }
    const current = readProfile(); saveProfile({ ...current, email: email.trim() }); router.push("/");
  };
  return <AccountFrame title="Masuk ke ruang kerja" subtitle="Gunakan identitas demo untuk membuka simulasi dan riwayat analisis pada browser ini.">
    <form className="account-form" onSubmit={submit} noValidate>
      <label htmlFor="login-email">Email kerja</label><input id="login-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nama@satuan.go.id" required />
      <label htmlFor="login-password">Kata sandi</label><input id="login-password" type="password" autoComplete="current-password" placeholder="Masukkan kata sandi" minLength={8} required />
      {error && <p className="account-error" role="alert">{error}</p>}
      <button className="account-submit" type="submit">Masuk ke ConduitGuard <span>→</span></button>
    </form>
    <p className="account-switch">Belum memiliki profil demo? <Link href="/register">Daftar sekarang</Link></p>
  </AccountFrame>;
}

export function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState(""); const [email, setEmail] = useState(""); const [error, setError] = useState("");
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError("");
    if (name.trim().length < 2) { setError("Nama minimal terdiri dari 2 karakter."); return; }
    if (!email.trim() || !email.includes("@")) { setError("Masukkan alamat email yang valid."); return; }
    saveProfile({ name: name.trim(), email: email.trim(), role: "Analis kebijakan" }); router.push("/profile");
  };
  return <AccountFrame title="Buat profil demo" subtitle="Atur identitas ruang kerja Anda. Data hanya tersimpan sementara pada browser ini.">
    <form className="account-form" onSubmit={submit} noValidate>
      <label htmlFor="register-name">Nama lengkap</label><input id="register-name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nama operator" required />
      <label htmlFor="register-email">Email kerja</label><input id="register-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nama@satuan.go.id" required />
      <label htmlFor="register-password">Kata sandi</label><input id="register-password" type="password" autoComplete="new-password" placeholder="Minimal 8 karakter" minLength={8} required />
      {error && <p className="account-error" role="alert">{error}</p>}
      <button className="account-submit" type="submit">Buat profil demo <span>→</span></button>
    </form>
    <p className="account-switch">Sudah memiliki profil demo? <Link href="/login">Masuk</Link></p>
  </AccountFrame>;
}

export function ProfilePage() {
  const router = useRouter();
  const [profile, setProfile] = useState(defaultProfile); const [saved, setSaved] = useState(false);
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setProfile(readProfile()));
    return () => window.cancelAnimationFrame(frame);
  }, []);
  const save = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); saveProfile(profile); setSaved(true); };
  const signOut = () => { try { window.sessionStorage.removeItem(PROFILE_KEY); } catch { /* Storage is optional. */ } router.push("/login"); };
  return <main className="profile-shell"><header className="profile-header"><Link className="account-brand compact" href="/"><span className="account-logo"><Image src="https://i.imgur.com/E8ikoao.png" unoptimized alt="Logo tim ConduitGuard" width={128} height={128} priority /></span><span>conduit<span>guard</span><small>NETWORK CHANGE CONTROL</small></span></Link><Link className="profile-back" href="/">← Kembali ke ruang kerja</Link></header><section className="profile-content"><div className="profile-heading"><span className="account-eyebrow">PROFIL OPERATOR</span><h1>Profil & preferensi</h1><p>Identitas ini hanya digunakan untuk pengalaman demonstrasi pada browser ini.</p></div><div className="profile-grid"><article className="profile-card identity-card"><div className="profile-avatar">{profile.name.split(" ").map((part) => part[0]).slice(0, 2).join("").toUpperCase()}</div><h2>{profile.name}</h2><p>{profile.email}</p><span className="profile-role">{profile.role}</span><hr/><dl><div><dt>Lingkungan</dt><dd>Simulasi offline</dd></div><div><dt>Status</dt><dd><i/> Aktif di browser ini</dd></div></dl></article><form className="profile-card profile-form" onSubmit={save}><div className="card-kicker">IDENTITAS RUANG KERJA</div><h2>Perbarui profil</h2><label htmlFor="profile-name">Nama lengkap</label><input id="profile-name" value={profile.name} onChange={(e) => { setProfile({ ...profile, name: e.target.value }); setSaved(false); }} required /><label htmlFor="profile-email">Email kerja</label><input id="profile-email" type="email" value={profile.email} onChange={(e) => { setProfile({ ...profile, email: e.target.value }); setSaved(false); }} required /><label htmlFor="profile-role">Peran</label><select id="profile-role" value={profile.role} onChange={(e) => { setProfile({ ...profile, role: e.target.value }); setSaved(false); }}><option>Analis kebijakan</option><option>Administrator ruang kerja</option><option>Peninjau keamanan</option></select>{saved && <p className="profile-saved" role="status">Preferensi demo tersimpan di browser ini.</p>}<div className="profile-actions"><button className="account-submit" type="submit">Simpan perubahan</button><button className="profile-signout" type="button" onClick={signOut}>Keluar dari profil demo</button></div></form></div></section></main>;
}
