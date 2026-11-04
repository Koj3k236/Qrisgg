import { Coffee, Globe, Hotel, ShoppingBag, Sparkles, Store } from "lucide-react";
import { Reveal, SectionHead } from "./Reveal";

const SEGMENTS = [
  [Coffee, "Kafe & Restoran", "Invoice per meja atau pesanan bawa pulang."],
  [Store, "Toko & Retail", "Cocokkan pembayaran kasir tanpa cek mutasi manual."],
  [ShoppingBag, "Fashion & Lifestyle", "Pesanan via chat dengan tautan pembayaran."],
  [Hotel, "Hotel & Penginapan", "Tagihan deposit dan pelunasan yang tercatat."],
  [Sparkles, "Salon & Kecantikan", "Pembayaran layanan dengan nominal unik."],
  [Globe, "Toko Online & Digital", "Integrasi API dan webhook ke sistem Anda."],
];

export const Solutions = () => (
  <section id="solusi" data-testid="solutions-section" className="py-24 lg:py-32">
    <div className="container-q">
      <SectionHead eyebrow="Solusi" title="Dirancang untuk berbagai jenis bisnis." desc="Dari UMKM hingga bisnis digital — alur yang sama, disesuaikan dengan cara Anda berjualan." />
      <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {SEGMENTS.map(([Icon, t, d], i) => (
          <Reveal key={t} delay={i * 0.05}>
            <div data-testid={`solution-card-${i}`} className="group flex items-start gap-4 rounded-2xl border border-slate-200 p-6 transition-[border-color,transform] duration-300 hover:-translate-y-1 hover:border-[#2563EB] dark:border-slate-800">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#38BDF8]/15 text-[#2563EB] dark:text-[#38BDF8]"><Icon className="h-5 w-5" /></span>
              <div>
                <h3 className="font-bold text-[#0B1736] dark:text-white">{t}</h3>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{d}</p>
              </div>
            </div>
          </Reveal>
        ))}
      </div>
    </div>
  </section>
);
