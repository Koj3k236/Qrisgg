import { LogOut, Menu, X } from "lucide-react";
import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { Logo } from "@/components/common/Logo";
import { ModeBadge } from "@/components/common/StatusBadge";
import { ThemeToggle } from "@/components/common/ThemeToggle";
import { useAuth } from "@/context/AuthContext";
import { ROLE_LABEL } from "@/lib/format";

const NavItem = ({ item, onClick }) => (
  <NavLink to={item.to} end={item.end} onClick={onClick} data-testid={`sidebar-${item.id}-link`}
    className={({ isActive }) => `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${isActive ? "bg-[#2563EB] text-white" : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/5"}`}>
    <item.icon className="h-4 w-4" />
    <span className="flex-1">{item.label}</span>
    {item.soon && <span className="rounded bg-slate-200 px-1.5 text-[9px] font-bold uppercase text-slate-500 dark:bg-white/10">Belum</span>}
  </NavLink>
);

export default function AppShell({ groups, home, title, subtitle }) {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const doLogout = async () => {
    await logout();
    nav("/login");
  };
  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center justify-between border-b border-slate-200 px-5 dark:border-slate-800">
        <Logo to={home} testid="sidebar-logo-link" />
        <ModeBadge />
      </div>
      <div className="px-5 py-4">
        <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">{title}</div>
        <div data-testid="sidebar-context-name" className="mt-1 truncate text-sm font-semibold text-[#0B1736] dark:text-white">{subtitle}</div>
      </div>
      <nav className="flex-1 space-y-5 overflow-y-auto px-3 pb-6">
        {groups.map((g) => (
          <div key={g.label}>
            <div className="px-3 pb-1.5 text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400">{g.label}</div>
            <div className="space-y-0.5">{g.items.map((it) => <NavItem key={it.id} item={it} onClick={() => setOpen(false)} />)}</div>
          </div>
        ))}
      </nav>
      <div className="border-t border-slate-200 p-4 dark:border-slate-800">
        <div className="truncate text-sm font-semibold" data-testid="sidebar-user-name">{user?.name}</div>
        <div className="truncate text-xs text-slate-500">{user?.email}</div>
        <div className="mt-3 flex items-center gap-2">
          <ThemeToggle />
          <button type="button" onClick={doLogout} data-testid="logout-btn" className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-slate-200 py-2 text-sm font-medium transition-colors hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-white/5">
            <LogOut className="h-4 w-4" /> Keluar
          </button>
        </div>
      </div>
    </div>
  );
  return (
    <div className="min-h-screen bg-[#F5F7FB] dark:bg-[#0B1736]">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[260px] border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-[#0d1a3d] lg:block">{sidebar}</aside>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-[280px] bg-white dark:bg-[#0d1a3d]">{sidebar}</aside>
        </div>
      )}
      <div className="lg:pl-[260px]">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-slate-200 bg-white/80 px-4 backdrop-blur-xl dark:border-slate-800 dark:bg-[#0B1736]/80 sm:px-6">
          <button type="button" className="lg:hidden" onClick={() => setOpen(true)} data-testid="app-mobile-menu-btn" aria-label="Buka menu">
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
          <div className="hidden text-sm text-slate-500 lg:block">Lingkungan <strong className="text-amber-600">SANDBOX</strong> · Provider: Bank Mandiri — Livin' Usaha (simulasi)</div>
          <div data-testid="header-role-badge" className="rounded-full bg-[#0B1736] px-3 py-1 text-xs font-semibold text-white dark:bg-white/10">{ROLE_LABEL[user?.platform_role] || ROLE_LABEL[user?.memberships?.[0]?.role] || "-"}</div>
        </header>
        <main className="p-4 sm:p-6 lg:p-8"><Outlet /></main>
      </div>
    </div>
  );
}
