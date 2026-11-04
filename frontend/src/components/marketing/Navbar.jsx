import { Menu, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { Logo } from "@/components/common/Logo";
import { ThemeToggle } from "@/components/common/ThemeToggle";

const LINKS = [
  { label: "Beranda", to: "/" },
  { label: "Produk", to: "/features" },
  { label: "Solusi", to: "/#solusi" },
  { label: "Cara Kerja", to: "/#cara-kerja" },
  { label: "Harga", to: "/pricing" },
  { label: "Developer", to: "/developers" },
  { label: "Tentang Kami", to: "/about" },
];

const slug = (l) => l.toLowerCase().replace(/\s+/g, "-");

export const Navbar = () => {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 12);
    window.addEventListener("scroll", on);
    return () => window.removeEventListener("scroll", on);
  }, []);
  return (
    <header data-testid="marketing-navbar" className={`sticky top-0 z-50 transition-[background-color,box-shadow] duration-300 ${scrolled ? "bg-white/80 shadow-[0_1px_0_rgba(11,23,54,0.08)] backdrop-blur-xl dark:bg-[#0B1736]/80" : "bg-transparent"}`}>
      <div className="container-q flex h-16 items-center justify-between lg:h-20">
        <Logo />
        <nav className="hidden items-center gap-1 lg:flex">
          {LINKS.map((l) => (
            <NavLink key={l.label} to={l.to} end data-testid={`nav-${slug(l.label)}-link`}
              className="rounded-full px-3.5 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-[#0B1736] dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white">
              {l.label}
            </NavLink>
          ))}
        </nav>
        <div className="hidden items-center gap-2 lg:flex">
          <ThemeToggle />
          <Link to="/login" data-testid="nav-login-btn" className="rounded-full px-4 py-2 text-sm font-semibold text-[#0B1736] transition-colors hover:bg-slate-100 dark:text-white dark:hover:bg-white/10">Masuk</Link>
          <Link to="/register" data-testid="nav-register-btn" className="rounded-full bg-[#2563EB] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_8px_24px_-8px_rgba(37,99,235,0.7)] transition-[background-color,transform] hover:bg-[#1D4ED8] active:scale-95">Daftar Sekarang</Link>
        </div>
        <button type="button" className="lg:hidden" onClick={() => setOpen(!open)} data-testid="mobile-menu-toggle" aria-label="Buka menu">
          {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>
      {open && (
        <div data-testid="mobile-menu" className="border-t border-slate-200 bg-white px-4 pb-6 pt-2 dark:border-slate-800 dark:bg-[#0B1736] lg:hidden">
          {LINKS.map((l) => (
            <Link key={l.label} to={l.to} onClick={() => setOpen(false)} data-testid={`mobile-nav-${slug(l.label)}-link`} className="block border-b border-slate-100 py-3.5 text-base font-medium dark:border-slate-800">
              {l.label}
            </Link>
          ))}
          <div className="mt-5 flex items-center gap-3">
            <ThemeToggle />
            <Link to="/login" data-testid="mobile-login-btn" className="flex-1 rounded-full border border-slate-300 py-3 text-center text-sm font-semibold dark:border-slate-600">Masuk</Link>
            <Link to="/register" data-testid="mobile-register-btn" className="flex-1 rounded-full bg-[#2563EB] py-3 text-center text-sm font-semibold text-white">Daftar Sekarang</Link>
          </div>
        </div>
      )}
    </header>
  );
};
