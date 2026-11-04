import { STATUS_META } from "@/lib/format";

const TONES = {
  slate: "bg-slate-100 text-slate-700 dark:bg-slate-700/40 dark:text-slate-200",
  blue: "bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300",
  sky: "bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
  amber: "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  orange: "bg-orange-50 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300",
  green: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  red: "bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300",
};

export const StatusBadge = ({ status, testid }) => {
  const meta = STATUS_META[status] || { label: status, tone: "slate" };
  return (
    <span data-testid={testid} className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${TONES[meta.tone]}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {meta.label}
    </span>
  );
};

export const ModeBadge = ({ mode = "SANDBOX" }) => (
  <span data-testid="mode-badge" className="inline-flex items-center rounded-md border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300">
    {mode}
  </span>
);
