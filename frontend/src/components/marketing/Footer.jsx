import { Link } from "react-router-dom";
import { Logo } from "@/components/common/Logo";

const COLS = [
  { title: "Produk", links: [["QRIS Payment", "/features"], ["Smart Invoice", "/features"], ["Dashboard Merchant", "/features"], ["Harga", "/pricing"]] },
  { title: "Developer", links: [["Developer", "/developers"], ["Dokumentasi API", "/docs"], ["Status Layanan", "/status"]] },
  { title: "Perusahaan", links: [["Tentang Kami", "/about"], ["Kontak", "/contact"], ["Keamanan", "/security"]] },
  { title: "Legal", links: [["Syarat & Ketentuan", "/terms"], ["Kebijakan Privasi", "/privacy"]] },
];

export const Footer = () => (
  <footer data-testid="marketing-footer" className="border-t border-slate-200 bg-white dark:border-slate-800 dark:bg-[#0B1736]">
    <div className="container-q grid gap-12 py-16 md:grid-cols-6">
      <div className="md:col-span-2">
        <Logo testid="footer-logo-link" />
        <p className="mt-5 max-w-xs text-sm leading-relaxed text-slate-500 dark:text-slate-400">
          Platform teknologi pembayaran digital untuk membantu bisnis mengelola pembayaran QRIS secara praktis, terstruktur, dan efisien.
        </p>
        <p className="mt-4 text-xs text-slate-400">Saat ini beroperasi dalam mode SANDBOX. Belum ada kemitraan resmi atau lisensi yang diklaim.</p>
      </div>
      {COLS.map((c) => (
        <div key={c.title}>
          <h4 className="text-xs font-bold uppercase tracking-[0.15em] text-[#0B1736] dark:text-white">{c.title}</h4>
          <ul className="mt-4 space-y-3">
            {c.links.map(([label, to]) => (
              <li key={label}>
                <Link to={to} data-testid={`footer-${label.toLowerCase().replace(/[^a-z]+/g, "-")}-link`} className="text-sm text-slate-500 transition-colors hover:text-[#2563EB] dark:text-slate-400 dark:hover:text-[#38BDF8]">{label}</Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
    <div className="border-t border-slate-200 dark:border-slate-800">
      <div className="container-q flex flex-col gap-2 py-6 text-xs text-slate-500 sm:flex-row sm:justify-between">
        <span>© {new Date().getFullYear()} Qrisgg. Seluruh hak cipta dilindungi.</span>
        <span>qrisgg.com · api.qrisgg.com</span>
      </div>
    </div>
  </footer>
);
