import { Reveal, SectionHead } from "./Reveal";

const STEPS = [
  ["Daftar akun", "Buat akun Qrisgg dengan email bisnis Anda dan verifikasi alamat email."],
  ["Lengkapi informasi merchant", "Isi profil usaha. Tim admin meninjau dan menyetujui merchant."],
  ["Konfigurasi metode pembayaran resmi", "Daftarkan QRIS statis Mandiri Livin' Usaha yang Anda miliki secara sah."],
  ["Buat invoice", "Lewat dashboard atau API. Sistem menambahkan kode unik agar nominal mudah dicocokkan."],
  ["Pelanggan memindai QRIS dan membayar", "Pelanggan membayar tepat sesuai nominal yang tertera di halaman pembayaran."],
  ["Event pembayaran dideteksi dan diverifikasi", "Sinyal pembayaran hanya menandai terdeteksi. Verifikasi butuh rekonsiliasi terpercaya."],
  ["Merchant memantau transaksi", "Status, riwayat transisi, dan notifikasi webhook tersedia real-time."],
];

export const HowItWorks = () => (
  <section id="cara-kerja" data-testid="how-it-works-section" className="relative overflow-hidden bg-[#0B1736] py-24 text-white noise lg:py-32">
    <div className="pointer-events-none absolute -left-32 top-20 h-96 w-96 rounded-full bg-[#2563EB]/25 blur-[120px]" />
    <div className="container-q relative grid gap-16 lg:grid-cols-12">
      <div className="lg:sticky lg:top-28 lg:col-span-5 lg:self-start">
        <SectionHead light eyebrow="Cara Kerja" title="Mulai Terima Pembayaran dengan Alur yang Lebih Praktis" desc="Tujuh langkah dari pendaftaran hingga pemantauan. Deteksi, verifikasi, dan settlement selalu menjadi proses terpisah." />
      </div>
      <ol className="relative lg:col-span-7">
        <span className="absolute bottom-4 left-[19px] top-4 w-px bg-gradient-to-b from-[#38BDF8] via-[#2563EB]/60 to-transparent" />
        {STEPS.map(([t, d], i) => (
          <Reveal key={t} delay={i * 0.06}>
            <li data-testid={`how-step-${i + 1}`} className="relative flex gap-6 pb-10 last:pb-0">
              <span className="relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#38BDF8]/50 bg-[#0B1736] font-mono text-sm font-bold text-[#38BDF8] shadow-[0_0_20px_rgba(56,189,248,0.35)]">
                {String(i + 1).padStart(2, "0")}
              </span>
              <div className="pt-1.5">
                <h3 className="text-lg font-bold tracking-tight">{t}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-300">{d}</p>
              </div>
            </li>
          </Reveal>
        ))}
      </ol>
    </div>
  </section>
);
