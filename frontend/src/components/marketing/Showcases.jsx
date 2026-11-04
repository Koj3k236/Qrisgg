import { CheckCircle2, Clock, FileText, ShieldCheck, TrendingUp } from "lucide-react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { DemoQR } from "@/components/common/DemoQR";
import { Reveal, SectionHead } from "./Reveal";

const DEMO_SERIES = [12, 18, 15, 22, 28, 24, 31, 35, 30, 38, 42, 39, 46, 51].map((v, i) => ({ d: `H${i + 1}`, v }));

const Tag = ({ children }) => (
  <span className="rounded-md bg-red-600 px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-white">{children}</span>
);

const Phone = () => (
  <div data-testid="payment-showcase-phone" className="relative mx-auto w-[300px] rounded-[2.6rem] border-[10px] border-[#0B1736] bg-white shadow-[0_40px_80px_-30px_rgba(11,23,54,0.6)]">
    <div className="mx-auto mt-2 h-5 w-24 rounded-full bg-[#0B1736]" />
    <div className="px-5 pb-6 pt-4 text-[#0B1736]">
      <div className="flex items-center justify-between text-xs">
        <span className="font-extrabold">Qris<span className="text-[#2563EB]">gg</span></span>
        <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold text-amber-700">SANDBOX</span>
      </div>
      <p className="mt-4 text-[11px] text-slate-500">Kopi Senja (contoh merchant)</p>
      <p className="font-mono text-[11px] text-slate-500">inv_demo_8f21</p>
      <p className="mt-2 text-3xl font-extrabold tracking-tight">Rp75.<span className="text-[#2563EB]">418</span></p>
      <div className="mt-4 flex justify-center"><DemoQR value="QRISGG-ILUSTRASI-TIDAK-UNTUK-PEMBAYARAN" size={150} testid="showcase-demo-qr" /></div>
      <div className="mt-4 flex items-center justify-center gap-2 rounded-xl bg-[#F5F7FB] py-2 text-xs font-semibold"><Clock className="h-3.5 w-3.5 text-[#2563EB]" /> Berlaku 14:32</div>
      <ol className="mt-4 space-y-1 text-[11px] text-slate-600">
        <li>1. Buka aplikasi pembayaran yang mendukung QRIS</li>
        <li>2. Pindai kode dan bayar tepat sesuai nominal</li>
      </ol>
      <div className="mt-4 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-700">
        <span className="h-2 w-2 animate-pulse rounded-full bg-amber-500" /> Menunggu pembayaran
      </div>
    </div>
  </div>
);

const MiniMetric = ({ icon: Icon, label, value }) => (
  <div className="rounded-xl border border-white/10 bg-white/5 p-4">
    <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-slate-400"><Icon className="h-3.5 w-3.5 text-[#38BDF8]" />{label}</div>
    <div className="mt-2 text-xl font-bold text-white">{value}</div>
  </div>
);

const DashboardPreview = () => (
  <div data-testid="dashboard-showcase-preview" className="relative rounded-3xl border border-white/10 bg-[#0B1736] p-6 shadow-[0_40px_80px_-30px_rgba(11,23,54,0.7)]">
    <div className="mb-5 flex items-center justify-between">
      <div className="text-sm font-semibold text-white">Ringkasan Merchant</div>
      <Tag>Data ilustrasi</Tag>
    </div>
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <MiniMetric icon={FileText} label="Invoice" value="1.284" />
      <MiniMetric icon={CheckCircle2} label="Terverifikasi" value="1.102" />
      <MiniMetric icon={Clock} label="Pending" value="64" />
      <MiniMetric icon={TrendingUp} label="Settlement" value="Segera" />
    </div>
    <div className="mt-5 h-44 rounded-xl border border-white/10 bg-white/[0.03] p-3">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={DEMO_SERIES}>
          <defs>
            <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#38BDF8" stopOpacity={0.5} />
              <stop offset="100%" stopColor="#38BDF8" stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis dataKey="d" hide />
          <Tooltip contentStyle={{ background: "#122045", border: "none", borderRadius: 8, color: "#fff" }} />
          <Area type="monotone" dataKey="v" stroke="#38BDF8" strokeWidth={2} fill="url(#g1)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
    <div className="mt-5 space-y-2">
      {[["inv_demo_a1", "Rp250.112", "Terverifikasi"], ["inv_demo_b7", "Rp48.903", "Menunggu"], ["inv_demo_c3", "Rp1.200.455", "Perlu Ditinjau"]].map(([id, a, s]) => (
        <div key={id} className="flex items-center justify-between rounded-lg bg-white/[0.04] px-3 py-2.5 text-xs text-slate-300">
          <span className="font-mono">{id}</span><span className="font-semibold text-white">{a}</span><span>{s}</span>
        </div>
      ))}
    </div>
  </div>
);

export const PaymentShowcase = () => (
  <section data-testid="payment-showcase-section" className="py-24 lg:py-32">
    <div className="container-q grid items-center gap-16 lg:grid-cols-2">
      <SectionHead eyebrow="Halaman Pembayaran" title="Pengalaman bayar yang jelas bagi pelanggan Anda." desc="Setiap invoice memiliki halaman pembayaran sendiri: nama merchant, nominal lengkap dengan kode unik, hitung mundur, instruksi, dan status yang diperbarui otomatis. Tampilan di samping adalah ilustrasi sandbox — kode QR bertanda DEMO tidak dapat dibayar." />
      <Reveal className="relative">
        <div className="absolute inset-0 -z-10 m-auto h-72 w-72 rounded-full bg-[#2563EB]/20 blur-[100px]" />
        <div className="mb-4 flex justify-center"><Tag>Ilustrasi sandbox</Tag></div>
        <Phone />
      </Reveal>
    </div>
  </section>
);

export const DashboardShowcase = () => (
  <section data-testid="dashboard-showcase-section" className="bg-[#F5F7FB] py-24 dark:bg-[#0d1a3d] lg:py-32">
    <div className="container-q grid items-center gap-16 lg:grid-cols-12">
      <div className="lg:col-span-5">
        <SectionHead eyebrow="Dashboard Merchant" title="Pantau invoice dan pembayaran dari satu panel." desc="Di dashboard asli, setiap angka berasal dari backend dan database Qrisgg milik akun Anda. Pratinjau ini menggunakan data ilustrasi." />
        <ul className="mt-8 space-y-3 text-sm text-slate-700 dark:text-slate-300">
          {["Analitik invoice 14 hari", "Antrian pembayaran pending dan perlu ditinjau", "Status pengiriman webhook", "Aktivitas tim yang tercatat di audit log"].map((t) => (
            <li key={t} className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-[#2563EB]" />{t}</li>
          ))}
        </ul>
      </div>
      <Reveal className="lg:col-span-7"><DashboardPreview /></Reveal>
    </div>
  </section>
);
