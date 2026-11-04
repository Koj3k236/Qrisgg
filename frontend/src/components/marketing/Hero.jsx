import { motion } from "framer-motion";
import { ArrowRight, BarChart3, Clock, Code2, FileText, QrCode } from "lucide-react";
import { Link } from "react-router-dom";
import { HeroSlider } from "./HeroSlider";

const INDICATORS = [
  [QrCode, "QRIS Payment"],
  [FileText, "Smart Invoice"],
  [Code2, "Developer API"],
  [BarChart3, "Transaction Monitoring"],
];

const fade = (d) => ({ initial: { opacity: 0, y: 20 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.7, delay: d, ease: [0.22, 1, 0.36, 1] } });

const FloatCard = ({ className, children, delay, testid }) => (
  <motion.div data-testid={testid} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay, duration: 0.6 }}
    className={`absolute z-20 rounded-2xl border border-slate-100 bg-white/95 p-4 shadow-[0_20px_40px_-15px_rgba(11,23,54,0.35)] backdrop-blur-md dark:border-slate-700 dark:bg-[#122045]/95 ${className}`}>
    {children}
  </motion.div>
);

export const Hero = () => (
  <section data-testid="hero-section" className="relative overflow-hidden">
    <div className="grid-bg pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_at_top_left,black_30%,transparent_70%)]" />
    <div className="pointer-events-none absolute -right-40 -top-40 h-[520px] w-[520px] rounded-full bg-[#38BDF8]/20 blur-[120px]" />
    <div className="container-q relative grid items-center gap-14 pb-32 pt-10 lg:grid-cols-12 lg:gap-10 lg:pb-40 lg:pt-16">
      <div className="lg:col-span-5">
        <motion.p {...fade(0)} className="eyebrow inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50/70 px-3 py-1.5 dark:border-blue-500/30 dark:bg-blue-500/10">
          <span className="h-1.5 w-1.5 rounded-full bg-[#2563EB]" /> Solusi Pembayaran Digital untuk Bisnis Modern
        </motion.p>
        <motion.h1 {...fade(0.1)} data-testid="hero-headline" className="mt-6 text-4xl font-extrabold leading-[1.08] tracking-tighter text-[#0B1736] dark:text-white sm:text-5xl lg:text-6xl">
          Satu QRIS, Lebih Banyak Peluang <span className="text-[#2563EB] dark:text-[#38BDF8]">untuk Bisnis Anda.</span>
        </motion.h1>
        <motion.p {...fade(0.2)} className="mt-6 max-w-xl text-base leading-relaxed text-slate-600 dark:text-slate-300 md:text-lg">
          Kelola pembayaran QRIS, buat invoice, dan pantau aktivitas transaksi bisnis melalui satu platform yang praktis, modern, dan mudah diintegrasikan.
        </motion.p>
        <motion.div {...fade(0.3)} className="mt-9 flex flex-col gap-3 sm:flex-row">
          <Link to="/register" data-testid="hero-primary-cta" className="group inline-flex items-center justify-center gap-2 rounded-full bg-[#2563EB] px-7 py-4 text-sm font-semibold text-white shadow-[0_12px_30px_-10px_rgba(37,99,235,0.8)] transition-[background-color,transform] hover:bg-[#1D4ED8] active:scale-95">
            Mulai Sekarang <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </Link>
          <a href="#produk" data-testid="hero-secondary-cta" className="inline-flex items-center justify-center rounded-full border border-slate-300 px-7 py-4 text-sm font-semibold text-[#0B1736] transition-colors hover:border-[#2563EB] hover:text-[#2563EB] dark:border-slate-600 dark:text-white">
            Pelajari Qrisgg
          </a>
        </motion.div>
        <motion.ul {...fade(0.4)} className="mt-10 grid grid-cols-2 gap-x-6 gap-y-3">
          {INDICATORS.map(([Icon, label]) => (
            <li key={label} className="flex items-center gap-2.5 text-sm font-medium text-slate-700 dark:text-slate-300">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#2563EB]/10 text-[#2563EB] dark:text-[#38BDF8]"><Icon className="h-4 w-4" /></span>
              {label}
            </li>
          ))}
        </motion.ul>
        <p data-testid="hero-photo-note" className="mt-6 text-xs text-slate-400">Foto promosi. Kode QR pada foto bukan QRIS pembayaran aktif.</p>
      </div>
      <motion.div {...fade(0.2)} className="relative lg:col-span-7">
        <HeroSlider />
        <FloatCard testid="hero-float-invoice" delay={0.8} className="-bottom-24 left-4 w-60 sm:left-8">
          <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            <span>Invoice</span><span className="rounded bg-amber-100 px-1.5 py-0.5 text-[9px] text-amber-700">SANDBOX</span>
          </div>
          <div className="mt-2 font-mono text-xs text-slate-500">inv_demo_001</div>
          <div className="mt-1 text-2xl font-extrabold tracking-tight text-[#0B1736] dark:text-white">Rp100.<span className="text-[#2563EB]">237</span></div>
          <div className="mt-1 text-[11px] text-slate-500">Rp100.000 + kode unik 237</div>
        </FloatCard>
        <FloatCard testid="hero-float-status" delay={1} className="-bottom-16 right-4 hidden w-56 sm:block">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-100 text-amber-600"><Clock className="h-4 w-4" /></span>
            <div>
              <div className="text-xs font-bold text-[#0B1736] dark:text-white">Menunggu Verifikasi</div>
              <div className="text-[11px] text-slate-500">Contoh status · bukan transaksi nyata</div>
            </div>
          </div>
        </FloatCard>
      </motion.div>
    </div>
  </section>
);
