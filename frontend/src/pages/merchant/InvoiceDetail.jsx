import { useQueryClient } from "@tanstack/react-query";
import { Copy, ExternalLink, FlaskConical } from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";
import { PageHeader, Panel } from "@/components/common/Page";
import { ModeBadge, StatusBadge } from "@/components/common/StatusBadge";
import { api, errMsg } from "@/lib/api";
import { dt, rupiah } from "@/lib/format";
import { btnDanger, btnGhost, btnPrimary, inputCls, useCan, useGet } from "@/lib/hooks";

export const Timeline = ({ transitions }) => (
  <ol data-testid="invoice-timeline" className="relative space-y-5 p-5">
    {transitions.map((t) => (
      <li key={t.id} className="relative flex gap-4">
        <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-[#2563EB] ring-4 ring-blue-100 dark:ring-blue-500/20" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {t.from_status && <><StatusBadge status={t.from_status} /><span className="text-slate-400">→</span></>}
            <StatusBadge status={t.to_status} />
          </div>
          <p className="mt-1 text-sm text-slate-700 dark:text-slate-300">{t.reason}</p>
          <p className="mt-0.5 font-mono text-[11px] text-slate-500">{dt(t.created_at)} · sumber {t.source}{t.actor_id ? ` · aktor ${t.actor_id}` : ""}{t.event_id ? ` · event ${t.event_id}` : ""}</p>
        </div>
      </li>
    ))}
  </ol>
);

export const EventsTable = ({ events }) => (
  <div className="overflow-x-auto">
    <table className="tbl" data-testid="invoice-events-table">
      <thead><tr><th>Event</th><th>Sumber</th><th>Nominal</th><th>Hasil</th><th>Status</th><th>Waktu</th></tr></thead>
      <tbody>{events.length ? events.map((e) => (
        <tr key={e.id}><td className="font-mono text-xs">{e.id}</td><td className="text-xs">{e.source}</td><td className="font-semibold">{rupiah(e.amount)}</td>
          <td className="font-mono text-xs">{e.match_result}</td><td><StatusBadge status={e.status} /></td><td className="text-xs text-slate-500">{dt(e.created_at)}</td></tr>
      )) : <tr><td colSpan={6} className="text-center text-slate-500">Belum ada event pembayaran.</td></tr>}</tbody>
    </table>
  </div>
);

export const InvoiceSummary = ({ inv }) => (
  <div className="grid gap-4 p-5 text-sm sm:grid-cols-2">
    {[["Nominal dasar", rupiah(inv.amount)], ["Kode unik", inv.unique_code], ["Total dibayar", rupiah(inv.payable_amount)], ["Diterima", rupiah(inv.paid_amount)],
      ["External ID", inv.external_id || "-"], ["Kedaluwarsa", dt(inv.expires_at)], ["Provider", inv.provider], ["Alasan review", inv.review_reason || "-"]].map(([k, v]) => (
      <div key={k}><div className="text-xs uppercase tracking-wider text-slate-500">{k}</div><div data-testid={`invoice-field-${k.toLowerCase().replace(/\s+/g, "-")}`} className="mt-1 font-semibold">{v}</div></div>
    ))}
  </div>
);

function Simulator({ inv, onDone }) {
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      const { data } = await api.post(`/merchant/invoices/${inv.id}/sandbox/simulate-payment`, amount ? { amount: parseInt(amount, 10) } : {});
      toast.success(`Event ${data.event.match_result} · status: ${data.invoice.status}`);
      setAmount("");
      onDone();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Panel title="Simulator pembayaran sandbox" testid="simulator-panel">
      <div className="space-y-3 p-5 text-sm">
        <p className="text-slate-600 dark:text-slate-300">Mengirim sinyal pembayaran ke backend. Hasil maksimal adalah <strong>Menunggu Verifikasi</strong>; verifikasi akhir hanya lewat rekonsiliasi admin.</p>
        <input data-testid="simulate-amount-input" type="number" placeholder={`Kosongkan = ${inv.payable_amount} (tepat)`} value={amount} onChange={(e) => setAmount(e.target.value)} className={inputCls} />
        <button type="button" disabled={busy} onClick={run} data-testid="simulate-payment-btn" className={`${btnPrimary} w-full`}><FlaskConical className="h-4 w-4" />{busy ? "Mengirim…" : "Simulasikan Pembayaran"}</button>
      </div>
    </Panel>
  );
}

export default function InvoiceDetail() {
  const { invoiceId } = useParams();
  const can = useCan();
  const qc = useQueryClient();
  const { data: inv, isLoading, error, refetch } = useGet(["merchant-invoice", invoiceId], `/merchant/invoices/${invoiceId}`);
  if (isLoading) return <p className="text-sm text-slate-500">Memuat…</p>;
  if (error) return <p data-testid="invoice-error" className="text-sm text-red-600">{errMsg(error)}</p>;
  const payUrl = `${window.location.origin}/pay/${inv.id}`;
  const done = () => { refetch(); qc.invalidateQueries({ queryKey: ["merchant-overview"] }); };
  const cancel = async () => {
    try {
      await api.post(`/merchant/invoices/${inv.id}/cancel`, { reason: "Dibatalkan oleh merchant" });
      toast.success("Invoice dibatalkan");
      done();
    } catch (e) {
      toast.error(errMsg(e));
    }
  };
  return (
    <div data-testid="invoice-detail-page">
      <Link to="/dashboard/invoices" data-testid="back-to-invoices" className="text-sm font-semibold text-[#2563EB]">← Semua invoice</Link>
      <PageHeader title={<span className="font-mono text-xl">{inv.id}</span>} description={inv.description || "Invoice QRIS"}
        actions={<>
          <ModeBadge mode={inv.mode} /><StatusBadge status={inv.status} testid="invoice-status-badge" />
          <button type="button" onClick={() => { navigator.clipboard.writeText(payUrl); toast.success("Tautan disalin"); }} data-testid="copy-pay-link-btn" className={btnGhost}><Copy className="h-4 w-4" />Salin tautan</button>
          <a href={payUrl} target="_blank" rel="noreferrer" data-testid="open-pay-page-btn" className={btnGhost}><ExternalLink className="h-4 w-4" />Halaman bayar</a>
          {can("invoices:write") && ["PENDING", "REVIEW_REQUIRED"].includes(inv.status) && <button type="button" onClick={cancel} data-testid="cancel-invoice-btn" className={btnDanger}>Batalkan</button>}
        </>} />
      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Panel title="Ringkasan" testid="invoice-summary-panel"><InvoiceSummary inv={inv} /></Panel>
          <Panel title="Riwayat transisi status" testid="invoice-transitions-panel"><Timeline transitions={inv.transitions} /></Panel>
          <Panel title="Event pembayaran" testid="invoice-events-panel"><EventsTable events={inv.events} /></Panel>
        </div>
        <div className="space-y-6">
          {can("invoices:write") && inv.mode === "SANDBOX" && <Simulator inv={inv} onDone={done} />}
          <Panel title="Rekonsiliasi" testid="invoice-reconciliation-panel">
            <div className="p-5 text-sm">{inv.reconciliations.length ? inv.reconciliations.map((r) => (
              <div key={r.id} className="mb-3"><StatusBadge status={r.result === "VERIFIED" ? "PAID_VERIFIED" : "FAILED"} /><p className="mt-1">{r.note}</p><p className="text-xs text-slate-500">{r.method} · {dt(r.created_at)}</p></div>
            )) : <p className="text-slate-500">Belum direkonsiliasi. Verifikasi dilakukan oleh admin Qrisgg dengan 2FA.</p>}</div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
