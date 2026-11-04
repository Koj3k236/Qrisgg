import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import { PERMS } from "@/lib/format";

export const useGet = (key, url, opts = {}) =>
  useQuery({ queryKey: Array.isArray(key) ? key : [key], queryFn: async () => (await api.get(url, { params: opts.params })).data, ...opts });

export const useCan = () => {
  const { membership } = useAuth();
  return (perm) => (PERMS[membership?.role] || []).includes(perm);
};

export const inputCls = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition-colors focus:border-[#2563EB] dark:border-slate-700 dark:bg-[#0B1736]";
export const btnPrimary = "inline-flex items-center justify-center gap-2 rounded-lg bg-[#2563EB] px-4 py-2.5 text-sm font-semibold text-white transition-[background-color,transform] hover:bg-[#1D4ED8] active:scale-95 disabled:opacity-50";
export const btnGhost = "inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold transition-colors hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:hover:bg-white/5";
export const btnDanger = "inline-flex items-center justify-center gap-2 rounded-lg border border-red-300 px-4 py-2.5 text-sm font-semibold text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50 dark:border-red-500/40 dark:hover:bg-red-500/10";
