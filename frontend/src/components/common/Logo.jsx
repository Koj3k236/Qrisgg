import { Link } from "react-router-dom";

export const LogoMark = ({ className = "h-8 w-8" }) => (
  <svg viewBox="0 0 40 40" className={className} aria-hidden="true">
    <rect width="40" height="40" rx="11" fill="#2563EB" />
    <path d="M10 10h8v3h-5v5h-3zM30 10h-8v3h5v5h3zM10 30h8v-3h-5v-5h-3z" fill="#fff" />
    <rect x="17" y="17" width="6" height="6" rx="1.5" fill="#38BDF8" />
    <path d="M25 25l5 5" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
  </svg>
);

export const Logo = ({ to = "/", light = false, testid = "brand-logo-link" }) => (
  <Link to={to} data-testid={testid} className="flex items-center gap-2.5">
    <LogoMark />
    <span className={`text-xl font-extrabold tracking-tight ${light ? "text-white" : "text-[#0B1736] dark:text-white"}`}>
      Qris<span className="text-[#2563EB] dark:text-[#38BDF8]">gg</span>
    </span>
  </Link>
);
