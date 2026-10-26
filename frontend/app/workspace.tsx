"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";

type Probe = { label?: string; source: string; destination: string; protocol: string; port?: number | null };
type Rule = { id: string; source: string; destination: string; protocol: string; port: number | string; action: string; priority?: number };
type Config = { default_policy: "allow" | "deny"; rules: Rule[] };
type Finding = { id: string; severity: string; title: string; rule_ids: string[]; evidence: Record<string, unknown>; explanation: string; mitigation: string };
type Risk = { score: number; level: "low" | "medium" | "high" | "critical"; model: string; factors: { finding_id: string; severity: string; weight: number }[]; limitation: string };
type Analysis = { changes: { added: Rule[]; removed: Rule[]; changed: { id: string; before: Rule; after: Rule }[]; unchanged: string[]; default_policy: { before: string; after: string } | null }; findings: Finding[]; risk?: Risk; simulation: { before: Decision[]; after: Decision[] }; recommendations: string[]; rules_version: string; assumptions: string[]; limitations: string[]; history_status?: "saved" | "disabled" | "unavailable"; history_id?: number | null };
type Decision = { probe: Probe; decision: string; matched_rule_id: string | null; reason: string };
type Example = { before: Config; after: Config; probes: Probe[] };
type HistoryItem = { id: number; created_at: string; rules_version: string; finding_count: number; high_severity_count: number; change_count: number; probe_count: number; risk_score: number };

const API = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").trim().replace(/\/+$/, "");
const NAV_ITEMS = ["overview", "configuration", "findings", "simulation"] as const;
export type WorkspacePage = (typeof NAV_ITEMS)[number];
const PAGE_DETAILS: Record<WorkspacePage, { title: string; description: string; href: string }> = {
  overview: { title: "Ringkasan analisis", description: "Pantau dampak perubahan kebijakan jaringan yang telah dianalisis.", href: "/" },
  configuration: { title: "Validasi perubahan jaringan", description: "Tinjau dampak kebijakan dan uji konektivitas sebelum perubahan diterapkan.", href: "/configuration" },
  findings: { title: "Temuan kebijakan", description: "Tinjau risiko, bukti, dan mitigasi dari analisis terakhir.", href: "/findings" },
  simulation: { title: "Simulasi konektivitas", description: "Bandingkan keputusan koneksi sebelum dan sesudah perubahan.", href: "/simulation" },
};

function apiError(error: unknown): string {
  if (error instanceof TypeError) return "API tidak tersedia. Pastikan backend aktif dan URL API benar.";
  if (error instanceof Error) return error.message;
  return "API tidak tersedia. Pastikan backend aktif dan URL API benar.";
}

export default function Workspace({ page }: { page: WorkspacePage }) {
  const router = useRouter();
  const [before, setBefore] = useState("");
  const [after, setAfter] = useState("");
  const [probes, setProbes] = useState("");
  const [result, setResult] = useState<Analysis | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [historyStatus, setHistoryStatus] = useState<"idle" | "loading" | "available" | "unavailable">("idle");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [desktopMenuCollapsed, setDesktopMenuCollapsed] = useState(false);

  const pageDetails = PAGE_DETAILS[page];

  const inputState = useMemo(() => {
    try {
      const parsedBefore = before.trim() ? JSON.parse(before) as Partial<Config> : null;
      const parsedAfter = after.trim() ? JSON.parse(after) as Partial<Config> : null;
      const parsedProbes = probes.trim() ? JSON.parse(probes) : [];
      if (!parsedBefore || !parsedAfter) return { valid: false, message: "Konfigurasi sebelum dan sesudah wajib diisi." };
      if (!Array.isArray(parsedBefore.rules) || !Array.isArray(parsedAfter.rules)) return { valid: false, message: "Setiap konfigurasi harus memiliki properti rules berupa array." };
      if (!Array.isArray(parsedProbes)) return { valid: false, message: "Probe konektivitas harus berupa array JSON." };
      const size = new TextEncoder().encode(JSON.stringify({ before: parsedBefore, after: parsedAfter, probes: parsedProbes })).length;
      if (size > 256 * 1024) return { valid: false, message: "Ukuran permintaan melebihi batas 256 KiB. Ringkas konfigurasi atau probe." };
      return { valid: true, message: "" };
    } catch {
      return { valid: false, message: "Periksa format JSON pada konfigurasi atau probe." };
    }
  }, [before, after, probes]);

  const getExample = useCallback(async (): Promise<Example> => {
    const response = await fetch(`${API}/api/examples/demo`);
    if (!response.ok) throw new Error(`API tidak tersedia: konfigurasi contoh gagal dimuat (HTTP ${response.status}).`);
    return response.json() as Promise<Example>;
  }, []);

  const loadExample = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const data = await getExample();
      setBefore(JSON.stringify(data.before, null, 2)); setAfter(JSON.stringify(data.after, null, 2)); setProbes(JSON.stringify(data.probes, null, 2));
      setResult(null);
    } catch (e) { setError(apiError(e)); }
    finally { setLoading(false); }
  }, [getExample]);

  useEffect(() => {
    let savedInputs: string | null = null;
    let savedResult: string | null = null;
    try {
      savedInputs = window.sessionStorage.getItem("conduitguard-inputs-v1");
      savedResult = window.sessionStorage.getItem("conduitguard-result-v1");
    } catch { /* Continue with the API example when browser storage is unavailable. */ }
    if (savedInputs) {
      try {
        const parsed = JSON.parse(savedInputs) as { before: string; after: string; probes: string };
        const parsedResult = savedResult ? JSON.parse(savedResult) as Analysis : null;
        queueMicrotask(() => {
          setBefore(parsed.before); setAfter(parsed.after); setProbes(parsed.probes); setLoading(false);
          if (parsedResult) setResult(parsedResult);
        });
        return;
      } catch { try { window.sessionStorage.removeItem("conduitguard-inputs-v1"); } catch { /* Storage is optional. */ } }
    }
    let active = true;
    void getExample().then((data) => {
      if (active) { setBefore(JSON.stringify(data.before, null, 2)); setAfter(JSON.stringify(data.after, null, 2)); setProbes(JSON.stringify(data.probes, null, 2)); }
    }).catch((e: unknown) => {
      if (active) setError(apiError(e));
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [getExample]);

  useEffect(() => {
    try {
      if (before || after || probes) window.sessionStorage.setItem("conduitguard-inputs-v1", JSON.stringify({ before, after, probes }));
    } catch { /* The current session remains usable when storage is unavailable. */ }
  }, [before, after, probes]);

  useEffect(() => {
    try {
      if (result) window.sessionStorage.setItem("conduitguard-result-v1", JSON.stringify(result));
      else window.sessionStorage.removeItem("conduitguard-result-v1");
    } catch { /* Results still render in memory when storage is unavailable. */ }
  }, [result]);

  useEffect(() => {
    if (page !== "overview") return;
    let active = true;
    void fetch(`${API}/api/history`, { signal: AbortSignal.timeout(8_000) })
      .then(async (response) => response.ok ? response.json() as Promise<{ items: HistoryItem[] }> : Promise.reject(new Error("Riwayat tidak tersedia")))
      .then((data) => { if (active) { setHistory(data.items); setHistoryStatus("available"); } })
      .catch(() => { if (active) setHistoryStatus("unavailable"); });
    return () => { active = false; };
  }, [page, result?.history_id]);

  const runAnalysis = async () => {
    setBusy(true); setError("");
    try {
      const parsedProbes = probes.trim() ? JSON.parse(probes) as Probe[] : [];
      if (!Array.isArray(parsedProbes)) throw new Error("Probe konektivitas harus berupa array JSON.");
      const payload = { before: JSON.parse(before) as Config, after: JSON.parse(after) as Config, probes: parsedProbes };
      const response = await fetch(`${API}/api/analyze`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), signal: AbortSignal.timeout(30_000) });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        const message = data?.error?.code === "request_too_large" ? "Ukuran permintaan melebihi batas 256 KiB." : data?.error?.message || "Permintaan analisis gagal.";
        const details = Array.isArray(data?.error?.details) ? data.error.details.map((item: { loc?: unknown[]; msg?: string }) => `${item.loc?.slice(1).join(" → ") || "Input"}: ${item.msg || "Nilai tidak valid"}`).join("; ") : "";
        throw new Error(details ? `${message} ${details}` : message);
      }
      const analysis = data as Analysis;
      try { window.sessionStorage.setItem("conduitguard-result-v1", JSON.stringify(analysis)); } catch { /* Keep the result available in this view. */ }
      setResult(analysis);
      router.push("/");
    } catch (e) { setError(e instanceof DOMException && e.name === "TimeoutError" ? "Analisis melewati batas waktu 30 detik. Periksa koneksi API lalu coba lagi." : e instanceof SyntaxError ? "JSON tidak valid. Periksa koma, tanda kutip, dan kurung pada konfigurasi atau probe." : e instanceof Error ? e.message : "Analisis gagal."); }
    finally { setBusy(false); }
  };

  const download = () => {
    if (!result) return;
    const report = { generated_at: new Date().toISOString(), changes: result.changes, findings: result.findings, risk: result.risk, simulation: result.simulation, recommendations: result.recommendations, rules_version: result.rules_version, assumptions: result.assumptions, limitations: result.limitations };
    const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }));
    const link = document.createElement("a"); link.href = url; link.download = "conduitguard-report.json"; document.body.appendChild(link); link.click(); link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const criticalCount = useMemo(() => result?.findings.filter((f) => f.severity === "critical" || f.severity === "high").length ?? 0, [result]);

  return <main className="shell">
    <a className="skip-link" href="#main-content">Langsung ke konten utama</a>
    <aside className={`sidebar ${mobileMenuOpen ? "mobile-menu-open" : ""}`}>
      <div className="mobile-nav-header">
<Link className="brand" href="/" aria-label="ConduitGuard home">
  <span className="brand-mark">
    <img
      src="https://i.imgur.com/E8ikoao.png"
      alt="Logo tim ConduitGuard"
      width={64}
      height={64}
      className="brand-image"
    />
  </span>
  <span>
    conduit<span className="brand-light">guard</span>
    <small>NETWORK CHANGE CONTROL</small>
  </span>
</Link>
      <div className="mobile-header-actions"><Link className="mobile-profile-link" href="/profile" aria-label="Buka profil" title="Profil"><span aria-hidden="true">CG</span></Link><button className="mobile-menu-toggle" type="button" aria-label={mobileMenuOpen ? "Tutup menu navigasi" : "Buka menu navigasi"} aria-expanded={mobileMenuOpen} aria-controls="workspace-navigation" onClick={() => setMobileMenuOpen((open) => !open)}><span/><span/><span/></button></div>
      </div>
      <div className="nav-label">RUANG KERJA</div>
      <nav id="workspace-navigation" aria-label="Navigasi utama">
        {NAV_ITEMS.map((tab) => <Link key={tab} href={PAGE_DETAILS[tab].href} className={`nav-item ${page === tab ? "selected" : ""}`} onClick={() => setMobileMenuOpen(false)} aria-current={page === tab ? "page" : undefined}><NavIcon name={tab} /><span>{tab === "overview" ? "Ringkasan" : tab === "configuration" ? "Konfigurasi" : tab === "findings" ? "Temuan" : "Simulasi"}</span>{tab === "findings" && result && <b className="nav-count" aria-label={`${result.findings.length} temuan`}>{result.findings.length}</b>}</Link>)}
        <Link href="/history" className="nav-item" onClick={() => setMobileMenuOpen(false)}><NavIcon name="history" /><span>Riwayat analisis</span></Link>
      </nav>
      <div className="sidebar-bottom"><div className="offline-card"><span className="green-dot"/><div><strong>Mode simulasi aktif</strong><small>Tidak ada koneksi perangkat jaringan</small></div></div><Link className="user-card" href="/profile" aria-label="Buka profil ruang kerja" onClick={() => setMobileMenuOpen(false)}><div className="avatar">CG</div><div><strong>Ruang kerja analisis</strong><small>Profil & preferensi</small></div><span className="dots" aria-hidden="true">···</span></Link></div>
    </aside>

    <section className={`main-panel ${desktopMenuCollapsed ? "desktop-menu-collapsed" : ""}`} id="top">
      <header className="topbar"><div className="topbar-leading"><button className="workspace-hamburger" type="button" aria-label={desktopMenuCollapsed ? "Buka sidebar navigasi" : "Tutup sidebar navigasi"} aria-expanded={!desktopMenuCollapsed} onClick={() => setDesktopMenuCollapsed((collapsed) => !collapsed)}><span/><span/><span/></button><div className="crumb">Ruang kerja <span>/</span> <strong>{pageDetails.title}</strong></div></div><div className="top-right"><span className="env-tag"><i/> MODE SIMULASI</span><Link className="icon-button" href="/configuration" aria-label="Buka konfigurasi" title="Konfigurasi">⚙</Link><span className="team-logo-header"><Image src="/conduitguard-team-logo-cropped.png" alt="Logo tim" width={741} height={983} /></span><Link className="avatar small-avatar" href="/profile" aria-label="Buka profil">CG</Link></div></header>
      <div className="content" id="main-content" tabIndex={-1}>
        <div className="page-heading"><div><div className="eyebrow"><span className="eyebrow-line"/> KONTROL PERUBAHAN</div><h1>{pageDetails.title}</h1><p>{pageDetails.description}</p></div>{page === "configuration" && <button className="secondary-button" type="button" onClick={loadExample} disabled={loading} aria-busy={loading}><RefreshIcon /> {loading ? "Memuat…" : "Muat contoh"}</button>}</div>
        <span className="sr-only" role="status" aria-live="polite">{loading ? "Memuat konfigurasi contoh." : ""}</span>
        <div className="safety-banner"><span className="shield-small"><ShieldIcon /></span><div><strong>Aman sejak awal</strong><span>Analisis berjalan pada model generik lokal. Tidak ada firewall yang dihubungi atau diubah.</span></div><span className="banner-badge">SIMULASI SAJA</span></div>

        {page === "configuration" && <>
        <div className="section-heading" id="configuration" tabIndex={-1}><div className="step">01</div><div><h2>Bandingkan konfigurasi</h2><p>Masukkan kebijakan firewall saat ini dan usulan dalam format JSON.</p></div><span className="schema-link">SKEMA <code>firewall-config/v1</code></span></div>
        <div className="config-grid">
          <ConfigEditor title="Konfigurasi saat ini" subtitle="SEBELUM" value={before} setValue={(value) => { setBefore(value); setResult(null); }} color="blue" />
          <ConfigEditor title="Konfigurasi usulan" subtitle="SESUDAH" value={after} setValue={(value) => { setAfter(value); setResult(null); }} color="violet" />
        </div>

        <div className="probe-panel"><div className="probe-header"><div><div className="probe-title"><span className="probe-icon"><PulseIcon /></span><div><h3 id="probes-label">Uji konektivitas</h3><p>Opsional. Bandingkan keputusan koneksi sebelum dan sesudah perubahan.</p></div></div></div><span className="optional">OPSIONAL</span></div><textarea id="probes" className="probe-input" aria-labelledby="probes-label" aria-describedby="probes-help" value={probes} onChange={(e) => { setProbes(e.target.value); setResult(null); }} spellCheck={false} placeholder={'[\n  { "source": "10.20.1.8", "destination": "192.0.2.10", "protocol": "tcp", "port": 443 }\n]'} /><span id="probes-help" className="sr-only">Masukkan array JSON probe koneksi. Kosongkan untuk melewati uji konektivitas.</span></div>
        {error && <div className="error-box" role="alert"><span aria-hidden="true">!</span><div><strong>Analisis belum dapat dijalankan</strong><p>{error}</p><small>Pastikan API aktif di {API} dan input mengikuti skema yang didokumentasikan.</small></div></div>}
        {!inputState.valid && !loading && <p className="input-hint" role="status">{inputState.message}</p>}
        <div className="run-row"><div className="run-note"><span className="lock-icon" aria-hidden="true">⌑</span> Validasi dan simulasi berjalan tanpa mengubah jaringan.</div><button className="primary-button" type="button" onClick={runAnalysis} disabled={busy || loading || !inputState.valid} aria-busy={busy}>{busy ? <><span className="spinner" aria-hidden="true"/> Menganalisis…</> : <>Analisis perubahan <ArrowIcon /></>}</button></div>
        </>}

        {page !== "configuration" && (result ? <div className="results" id="results">
          <div className="section-heading result-heading"><div className="step">02</div><div><h2>Hasil analisis</h2><p>Dibuat oleh API · aturan v{result.rules_version}{result.history_status === "saved" ? " · Ringkasan tersimpan di riwayat" : result.history_status === "unavailable" ? " · Basis data riwayat tidak tersedia; hasil belum disimpan" : " · Penyimpanan riwayat belum dikonfigurasi"}</p></div><button className="secondary-button export-button" onClick={download}><DownloadIcon /> Ekspor JSON</button></div>
          {page !== "simulation" && <div className={`status-card ${criticalCount ? "status-review" : "status-clear"}`} role="status" aria-live="polite"><span className="status-icon" aria-hidden="true">{criticalCount ? "!" : "✓"}</span><div><strong>{criticalCount ? "Perlu ditinjau" : "Tidak ada temuan berkeparahan tinggi"}</strong><span>{result.findings.length ? `${result.findings.length} temuan kebijakan ditemukan. Tinjau bukti dan mitigasi di bawah.` : "Pemeriksaan kebijakan yang tersedia tidak menemukan pelanggaran."}</span></div><span className="status-count">{result.findings.length} TEMUAN</span></div>}
          {page === "overview" && <><Overview result={result} /><History items={history} status={historyStatus} /></>}
          {page === "findings" && <Findings items={result.findings} />}
          {page === "simulation" && <Simulation before={result.simulation.before} after={result.simulation.after} />}
          <div className="model-notes"><h3>Asumsi dan batasan model</h3><ul>{[...result.assumptions, ...result.limitations].map((item, i) => <li key={`${i}-${item}`}>{item}</li>)}</ul></div>
        </div> : <div className="empty-state large-empty workspace-empty"><span className="check-circle">→</span><strong>Belum ada hasil analisis</strong><span>Masukkan konfigurasi, lalu jalankan analisis untuk membuka halaman ini.</span><Link className="secondary-button" href="/configuration">Buka konfigurasi</Link></div>)}

        {page === "configuration" && <div className="below-fold" id="semantics"><div className="section-heading compact-heading"><div className="step muted-step">02</div><div><h2>Cara kerja evaluasi</h2><p>Semantik kebijakan deterministik dan transparan.</p></div></div><div className="semantics-grid"><SemanticCard number="01" title="Urutan aturan" text="Prioritas angka lebih kecil dievaluasi lebih dahulu. ID aturan memecah nilai seri secara alfabetis."/><SemanticCard number="02" title="Pencocokan" text="Sumber dan tujuan menerima IP, jaringan CIDR, atau *. Protokol: TCP, UDP, ICMP, atau any. Port menerima angka atau *."/><SemanticCard number="03" title="Kebijakan bawaan" text="Aturan pertama yang cocok menentukan keputusan. Jika tidak ada yang cocok, default_policy berlaku."/></div></div>}
        <footer><span>ConduitGuard <span className="footer-sep">·</span> Validasi perubahan jaringan sumber terbuka</span><span>Dirancang untuk analisis offline <i className="green-dot"/></span></footer>
      </div>
    </section>
  </main>;
}

function ConfigEditor({ title, subtitle, value, setValue, color }: { title: string; subtitle: string; value: string; setValue: (v: string) => void; color: string }) {
  const id = color === "blue" ? "before-config" : "after-config";
  let valid = true;
  try { if (value.trim()) JSON.parse(value); } catch { valid = false; }
  const stateLabel = !value.trim() ? "Belum diisi" : valid ? "JSON valid" : "JSON belum valid";
  return <section className="editor-card"><div className="editor-head"><div className={`editor-dot ${color}`} aria-hidden="true"/><div className="editor-labels"><strong id={`${id}-label`}>{title}</strong><span>{subtitle}</span></div><span className="json-tag">JSON</span></div><textarea id={id} aria-labelledby={`${id}-label`} aria-describedby={`${id}-status`} aria-invalid={!valid} value={value} onChange={(e) => { setValue(e.target.value); }} spellCheck={false} placeholder={'{\n  "default_policy": "deny",\n  "rules": []\n}'}/><div className="editor-foot"><span id={`${id}-status`}><span className={`valid-dot ${valid && value.trim() ? "is-valid" : "is-invalid"}`} aria-hidden="true"/> {stateLabel}</span><span>Batas permintaan 256 KiB</span></div></section>;
}

function Overview({ result }: { result: Analysis }) {
  const counts = [{ label: "Ditambahkan", value: result.changes.added.length, cls: "added" }, { label: "Diubah", value: result.changes.changed.length, cls: "changed" }, { label: "Dihapus", value: result.changes.removed.length, cls: "removed" }, { label: "Tetap", value: result.changes.unchanged.length, cls: "unchanged" }];
  const risk = result.risk;
  return <>
    <div className="metrics">{counts.map((c) => <div className="metric" key={c.label}><span>{c.label}</span><strong className={c.cls}>{c.value}</strong></div>)}<div className="metric"><span>Probe diuji</span><strong>{result.simulation.after.length}</strong></div></div>
    {risk && <section className={`risk-card risk-${risk.level}`} aria-label="Penilaian risiko perubahan"><div><span className="quiet">SKOR RISIKO · {risk.model.toUpperCase()}</span><h3>{risk.score}<small>/100</small> <span>{riskLabel(risk.level)}</span></h3><p>{risk.limitation}</p></div><div className="risk-factors"><strong>Faktor terdeteksi</strong>{risk.factors.length ? risk.factors.map((factor, index) => <span key={`${factor.finding_id}-${index}`}><code>{factor.finding_id}</code> {severityLabel(factor.severity)} +{factor.weight}</span>) : <span>Tidak ada faktor risiko dari pemeriksaan yang tersedia.</span>}</div></section>}
    <div className="overview-grid"><div className="result-card"><div className="card-title"><h3>Perubahan kebijakan</h3><span className="quiet">BERDASARKAN ID ATURAN</span></div>{result.changes.default_policy && <div className="change-row"><span className="change-icon changed">↔</span><div><strong>Kebijakan bawaan</strong><small>{actionLabel(result.changes.default_policy.before)} → {actionLabel(result.changes.default_policy.after)}</small></div><span className="change-type">DIUBAH</span></div>}{result.changes.added.map((r) => <ChangeRow key={r.id} name={r.id} detail={`${actionLabel(r.action)} ${r.protocol}/${r.port}`} type="DITAMBAHKAN" kind="added"/>)}{result.changes.changed.map((r) => <ChangeRow key={r.id} name={r.id} detail={`${actionLabel(r.before.action)} → ${actionLabel(r.after.action)} · ${r.before.protocol}/${r.before.port} → ${r.after.protocol}/${r.after.port}`} type="DIUBAH" kind="changed"/>)}{result.changes.removed.map((r) => <ChangeRow key={r.id} name={r.id} detail={`${actionLabel(r.action)} ${r.protocol}/${r.port}`} type="DIHAPUS" kind="removed"/>)}{!result.changes.added.length && !result.changes.changed.length && !result.changes.removed.length && !result.changes.default_policy && <div className="empty-state">Tidak ada perubahan kebijakan. Mengurutkan ulang aturan tidak mengubah hasil konfigurasi.</div>}</div><div className="result-card"><div className="card-title"><h3>Rekomendasi tindakan</h3><span className="quiet">{result.recommendations.length} ITEM</span></div>{result.recommendations.length ? result.recommendations.map((r, i) => <div className="recommendation" key={`${i}-${r}`}><span>{String(i + 1).padStart(2, "0")}</span><p>{r}</p></div>) : <div className="empty-state">Tidak ada rekomendasi dari pemeriksaan yang tersedia.</div>}<div className="mini-sim"><PulseIcon/><span>Simulasi offline</span><strong>{result.simulation.after.length} probe</strong></div></div></div>
  </>;
}

function History({ items, status }: { items: HistoryItem[]; status: "idle" | "loading" | "available" | "unavailable" }) {
  if (status === "unavailable") return <section className="history-card"><h3>Riwayat audit</h3><p>Riwayat tidak tersedia. Analisis saat ini tetap dapat digunakan tanpa penyimpanan database.</p></section>;
  return <section className="history-card"><div className="card-title"><div><h3>Riwayat audit</h3><p>Ringkasan terbaru dari database.</p></div><Link className="secondary-button" href="/history">Lihat semua</Link></div><p>Konfigurasi mentah, alamat IP, probe, dan bukti mentah tidak disimpan.</p>{items.length ? <div className="history-list">{items.slice(0, 5).map((item) => <div key={item.id}><strong>#{item.id}</strong><span>{new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.created_at))}</span><span>{item.finding_count} temuan · {item.change_count} perubahan · skor {item.risk_score}/100</span></div>)}</div> : status === "available" ? <div className="empty-state">Belum ada ringkasan analisis tersimpan.</div> : null}</section>;
}

function Findings({ items }: { items: Finding[] }) { return items.length ? <div className="finding-list">{items.map((f, i) => <article className="finding-card" key={`${f.id}-${i}`}><div className={`severity-badge ${f.severity}`}>{f.severity === "critical" ? "Kritis" : f.severity === "high" ? "Tinggi" : f.severity === "medium" ? "Sedang" : "Rendah"}</div><div className="finding-body"><div className="finding-title"><h3>{f.title}</h3><code>{f.id}</code></div><p>{f.explanation}</p><div className="finding-evidence"><strong>Bukti</strong><pre>{JSON.stringify(f.evidence, null, 2)}</pre></div><div className="mitigation"><strong>Mitigasi yang disarankan</strong><span>{f.mitigation}</span></div>{f.rule_ids.length > 0 && <div className="related">ID aturan terkait: {f.rule_ids.map((id) => <code key={id}>{id}</code>)}</div>}</div></article>)}</div> : <div className="empty-state large-empty"><span className="check-circle">✓</span><strong>Tidak ada temuan</strong><span>Pemeriksaan kebijakan yang tersedia tidak menemukan pelanggaran.</span></div>; }

function Simulation({ before, after }: { before: Decision[]; after: Decision[] }) { if (!after.length) return <div className="empty-state large-empty"><PulseIcon/><strong>Tidak ada probe</strong><span>Tambahkan probe koneksi di konfigurasi untuk membandingkan keputusan pada kedua kebijakan.</span></div>; return <div className="result-card simulation-card"><div className="card-title"><div><h3>Keputusan koneksi</h3><p>Setiap probe dievaluasi secara terpisah pada kedua kumpulan aturan.</p></div><span className="quiet">{after.length} PROBE</span></div><div className="sim-table-head"><span>KONEKSI</span><span>SEBELUM</span><span>SESUDAH</span><span>PERUBAHAN</span></div>{after.map((a, i) => { const b = before[i]; return <div className="sim-row" key={`${a.probe.label || a.probe.source}-${i}`}><div className="connection"><strong>{a.probe.label || `${a.probe.source} → ${a.probe.destination}`}</strong><small>{a.probe.protocol.toUpperCase()}{a.probe.port ? ` / ${a.probe.port}` : ""} · cocok {a.matched_rule_id || "kebijakan bawaan"}</small><small className="reason">{a.reason}</small></div><DecisionBadge decision={b?.decision || "unknown"}/><DecisionBadge decision={a.decision}/><span className={`delta ${b?.decision === a.decision ? "same" : "different"}`}>{b?.decision === a.decision ? "Tidak berubah" : `${b?.decision} → ${a.decision}`}</span></div>; })}</div>; }

function actionLabel(action: string) { return action === "allow" ? "Izinkan" : action === "deny" ? "Tolak" : action; }
function severityLabel(severity: string) { return severity === "critical" ? "Kritis" : severity === "high" ? "Tinggi" : severity === "medium" ? "Sedang" : "Rendah"; }
function riskLabel(level: string) { return level === "critical" ? "Kritis" : level === "high" ? "Tinggi" : level === "medium" ? "Sedang" : "Rendah"; }
function DecisionBadge({ decision }: { decision: string }) { return <span className={`decision ${decision}`}>{decision === "allow" ? "✓ Izinkan" : decision === "deny" ? "⊘ Tolak" : decision}</span>; }
function ChangeRow({ name, detail, type, kind }: { name: string; detail: string; type: string; kind: string }) { return <div className="change-row"><span className={`change-icon ${kind}`}>{kind === "added" ? "+" : kind === "removed" ? "−" : "↔"}</span><div><strong>{name}</strong><small>{detail}</small></div><span className="change-type">{type}</span></div>; }
function SemanticCard({ number, title, text }: { number: string; title: string; text: string }) { return <article className="semantic-card"><span>{number}</span><h3>{title}</h3><p>{text}</p></article>; }
function ShieldIcon() { return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3 20 6v5.5c0 5.2-3.4 8.6-8 10.5-4.6-1.9-8-5.3-8-10.5V6l8-3Z" stroke="currentColor" strokeWidth="1.6"/><path d="m8.5 12 2.2 2.2 4.8-5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>; }
function PulseIcon() { return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3 12h4l3-8 4 16 3-8h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>; }
function ArrowIcon() { return <svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M4 10h12m-5-5 5 5-5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>; }
function RefreshIcon() { return <svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M16.5 8A6.5 6.5 0 0 0 5 5.5L3.5 7M3.5 4.5V7H6m-2.5 5A6.5 6.5 0 0 0 15 14.5l1.5-1.5m0 2.5V13H14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>; }
function DownloadIcon() { return <svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M10 3v9m0 0 3.5-3.5M10 12 6.5 8.5M4 14v2h12v-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>; }
function NavIcon({ name }: { name: string }) { const common = { width: 18, height: 18, viewBox: "0 0 20 20", fill: "none", "aria-hidden": true as const }; if (name === "overview") return <svg {...common}><rect x="3" y="3" width="5" height="5" rx="1" stroke="currentColor"/><rect x="12" y="3" width="5" height="5" rx="1" stroke="currentColor"/><rect x="3" y="12" width="5" height="5" rx="1" stroke="currentColor"/><rect x="12" y="12" width="5" height="5" rx="1" stroke="currentColor"/></svg>; if (name === "configuration") return <svg {...common}><path d="M4 5h12M4 10h12M4 15h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><circle cx="7" cy="5" r="1.5" fill="var(--sidebar)" stroke="currentColor"/><circle cx="13" cy="10" r="1.5" fill="var(--sidebar)" stroke="currentColor"/></svg>; if (name === "findings") return <svg {...common}><path d="M10 3 18 17H2L10 3Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/><path d="M10 8v4m0 2v.2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>; return <PulseIcon/>; }
