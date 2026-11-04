import { ArrowRight, Eye, FileLock2, KeyRound, Lock, ScrollText, ShieldCheck, Target, Users } from "lucide-react";
import { Link } from "react-router-dom";
import { Reveal, SectionHead } from "./Reveal";

export const ABOUT_TEXT = [
  "Qrisgg adalah platform teknologi pembayaran digital yang dikembangkan untuk membantu bisnis mengelola pembayaran QRIS secara lebih praktis, terstruktur, dan efisien.",
  "Kami berfokus pada pengembangan infrastruktur pembayaran yang menghubungkan kebutuhan merchant dengan teknologi modern, mulai dari pembuatan invoice, pemantauan transaksi, hingga integrasi API.",
  "Melalui pendekatan yang mengutamakan kemudahan penggunaan, keamanan sistem, dan pengembangan berkelanjutan, Qrisgg bertujuan menjadi solusi pembayaran digital yang relevan bagi bisnis dari berbagai skala.",
];
export const VISION = "Menjadi platform teknologi pembayaran digital yang inovatif, mudah diakses, dan mendukung pertumbuhan bisnis di Indonesia.";
export const MISSIONS = [
  "Menyederhanakan pengelolaan pembayaran digital.",
  "Mengembangkan infrastruktur yang aman dan terukur.",
  "Menyediakan integrasi API yang mudah digunakan.",
  "Mendukung efisiensi operasional merchant.",
  "Mengembangkan layanan secara bertanggung jawab.",
];

export const AboutSection = () => (
  <section id="tentang" data-testid="about-section" className="bg-[#F5F7FB] py-24 dark:bg-[#0d1a3d] lg:py-32">
    <div className="container-q grid gap-16 lg:grid-cols-2">
      <div>
        <SectionHead eyebrow="Tentang Qrisgg" title="Infrastruktur pembayaran yang dibangun dengan disiplin." />
        <Reveal className="mt-6 space-y-4 text-base leading-relaxed text-slate-600 dark:text-slate-300">
          {ABOUT_TEXT.map((p) => <p key={p.slice(0, 20)}>{p}</p>)}
        </Reveal>
        <Link to="/about" data-testid="about-section-cta" className="mt-8 inline-flex items-center gap-2 text-sm font-semibold text-[#2563EB] dark:text-[#38BDF8]">
          Selengkapnya tentang kami <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
      <div className="space-y-5">
        <Reveal className="card-q p-8">
          <div className="flex items-center gap-3"><Eye className="h-5 w-5 text-[#2563EB]" /><h3 className="font-bold">Visi</h3></div>
          <p className="mt-3 text-slate-600 dark:text-slate-300">{VISION}</p>
        </Reveal>
        <Reveal delay={0.1} className="card-q p-8">
          <div className="flex items-center gap-3"><Target className="h-5 w-5 text-[#2563EB]" /><h3 className="font-bold">Misi</h3></div>
          <ul className="mt-3 space-y-2 text-slate-600 dark:text-slate-300">
            {MISSIONS.map((m, i) => <li key={m} className="flex gap-3"><span className="font-mono text-xs text-[#2563EB]">0{i + 1}</span>{m}</li>)}
          </ul>
        </Reveal>
      </div>
    </div>
  </section>
);

export const SECURITY_ITEMS = [
  [Lock, "Autentikasi aman", "Kata sandi di-hash dengan Argon2id, sesi via cookie HTTP-only, pembatasan percobaan login.", "Aktif"],
  [Users, "Akses berbasis peran", "Peran platform dan merchant ditegakkan di backend pada setiap endpoint.", "Aktif"],
  [ScrollText, "Audit log transaksi", "Setiap transisi status invoice dan aksi sensitif tercatat dengan pelaku dan alasan.", "Aktif"],
  [ShieldCheck, "MFA administrator", "Administrator wajib TOTP 2FA; verifikasi pembayaran butuh kode 2FA tambahan.", "Aktif"],
  [KeyRound, "Keamanan API key", "API key disimpan sebagai hash SHA-256, ber-scope, dapat dirotasi dan dicabut.", "Aktif"],
  [FileLock2, "Verifikasi event pembayaran", "Sinyal pembayaran tidak pernah otomatis menjadi terverifikasi tanpa rekonsiliasi terpercaya.", "Aktif"],
  [Lock, "Komunikasi terenkripsi", "HTTPS di lingkungan pratinjau; konfigurasi TLS produksi disiapkan untuk VPS.", "Direncanakan (produksi)"],
];

export const SecuritySection = () => (
  <section id="keamanan" data-testid="security-section" className="py-24 lg:py-32">
    <div className="container-q">
      <SectionHead eyebrow="Keamanan" title="Kontrol keamanan yang benar-benar diterapkan." desc="Kami hanya mencantumkan kontrol yang sudah berjalan di sistem, dan menandai yang masih direncanakan. Qrisgg belum mengklaim sertifikasi PCI DSS, ISO 27001, maupun lisensi Bank Indonesia." />
      <div className="mt-14 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        {SECURITY_ITEMS.map(([Icon, t, d, s], i) => (
          <Reveal key={t} delay={i * 0.04}>
            <div data-testid={`security-item-${i}`} className="h-full rounded-2xl border border-slate-200 p-6 dark:border-slate-800">
              <div className="flex items-center justify-between">
                <Icon className="h-5 w-5 text-[#2563EB] dark:text-[#38BDF8]" />
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${s === "Aktif" ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300" : "bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300"}`}>{s}</span>
              </div>
              <h3 className="mt-4 font-bold text-[#0B1736] dark:text-white">{t}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">{d}</p>
            </div>
          </Reveal>
        ))}
      </div>
    </div>
  </section>
);

export const FinalCta = () => (
  <section data-testid="final-cta-section" className="px-4 pb-24 sm:px-6 lg:px-8">
    <div className="noise relative mx-auto max-w-7xl overflow-hidden rounded-[2rem] bg-[#0B1736] px-8 py-20 text-white md:px-16">
      <div className="pointer-events-none absolute -right-20 -top-20 h-80 w-80 rounded-full bg-[#2563EB]/40 blur-[100px]" />
      <div className="relative max-w-2xl">
        <h2 className="text-3xl font-bold tracking-tight md:text-4xl lg:text-5xl">Siap Mengembangkan Bisnis Bersama Qrisgg?</h2>
        <p className="mt-5 text-base text-slate-300 md:text-lg">Jelajahi solusi pengelolaan pembayaran digital yang dirancang untuk kebutuhan bisnis modern.</p>
        <div className="mt-9 flex flex-col gap-3 sm:flex-row">
          <Link to="/register" data-testid="final-cta-register-btn" className="rounded-full bg-[#2563EB] px-7 py-4 text-center text-sm font-semibold transition-[background-color,transform] hover:bg-[#1D4ED8] active:scale-95">Daftar Sekarang</Link>
          <Link to="/contact" data-testid="final-cta-contact-btn" className="rounded-full border border-white/30 px-7 py-4 text-center text-sm font-semibold transition-colors hover:bg-white/10">Hubungi Tim Qrisgg</Link>
        </div>
      </div>
    </div>
  </section>
);
