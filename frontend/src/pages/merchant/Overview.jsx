import { AlertTriangle, CheckCircle2, Clock, FileText, Mail } from "lucide-react";
import { Link } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";
import { Empty, Metric, PageHeader, Panel } from "@/components/common/Page";
import { StatusBadge } from "@/components/common/StatusBadge";
import { useAuth } from "@/context/AuthContext";
import { api, errMsg } from "@/lib/api";
import { dt, rupiah } from "@/lib/format";
import { btnGhost, btnPrimary, useGet } from "@/lib/hooks";

const Banner = ({ tone, children, testid }) => (
  <div data-testid={testid} className={`mb-4 flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3 text-sm ${tone === "amber" ? "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200" : "border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-200"}`}>{children}</div>
);

export default function Overview() {
  const { user } = useAuth();
  const { data, isLoading, error } = useGet("merchant-overview", "/merchant/overview");
  const resend = async () => {
    try {
      const { data: r } = await api.post("/auth/resend-verification");
      toast.success(r.status === "SENT" ? "Email verifikasi terkirim" : `Status pengiriman: ${r.status}`);
    } catch (e) {
      toast.error(errMsg(e));
    }
  };
  if (isLoading) return <p className="text-sm text-slate-500">Memuat…</p>;
  if (error) return <p data-testid="overview-error" className="text-sm text-red-600">{errMsg(error)}</p>;
  return (
    <div data-testid="merchant-overview-page">
      <PageHeader title={`Halo, ${user.name.split(" ")[0]}`} description={`${data.merchant.name} · status merchant: ${data.merchant.status}`}
        actions={<Link to="/dashboard/invoices?new=1" data-testid="overview-new-invoice-btn" className={btnPrimary}>Buat Invoice</Link>} />
      {!user.email_verified && (
        <Banner tone="blue" testid="email-unverified-banner"><Mail className="h-4 w-4" /> Email Anda belum diverifikasi.
          <button type="button" onClick={resend} data-testid="resend-verification-btn" className="font-semibold underline">Kirim ulang email verifikasi</button></Banner>
      )}
      {data.merchant.status === "PENDING_REVIEW" && <Banner tone="amber" testid="merchant-pending-banner"><Clock className="h-4 w-4" /> Merchant menunggu persetujuan admin. Anda tetap dapat menguji invoice di sandbox.</Banner>}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric testid="metric-total-invoices" label="Total Invoice" value={data.total_invoices} icon={FileText} />
        <Metric testid="metric-verified" label="Terverifikasi" value={data.verified_count} hint={rupiah(data.verified_amount)} icon={CheckCircle2} />
        <Metric testid="metric-pending" label="Pending" value={data.pending_count} hint="Menunggu bayar / verifikasi" icon={Clock} />
        <Metric testid="metric-review" label="Perlu Ditinjau" value={data.review_count} icon={AlertTriangle} />
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Panel title="Invoice 14 hari terakhir" className="xl:col-span-2" testid="chart-panel">
          <div className="h-72 p-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.chart}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="date" tickFormatter={(d) => d.slice(5)} fontSize={11} />
                <YAxis allowDecimals={false} fontSize={11} width={30} />
                <Tooltip />
                <Bar dataKey="created" name="Dibuat" fill="#2563EB" radius={[4, 4, 0, 0]} />
                <Bar dataKey="verified" name="Terverifikasi" fill="#38BDF8" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel title="Konfigurasi & Webhook" testid="config-panel">
          <div className="space-y-4 p-5 text-sm">
            <div className="flex justify-between"><span className="text-slate-500">Metode pembayaran</span><span className="font-semibold">QRIS Mandiri (sandbox)</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Akun QRIS terdaftar</span><span data-testid="config-qris-count" className="font-semibold">{data.qris_accounts}</span></div>
            {["DELIVERED", "PENDING", "DEAD_LETTER"].map((s) => (
              <div key={s} className="flex justify-between"><StatusBadge status={s} /><span className="font-semibold">{data.webhook_deliveries[s] || 0}</span></div>
            ))}
            <Link to="/dashboard/qris" data-testid="config-qris-link" className={`${btnGhost} w-full`}>Kelola QRIS</Link>
          </div>
        </Panel>
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Panel title="Invoice terbaru" testid="recent-invoices-panel" actions={<Link to="/dashboard/invoices" className="text-xs font-semibold text-[#2563EB]">Lihat semua</Link>}>
          {data.recent_invoices.length ? (
            <table className="tbl"><tbody>{data.recent_invoices.map((r) => (
              <tr key={r.id}><td><Link to={`/dashboard/invoices/${r.id}`} className="font-mono text-xs text-[#2563EB]">{r.id}</Link></td><td className="font-semibold">{rupiah(r.payable_amount)}</td><td><StatusBadge status={r.status} /></td></tr>
            ))}</tbody></table>
          ) : <Empty text="Belum ada invoice. Buat invoice pertama Anda." />}
        </Panel>
        <Panel title="Aktivitas merchant" testid="activity-panel">
          {data.activity.length ? (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">{data.activity.map((a) => (
              <li key={a.id} className="flex items-center justify-between px-5 py-3 text-sm"><span className="font-mono text-xs">{a.action}</span><span className="text-xs text-slate-500">{dt(a.created_at)}</span></li>
            ))}</ul>
          ) : <Empty text="Belum ada aktivitas." />}
        </Panel>
      </div>
    </div>
  );
}
