"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type HistoryItem = {
  id: number; created_at: string; rules_version: string; finding_count: number;
  high_severity_count: number; change_count: number; probe_count: number;
  risk_score: number; has_details?: boolean;
};
type HistoryPageData = { items: HistoryItem[]; page: number; page_size: number; total: number; total_pages: number };
type Finding = { id: string; severity: string; title: string; rule_ids: string[]; explanation: string; mitigation: string };
type Detail = {
  id: number; created_at: string; rules_version: string; finding_count: number;
  high_severity_count: number; change_count: number; probe_count: number; risk_score: number;
  detail_json: null | {
    changes: { added: string[]; removed: string[]; changed: { id: string; fields: string[] }[]; unchanged: string[]; default_policy_changed: boolean };
    findings: Finding[];
    risk: { score: number; level: string; model: string; factors: { finding_id: string; severity: string; weight: number }[]; limitation: string };
    simulation: { before: { allow: number; deny: number; total: number }; after: { allow: number; deny: number; total: number }; decision_changes: number };
    recommendations: string[]; assumptions: string[]; limitations: string[];
  };
};
const API = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").trim().replace(/\/+$/, "");

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}
function severityLabel(value: string) {
  return value === "critical" ? "Kritis" : value === "high" ? "Tinggi" : value === "medium" ? "Sedang" : "Rendah";
}

export default function HistoryDashboard() {
  const [data, setData] = useState<HistoryPageData | null>(null);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<number | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState("");
  const [detailError, setDetailError] = useState("");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const loadPage = useCallback(async (nextPage: number, signal?: AbortSignal) => {
    setLoading(true); setError("");
    try {
      const response = await fetch(`${API}/api/history?page=${nextPage}&page_size=10`, { signal: signal ?? AbortSignal.timeout(10000), cache: "no-store" });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error?.message || `Riwayat gagal dimuat (HTTP ${response.status}).`);
      const parsed = body as HistoryPageData;
      setData(parsed); setPage(parsed.page);
    } catch (e) {
      if (!(e instanceof DOMException && e.name === "AbortError")) setError(e instanceof Error ? e.message : "Riwayat tidak dapat dimuat.");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadPage(1), 0);
    return () => window.clearTimeout(timer);
  }, [loadPage]);

  const openDetail = async (id: number) => {
    if (selected === id) { setSelected(null); setDetail(null); setDetailError(""); return; }
    setSelected(id); setDetail(null); setDetailError(""); setDetailLoading(true);
    try {
      const response = await fetch(`${API}/api/history/${id}`, { signal: AbortSignal.timeout(10000), cache: "no-store" });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error?.message || `Detail gagal dimuat (HTTP ${response.status}).`);
      setDetail(body as Detail);
    } catch (e) { setDetailError(e instanceof Error ? e.message : "Detail tidak dapat dimuat."); }
    finally { setDetailLoading(false); }
  };

  return <main className="shell">
    <a className="skip-link" href="#history-content">Langsung ke riwayat</a>
    <aside className={`sidebar ${mobileMenuOpen ? "mobile-menu-open" : ""}`}>
      <div className="mobile-nav-header">
      <Link className="brand" href="/"><span className="brand-mark">CG</span><span>conduit<span className="brand-light">guard</span><small>NETWORK CHANGE CONTROL</small></span></Link>
      <div className="mobile-header-actions"><Link className="mobile-profile-link" href="/profile" aria-label="Buka profil" title="Profil"><span aria-hidden="true">CG</span></Link><button className="mobile-menu-toggle" type="button" aria-label={mobileMenuOpen ? "Tutup menu navigasi" : "Buka menu navigasi"} aria-expanded={mobileMenuOpen} aria-controls="history-navigation" onClick={() => setMobileMenuOpen((open) => !open)}><span/><span/><span/></button></div>
      </div>
      <div className="nav-label">RUANG KERJA</div>
      <nav id="history-navigation" aria-label="Navigasi utama">
        <Link className="nav-item" href="/">Ringkasan</Link>
        <Link className="nav-item" href="/configuration">Konfigurasi</Link>
        <Link className="nav-item" href="/findings">Temuan</Link>
        <Link className="nav-item" href="/simulation">Simulasi</Link>
        <Link className="nav-item selected" href="/history" aria-current="page">Riwayat analisis</Link>
      </nav>
      <div className="sidebar-bottom"><div className="offline-card"><span className="green-dot"/><div><strong>Mode simulasi aktif</strong><small>Tidak ada koneksi perangkat jaringan</small></div></div></div>
    </aside>
    <section className="main-panel">
      <header className="topbar"><div className="crumb">Ruang kerja <span>/</span> <strong>Riwayat analisis</strong></div><div className="top-right"><span className="env-tag"><i/> MODE SIMULASI</span><Link className="secondary-button" href="/configuration">Analisis baru</Link></div></header>
      <div className="content" id="history-content" tabIndex={-1}>
        <div className="page-heading"><div><div className="eyebrow"><span className="eyebrow-line"/> AUDIT & PELACAKAN</div><h1>Riwayat analisis</h1><p>Telusuri hasil analisis tersimpan, buka ringkasan detail, dan pindah halaman tanpa memuat seluruh riwayat sekaligus.</p></div><button className="secondary-button" type="button" onClick={() => void loadPage(page)} disabled={loading}>{loading ? "Memuat…" : "Muat ulang"}</button></div>
        <div className="safety-banner"><span className="shield-small">✓</span><div><strong>Penyimpanan yang memperhatikan privasi</strong><span>Detail menyimpan perubahan, temuan, mitigasi, dan agregat simulasi. Alamat IP, konfigurasi mentah, probe, serta bukti mentah tidak disimpan dalam detail.</span></div><span className="banner-badge">REDAKSI AKTIF</span></div>
        {error && <div className="error-box" role="alert"><span>!</span><div><strong>Riwayat belum dapat dimuat</strong><p>{error}</p><small>Pastikan backend aktif dan DATABASE_URL tersedia.</small></div></div>}
        <section className="history-card history-full-card" aria-labelledby="history-table-title">
          <div className="card-title"><div><h3 id="history-table-title">Semua analisis</h3><p>{data ? `${data.total} catatan tersimpan` : "Mengambil catatan dari database…"}</p></div><span className="quiet">{data ? `HALAMAN ${data.page} / ${data.total_pages}` : "MEMUAT"}</span></div>
          {loading && !data ? <div className="empty-state">Memuat riwayat analisis…</div> : data && data.items.length ? <>
            <div className="history-table-wrap"><table className="history-table"><thead><tr><th>ID / waktu</th><th>Temuan</th><th>Perubahan</th><th>Probe</th><th>Risiko</th><th>Detail</th></tr></thead><tbody>
              {data.items.map((item) => <tr key={item.id} className={selected === item.id ? "history-row-selected" : ""}>
                <td><strong>#{item.id}</strong><small>{dateLabel(item.created_at)}</small><small>Aturan v{item.rules_version}</small></td>
                <td>{item.finding_count}<small>{item.high_severity_count} kritis/tinggi</small></td>
                <td>{item.change_count}</td><td>{item.probe_count}</td>
                <td><span className={`history-risk ${item.risk_score >= 70 ? "risk-danger" : item.risk_score >= 30 ? "risk-warn" : "risk-safe"}`}>{item.risk_score}/100</span></td>
                <td><button type="button" className="secondary-button history-detail-button" onClick={() => void openDetail(item.id)} aria-expanded={selected === item.id}>{selected === item.id ? "Tutup" : "Lihat detail"}</button></td>
              </tr>)}
            </tbody></table></div>
            <div className="history-pagination"><span>Menampilkan {((data.page - 1) * data.page_size) + 1}–{Math.min(data.page * data.page_size, data.total)} dari {data.total}</span><div><button type="button" className="secondary-button" onClick={() => void loadPage(page - 1)} disabled={loading || page <= 1}>Sebelumnya</button><span className="history-page-number">Halaman {data.page} dari {data.total_pages}</span><button type="button" className="secondary-button" onClick={() => void loadPage(page + 1)} disabled={loading || page >= data.total_pages}>Berikutnya</button></div></div>
          </> : !error && <div className="empty-state large-empty"><span className="check-circle">↻</span><strong>Belum ada riwayat</strong><span>Jalankan analisis konfigurasi untuk membuat catatan pertama.</span><Link className="secondary-button" href="/configuration">Mulai analisis</Link></div>}
        </section>
        {selected !== null && <section className="history-card history-detail-panel" aria-live="polite">
          <div className="card-title"><div><h3>Detail analisis #{selected}</h3><p>Ringkasan hasil tersimpan dengan informasi sensitif dihilangkan.</p></div></div>
          {detailLoading && <p>Memuat detail…</p>}
          {detailError && <div className="error-box" role="alert"><span>!</span><p>{detailError}</p></div>}
          {detail && <><div className="history-detail-metrics"><div><span>Waktu</span><strong>{dateLabel(detail.created_at)}</strong></div><div><span>Skor risiko</span><strong>{detail.risk_score}/100 · {detail.detail_json?.risk.level ?? "—"}</strong></div><div><span>Versi aturan</span><strong>{detail.rules_version}</strong></div><div><span>Temuan</span><strong>{detail.finding_count} ({detail.high_severity_count} kritis/tinggi)</strong></div></div>
            {!detail.detail_json ? <div className="empty-state">Catatan ini dibuat sebelum detail analisis diaktifkan. Ringkasan metrik tetap tersedia, tetapi rincian historis tidak dapat dipulihkan karena tidak pernah disimpan.</div> : <>
              <div className="history-detail-section"><h4>Perubahan konfigurasi</h4><p>{detail.detail_json.changes.added.length} aturan ditambahkan · {detail.detail_json.changes.removed.length} dihapus · {detail.detail_json.changes.changed.length} diubah · {detail.detail_json.changes.unchanged.length} tidak berubah</p>
                {detail.detail_json.changes.added.length > 0 && <p><strong>Ditambahkan:</strong> {detail.detail_json.changes.added.join(", ")}</p>}
                {detail.detail_json.changes.removed.length > 0 && <p><strong>Dihapus:</strong> {detail.detail_json.changes.removed.join(", ")}</p>}
                {detail.detail_json.changes.changed.map((change) => <p key={change.id}><strong>{change.id}</strong> — bidang berubah: {change.fields.join(", ") || "tidak diketahui"}</p>)}
                {detail.detail_json.changes.default_policy_changed && <p>Kebijakan default berubah.</p>}
              </div>
              <div className="history-detail-section"><h4>Temuan dan mitigasi</h4>{detail.detail_json.findings.length ? detail.detail_json.findings.map((finding) => <article className="history-finding" key={finding.id}><span className={`severity-badge ${finding.severity}`}>{severityLabel(finding.severity)}</span><div><strong>{finding.title}</strong><small>{finding.id} · Aturan terkait: {finding.rule_ids.join(", ") || "—"}</small><p>{finding.explanation}</p><p><b>Mitigasi:</b> {finding.mitigation}</p></div></article>) : <p>Tidak ada temuan dari pemeriksaan yang dijalankan.</p>}</div>
              <div className="history-detail-section"><h4>Simulasi agregat</h4><p>Sebelum: {detail.detail_json.simulation.before.allow} diizinkan, {detail.detail_json.simulation.before.deny} ditolak dari {detail.detail_json.simulation.before.total} probe.</p><p>Sesudah: {detail.detail_json.simulation.after.allow} diizinkan, {detail.detail_json.simulation.after.deny} ditolak dari {detail.detail_json.simulation.after.total} probe.</p><p>Keputusan yang berubah: {detail.detail_json.simulation.decision_changes}.</p></div>
              {detail.detail_json.recommendations.length > 0 && <div className="history-detail-section"><h4>Rekomendasi</h4><ul>{detail.detail_json.recommendations.map((item, index) => <li key={index}>{item}</li>)}</ul></div>}
              <details className="history-detail-section"><summary>Asumsi dan batasan model</summary><ul>{[...detail.detail_json.assumptions, ...detail.detail_json.limitations].map((item, index) => <li key={index}>{item}</li>)}</ul></details>
            </>}
          </>}
        </section>}
        <footer><span>ConduitGuard <span className="footer-sep">·</span> Riwayat analisis</span><span>Mode simulasi · Tidak ada perubahan jaringan</span></footer>
      </div>
    </section>
  </main>;
}
