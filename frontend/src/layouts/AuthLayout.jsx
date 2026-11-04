import { Outlet } from "react-router-dom";
import { Logo } from "@/components/common/Logo";
import { ThemeToggle } from "@/components/common/ThemeToggle";

export default function AuthLayout() {
  return (
    <div data-testid="auth-layout" className="grid min-h-screen lg:grid-cols-2">
      <div className="flex flex-col px-6 py-8 sm:px-12">
        <div className="flex items-center justify-between"><Logo /><ThemeToggle /></div>
        <div className="flex flex-1 items-center justify-center py-12">
          <div className="w-full max-w-md"><Outlet /></div>
        </div>
        <p className="text-xs text-slate-500">Mode SANDBOX · Tidak ada dana nyata yang diproses.</p>
      </div>
      <div className="noise relative hidden overflow-hidden bg-[#0B1736] lg:block">
        <img src="/images/kafe.jpg" alt="Pelanggan membayar dengan QRIS" className="absolute inset-0 h-full w-full object-cover object-[78%_center] opacity-60" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0B1736] via-[#0B1736]/40 to-transparent" />
        <span className="absolute right-6 top-6 rounded-md bg-red-600 px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-white">Ilustrasi · QR DEMO</span>
        <div className="absolute bottom-12 left-12 right-12 text-white">
          <p className="text-3xl font-bold leading-tight tracking-tight">Satu QRIS, Lebih Banyak Peluang.</p>
          <p className="mt-3 max-w-md text-slate-300">Kelola invoice, pantau pembayaran, dan integrasikan sistem Anda dengan aman.</p>
        </div>
      </div>
    </div>
  );
}
