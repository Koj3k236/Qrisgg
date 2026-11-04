import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { ABOUT_TEXT, FinalCta, MISSIONS, SecuritySection, VISION } from "@/components/marketing/AboutSecurity";
import { DeveloperSection } from "@/components/marketing/DeveloperSection";
import { Features } from "@/components/marketing/Features";
import { PricingSection } from "@/components/marketing/PricingSection";
import { Reveal, SectionHead } from "@/components/marketing/Reveal";
import { api, errMsg } from "@/lib/api";

const PageHero = ({ eyebrow, title, desc }) => (
  <section className="relative overflow-hidden border-b border-slate-200 py-20 dark:border-slate-800 lg:py-28">
    <div className="grid-bg pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_at_top_left,black_20%,transparent_70%)]" />
    <div className="container-q relative">
      <p className="eyebrow">{eyebrow}</p>
      <h1 className="mt-4 max-w-4xl text-4xl font-extrabold tracking-tighter text-[#0B1736] dark:text-white sm:text-5xl lg:text-6xl">{title}</h1>
      {desc && <p className="mt-6 max-w-2xl text-base leading-relaxed text-slate-600 dark:text-slate-300 md:text-lg">{desc}</p>}
    </div>
  </section>
);

const ROADMAP = [
  ["Fase 1–5", "Arsitektur, fondasi, website, autentikasi, dashboard merchant & admin", "Selesai (sandbox)"],
  ["Fase 6–7", "Invoice sandbox Mandiri, nominal unik, state machine, ingest event & review", "Selesai (sandbox)"],
  ["Fase 8", "Ledger double-entry, settlement, hold 6 jam, simulasi penarikan", "Belum dimulai"],
  ["Fase 9", "Platform developer lanjutan (payment links, saldo API)", "Sebagian"],
  ["Fase 10", "Aplikasi Android notification listener (Kotlin)", "Belum dimulai"],
  ["Fase 12", "Integrasi resmi Bank Mandiri — hanya setelah dokumentasi, kredensial, dan otorisasi", "Menunggu otorisasi"],
];

export function AboutPage() {
  return (
    <div data-testid="about-page">
      <PageHero eyebrow="Tentang Kami" title="Tentang Qrisgg" desc={ABOUT_TEXT[0]} />
      <section className="py-20">
        <div className="container-q grid gap-14 lg:grid-cols-2">
          <Reveal className="space-y-5 text-base leading-relaxed text-slate-600 dark:text-slate-300">
            {ABOUT_TEXT.slice(1).map((p) => <p key={p.slice(0, 16)}>{p}</p>)}
            <h3 className="pt-4 text-xl font-bold text-[#0B1736] dark:text-white">Filosofi Produk</h3>
            <p>Deteksi pembayaran, verifikasi, settlement, dan penarikan adalah proses yang berbeda. Kami tidak pernah menganggap kecocokan nominal sebagai bukti dana telah diterima.</p>
            <h3 className="pt-4 text-xl font-bold text-[#0B1736] dark:text-white">Pendekatan Teknologi</h3>
            <p>Arsitektur modular dengan state machine pembayaran yang eksplisit, alokasi nominal unik yang aman terhadap konkurensi, audit log menyeluruh, dan mode sandbox sebelum transaksi nyata.</p>
          </Reveal>
          <Reveal className="relative overflow-hidden rounded-3xl">
            <img src="/images/modern.jpg" alt="Pelanggan membayar QRIS di kafe" className="h-full w-full object-cover" />
            <span className="absolute left-3 top-3 rounded-md bg-red-600 px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-white">Ilustrasi · QR DEMO</span>
          </Reveal>
        </div>
      </section>
      <section className="bg-[#F5F7FB] py-20 dark:bg-[#0d1a3d]">
        <div className="container-q grid gap-6 md:grid-cols-2">
          <div className="card-q p-8"><h3 className="text-lg font-bold">Visi</h3><p className="mt-3 text-slate-600 dark:text-slate-300">{VISION}</p></div>
          <div className="card-q p-8"><h3 className="text-lg font-bold">Misi</h3>
            <ul className="mt-3 list-disc space-y-1.5 pl-5 text-slate-600 dark:text-slate-300">{MISSIONS.map((m) => <li key={m}>{m}</li>)}</ul>
          </div>
        </div>
      </section>
      <section className="py-20">
        <div className="container-q">
          <SectionHead eyebrow="Roadmap" title="Peta jalan pengembangan" desc="Status yang dilaporkan apa adanya." />
          <div className="mt-10 overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800">
            {ROADMAP.map(([p, d, s]) => (
              <div key={p} className="grid gap-2 border-b border-slate-200 px-6 py-5 last:border-0 dark:border-slate-800 md:grid-cols-[140px_1fr_180px]">
                <span className="font-mono text-sm font-bold text-[#2563EB]">{p}</span><span className="text-sm">{d}</span><span className="text-sm text-slate-500">{s}</span>
              </div>
            ))}
          </div>
          <p className="mt-8 text-sm text-slate-500">Kontak: gunakan formulir di halaman <a href="/contact" className="text-[#2563EB] underline">Kontak</a>. Detail badan usaha dan alamat resmi akan dicantumkan setelah tersedia.</p>
        </div>
      </section>
      <FinalCta />
    </div>
  );
}

export const FeaturesPage = () => (<div data-testid="features-page"><PageHero eyebrow="Produk" title="Fitur Qrisgg" desc="Semua fitur di bawah diberi label sesuai status sebenarnya." /><Features /><FinalCta /></div>);
export const PricingPage = () => (<div data-testid="pricing-page"><PricingSection /><FinalCta /></div>);
export const DevelopersPage = () => (<div data-testid="developers-page"><DeveloperSection /><FinalCta /></div>);
export const SecurityPage = () => (<div data-testid="security-page"><PageHero eyebrow="Keamanan" title="Arsitektur keamanan Qrisgg" /><SecuritySection /></div>);

const ENDPOINTS = [
  ["POST", "/v1/invoices", "invoices:write", "Buat invoice QRIS sandbox. Mendukung header Idempotency-Key."],
  ["GET", "/v1/invoices", "invoices:read", "Daftar invoice (page, page_size)."],
  ["GET", "/v1/invoices/:id", "invoices:read", "Detail dan status invoice."],
  ["GET", "/v1/webhook-deliveries", "webhooks:read", "Riwayat pengiriman webhook."],
  ["*", "/v1/balances, /v1/settlements, /v1/withdrawals, /v1/payment-links", "-", "NOT IMPLEMENTED — mengembalikan HTTP 501."],
];

export function DocsPage() {
  const swagger = `${process.env.REACT_APP_BACKEND_URL}/api/docs`;
  return (
    <div data-testid="docs-page">
      <PageHero eyebrow="Dokumentasi" title="Referensi API Qrisgg" desc={`Base URL pratinjau: ${process.env.REACT_APP_BACKEND_URL}/api/v1 · Produksi (rencana): https://api.qrisgg.com/v1. Autentikasi: Authorization: Bearer qgg_sk_sandbox_...`} />
      <section className="py-16">
        <div className="container-q space-y-10">
          <a href={swagger} target="_blank" rel="noreferrer" data-testid="docs-swagger-link" className="inline-flex rounded-full bg-[#2563EB] px-6 py-3 text-sm font-semibold text-white">Buka OpenAPI / Swagger</a>
          <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800">
            <table className="tbl"><thead><tr><th>Metode</th><th>Endpoint</th><th>Scope</th><th>Keterangan</th></tr></thead>
              <tbody>{ENDPOINTS.map(([m, p, s, d]) => <tr key={p}><td className="font-mono font-bold text-[#2563EB]">{m}</td><td className="font-mono">{p}</td><td className="font-mono text-xs">{s}</td><td>{d}</td></tr>)}</tbody>
            </table>
          </div>
          <div className="grid gap-6 md:grid-cols-2">
            <div className="card-q p-6"><h3 className="font-bold">Format error standar</h3><pre className="mt-3 overflow-x-auto rounded-lg bg-[#081028] p-4 font-mono text-xs text-slate-200">{`{ "detail": "...", "error": { "code": "VALIDATION_ERROR", "message": "...", "request_id": "req_..." } }`}</pre></div>
            <div className="card-q p-6"><h3 className="font-bold">Verifikasi webhook</h3><p className="mt-3 text-sm text-slate-600 dark:text-slate-300">Header <code>X-Qrisgg-Signature: t=TIMESTAMP,v1=HEX</code>. Hitung HMAC-SHA256 dari <code>TIMESTAMP + "." + raw_body</code> dengan secret endpoint, bandingkan secara constant-time, dan tolak jika timestamp lebih dari 5 menit.</p></div>
          </div>
          <div className="card-q p-6 text-sm text-slate-600 dark:text-slate-300"><h3 className="font-bold text-[#0B1736] dark:text-white">Status pembayaran</h3>
            <p className="mt-2 font-mono text-xs">CREATED → PENDING → PAYMENT_DETECTED → AWAITING_VERIFICATION → PAID_VERIFIED · REVIEW_REQUIRED · FAILED · EXPIRED · CANCELLED · REFUNDED</p>
            <p className="mt-2">Event <code>payment.verified</code> hanya dikirim setelah rekonsiliasi terpercaya oleh admin — tidak pernah dari sinyal notifikasi semata.</p>
          </div>
        </div>
      </section>
    </div>
  );
}

export function ContactPage() {
  const [form, setForm] = useState({ name: "", email: "", company: "", message: "" });
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { data } = await api.post("/public/contact", { ...form, company: form.company || null });
      toast.success(data.message);
      setForm({ name: "", email: "", company: "", message: "" });
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setBusy(false);
    }
  };
  const field = "mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none transition-colors focus:border-[#2563EB] dark:border-slate-700 dark:bg-[#122045]";
  return (
    <div data-testid="contact-page">
      <PageHero eyebrow="Kontak" title="Hubungi Tim Qrisgg" desc="Pertanyaan tentang produk, integrasi, atau kemitraan. Pesan Anda tersimpan di sistem dukungan kami." />
      <section className="py-16"><div className="container-q max-w-2xl">
        <form onSubmit={submit} className="card-q space-y-4 p-8" data-testid="contact-form">
          {[["name", "Nama"], ["email", "Email"], ["company", "Perusahaan (opsional)"]].map(([k, l]) => (
            <label key={k} className="block text-sm font-medium">{l}
              <input data-testid={`contact-${k}-input`} type={k === "email" ? "email" : "text"} required={k !== "company"} value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} className={field} />
            </label>
          ))}
          <label className="block text-sm font-medium">Pesan
            <textarea data-testid="contact-message-input" required minLength={10} rows={5} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} className={field} />
          </label>
          <button disabled={busy} data-testid="contact-submit-btn" className="w-full rounded-full bg-[#2563EB] py-3.5 text-sm font-semibold text-white transition-[background-color,transform] hover:bg-[#1D4ED8] active:scale-95 disabled:opacity-60">{busy ? "Mengirim…" : "Kirim Pesan"}</button>
        </form>
      </div></section>
    </div>
  );
}

export function StatusPage() {
  const { data, isError, isLoading } = useQuery({ queryKey: ["health"], queryFn: async () => (await api.get("/health")).data });
  return (
    <div data-testid="status-page">
      <PageHero eyebrow="Status" title="Status Layanan" />
      <section className="py-16"><div className="container-q">
        <div className="card-q p-8" data-testid="status-result">
          {isLoading ? "Memeriksa…" : isError ? <span className="font-semibold text-red-600">API tidak dapat dijangkau</span> : (
            <ul className="space-y-2 text-sm"><li>API: <strong className="text-emerald-600">{data.status}</strong></li><li>Database: <strong className="text-emerald-600">{data.database}</strong></li>
              <li>Mode: <strong>{data.mode}</strong></li><li>Transaksi multi-dokumen MongoDB: <strong>{data.transactions_supported ? "didukung" : "tidak didukung di lingkungan ini (replica set diperlukan)"}</strong></li><li>Waktu server: {data.time}</li></ul>
          )}
        </div>
      </div></section>
    </div>
  );
}

const Legal = ({ title, sections, testid }) => (
  <div data-testid={testid}>
    <PageHero eyebrow="Legal" title={title} desc="Draf awal — akan diperbarui setelah peninjauan hukum dan sebelum layanan produksi diluncurkan." />
    <section className="py-16"><div className="container-q max-w-3xl space-y-8">
      {sections.map(([h, p]) => <div key={h}><h2 className="text-xl font-bold text-[#0B1736] dark:text-white">{h}</h2><p className="mt-3 leading-relaxed text-slate-600 dark:text-slate-300">{p}</p></div>)}
    </div></section>
  </div>
);

export const TermsPage = () => (
  <Legal testid="terms-page" title="Syarat & Ketentuan" sections={[
    ["Status layanan", "Qrisgg saat ini beroperasi dalam mode SANDBOX. Tidak ada dana nyata yang diproses, ditahan, atau disalurkan oleh Qrisgg."],
    ["Akun", "Pengguna bertanggung jawab atas kerahasiaan kredensial dan seluruh aktivitas pada akunnya."],
    ["QRIS merchant", "Merchant hanya boleh mendaftarkan QRIS yang dimiliki atau diotorisasi secara sah untuk bisnisnya. Qrisgg tidak menampung dana merchant."],
    ["Batasan", "Qrisgg tidak mengklaim kemitraan resmi dengan Bank Mandiri atau lisensi sebagai penyelenggara jasa pembayaran."],
  ]} />
);

export const PrivacyPage = () => (
  <Legal testid="privacy-page" title="Kebijakan Privasi" sections={[
    ["Data yang kami kumpulkan", "Nama, email, nama usaha, data invoice yang Anda buat, serta log aktivitas untuk keperluan keamanan dan audit."],
    ["Data yang tidak kami kumpulkan", "Kami tidak pernah meminta atau menyimpan PIN, OTP, password perbankan, maupun kredensial bank pelanggan."],
    ["Keamanan", "Kata sandi di-hash dengan Argon2id. Secret webhook dan 2FA dienkripsi saat disimpan. API key disimpan sebagai hash."],
    ["Hak Anda", "Anda dapat meminta akses atau penghapusan data melalui halaman Kontak."],
  ]} />
);
