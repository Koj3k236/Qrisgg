import { ArrowUpRight, BarChart3, Code2, FileText, Landmark, LayoutDashboard, Link2, QrCode, Wallet } from "lucide-react";
import { Link } from "react-router-dom";
import { Reveal, SectionHead } from "./Reveal";

export const FEATURES = [
  { icon: QrCode, title: "QRIS Payment Management", desc: "Daftarkan QRIS statis Mandiri Livin' Usaha milik Anda, validasi payload, dan kelola statusnya di satu tempat.", span: "lg:col-span-2", status: "Sandbox" },
  { icon: FileText, title: "Smart Invoice", desc: "Invoice dengan nominal unik, batas waktu, dan riwayat status yang tercatat lengkap.", status: "Sandbox" },
  { icon: Link2, title: "Payment Links", desc: "Bagikan tautan pembayaran tanpa perlu membangun halaman checkout.", status: "Segera Hadir" },
  { icon: BarChart3, title: "Transaction Monitoring", desc: "Pantau setiap sinyal pembayaran, hasil pencocokan, dan antrian review.", status: "Sandbox" },
  { icon: Code2, title: "Developer API & Webhooks", desc: "REST API berversi, API key ber-scope, Idempotency-Key, dan webhook bertanda tangan HMAC-SHA256.", span: "lg:col-span-2", status: "Sandbox", to: "/developers" },
  { icon: LayoutDashboard, title: "Merchant Dashboard", desc: "Statistik invoice, pembayaran terverifikasi, tim, dan pengaturan dalam satu panel.", status: "Sandbox" },
  { icon: Landmark, title: "Settlement Monitoring", desc: "Pelacakan settlement dari sumber terpercaya setelah integrasi resmi tersedia.", status: "Segera Hadir" },
  { icon: Wallet, title: "Withdrawal Management", desc: "Alur penarikan dengan persetujuan dan audit — hanya simulasi sampai ada otorisasi payout.", status: "Segera Hadir" },
];

export const Features = () => (
  <section id="produk" data-testid="features-section" className="bg-[#F5F7FB] py-24 dark:bg-[#0d1a3d] lg:py-32">
    <div className="container-q">
      <SectionHead eyebrow="Produk" title="Semua yang Anda butuhkan untuk mengelola pembayaran QRIS." desc="Fitur berlabel Sandbox sudah dapat dicoba. Fitur berlabel Segera Hadir masih dalam pengembangan." />
      <div className="mt-16 grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-4">
        {FEATURES.map((f, i) => (
          <Reveal key={f.title} delay={i * 0.05} className={f.span || ""}>
            <div data-testid={`feature-card-${i}`} className="card-q group flex h-full flex-col p-7 transition-[transform,box-shadow] duration-300 hover:-translate-y-1 hover:shadow-[0_20px_40px_-20px_rgba(37,99,235,0.35)]">
              <div className="flex items-start justify-between">
                <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#0B1736] text-[#38BDF8] transition-colors group-hover:bg-[#2563EB] group-hover:text-white dark:bg-white/10">
                  <f.icon className="h-5 w-5" />
                </span>
                <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${f.status === "Sandbox" ? "bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300" : "bg-slate-200/70 text-slate-600 dark:bg-white/10 dark:text-slate-300"}`}>{f.status}</span>
              </div>
              <h3 className="mt-6 text-lg font-bold tracking-tight text-[#0B1736] dark:text-white">{f.title}</h3>
              <p className="mt-2 flex-1 text-sm leading-relaxed text-slate-600 dark:text-slate-400">{f.desc}</p>
              {f.to && (
                <Link to={f.to} data-testid={`feature-card-${i}-link`} className="mt-5 inline-flex items-center gap-1 text-sm font-semibold text-[#2563EB] dark:text-[#38BDF8]">
                  Selengkapnya <ArrowUpRight className="h-4 w-4" />
                </Link>
              )}
            </div>
          </Reveal>
        ))}
      </div>
    </div>
  </section>
);
