import { Construction } from "lucide-react";

export const PageHeader = ({ title, description, actions, testid = "page-header" }) => (
  <div data-testid={testid} className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
    <div>
      <h1 className="text-2xl font-bold tracking-tight text-[#0B1736] dark:text-white">{title}</h1>
      {description && <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{description}</p>}
    </div>
    {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
  </div>
);

export const Metric = ({ label, value, hint, icon: Icon, testid }) => (
  <div data-testid={testid} className="card-q p-5">
    <div className="flex items-center justify-between">
      <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</span>
      {Icon && <Icon className="h-4 w-4 text-[#2563EB] dark:text-[#38BDF8]" />}
    </div>
    <div className="mt-3 text-2xl font-bold tracking-tight text-[#0B1736] dark:text-white">{value}</div>
    {hint && <div className="mt-1 text-xs text-slate-500">{hint}</div>}
  </div>
);

export const Empty = ({ text, testid = "empty-state" }) => (
  <div data-testid={testid} className="px-4 py-12 text-center text-sm text-slate-500">{text}</div>
);

export const Panel = ({ title, actions, children, className = "", testid }) => (
  <section data-testid={testid} className={`card-q overflow-hidden ${className}`}>
    {(title || actions) && (
      <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800">
        <h2 className="text-sm font-semibold text-[#0B1736] dark:text-white">{title}</h2>
        {actions}
      </div>
    )}
    {children}
  </section>
);

export const NotImplemented = ({ title, phase, note }) => (
  <div data-testid="not-implemented-page">
    <PageHeader title={title} />
    <div className="card-q flex flex-col items-start gap-4 p-8">
      <span className="inline-flex items-center gap-2 rounded-md bg-slate-900 px-3 py-1 text-xs font-bold uppercase tracking-widest text-white dark:bg-white dark:text-slate-900">
        <Construction className="h-3.5 w-3.5" /> NOT IMPLEMENTED
      </span>
      <p className="max-w-2xl text-sm leading-relaxed text-slate-600 dark:text-slate-300">
        Fitur ini belum dibangun dan sengaja tidak menampilkan data apa pun agar tidak ada saldo atau transaksi palsu.
        {phase && <> Direncanakan pada <strong>{phase}</strong>.</>} {note}
      </p>
    </div>
  </div>
);
