import { Activity, Code2, FileText, Layers, PieChart, QrCode } from "lucide-react";
import { Reveal, SectionHead } from "./Reveal";

const VALUES = [
  [Layers, "Manajemen transaksi terpusat", "Invoice, sinyal pembayaran, dan riwayat status tersimpan di satu sistem."],
  [FileText, "Pembuatan invoice digital", "Nominal unik otomatis untuk membedakan setiap pembayaran ke QRIS yang sama."],
  [QrCode, "Pengelolaan QRIS", "Konfigurasi QRIS statis Mandiri Livin' Usaha yang Anda miliki secara sah."],
  [Activity, "Pemantauan pembayaran", "Deteksi, verifikasi, dan review dipisahkan dengan jelas."],
  [Code2, "Integrasi developer", "API dan webhook untuk menghubungkan sistem toko Anda."],
  [PieChart, "Laporan merchant", "Statistik invoice dan pembayaran terverifikasi dari data nyata."],
];

export const BusinessValue = () => (
  <section data-testid="business-value-section" className="py-24 lg:py-32">
    <div className="container-q grid gap-16 lg:grid-cols-12">
      <div className="lg:col-span-5">
        <SectionHead eyebrow="Mengapa Qrisgg" title="Pembayaran Digital yang Mendukung Pertumbuhan Bisnis" desc="Qrisgg membantu bisnis merapikan operasional pembayaran: dari invoice hingga pemantauan status, tanpa spreadsheet dan tanpa menebak-nebak pembayaran mana milik pesanan mana." />
      </div>
      <div className="grid gap-px overflow-hidden rounded-2xl border border-slate-200 bg-slate-200 dark:border-slate-800 dark:bg-slate-800 sm:grid-cols-2 lg:col-span-7">
        {VALUES.map(([Icon, t, d], i) => (
          <Reveal key={t} delay={i * 0.05} className="bg-white p-7 dark:bg-[#0B1736]">
            <Icon className="h-5 w-5 text-[#2563EB] dark:text-[#38BDF8]" />
            <h3 className="mt-4 text-base font-bold text-[#0B1736] dark:text-white">{t}</h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">{d}</p>
          </Reveal>
        ))}
      </div>
    </div>
  </section>
);
