import { useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Empty, PageHeader, Panel } from "@/components/common/Page";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { api, errMsg } from "@/lib/api";
import { dt, rupiah, STATUS_META } from "@/lib/format";
import { btnGhost, btnPrimary, inputCls, useCan, useGet } from "@/lib/hooks";

const STATUSES = ["PENDING", "AWAITING_VERIFICATION", "REVIEW_REQUIRED", "PAID_VERIFIED", "EXPIRED", "CANCELLED", "FAILED"];

function CreateInvoiceDialog({ open, onOpenChange }) {
  const qc = useQueryClient();
  const nav = useNavigate();
  const { data: qris = [] } = useGet("merchant-qris", "/merchant/qris");
  const [f, setF] = useState({ amount: "", external_id: "", description: "", customer_name: "", expires_in: "900", qris_account_id: "" });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const body = { amount: parseInt(f.amount, 10), expires_in: parseInt(f.expires_in, 10) };
      ["external_id", "description", "customer_name", "qris_account_id"].forEach((k) => { if (f[k]) body[k] = f[k]; });
      const { data } = await api.post("/merchant/invoices", body, { headers: { "Idempotency-Key": crypto.randomUUID() } });
      toast.success(`Invoice dibuat: ${rupiah(data.payable_amount)}`);
      qc.invalidateQueries({ queryKey: ["merchant-invoices"] });
      qc.invalidateQueries({ queryKey: ["merchant-overview"] });
      onOpenChange(false);
      nav(`/dashboard/invoices/${data.id}`);
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setBusy(false);
    }
  };
  const active = qris.filter((q) => q.status === "ACTIVE");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="create-invoice-dialog" className="max-w-lg">
        <DialogHeader><DialogTitle>Buat invoice sandbox</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <label className="block text-sm font-medium">Nominal (Rp, bilangan bulat)
            <input data-testid="invoice-amount-input" type="number" min={1000} step={1} required value={f.amount} onChange={set("amount")} className={`${inputCls} mt-1`} />
          </label>
          <p className="text-xs text-slate-500">Kode unik 1–999 ditambahkan otomatis ke nominal agar pembayaran dapat dicocokkan.</p>
          <label className="block text-sm font-medium">External ID (opsional)
            <input data-testid="invoice-external-id-input" value={f.external_id} onChange={set("external_id")} placeholder="ORDER-10001" className={`${inputCls} mt-1`} />
          </label>
          <label className="block text-sm font-medium">Deskripsi (opsional)
            <input data-testid="invoice-description-input" value={f.description} onChange={set("description")} className={`${inputCls} mt-1`} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm font-medium">Nama pelanggan
              <input data-testid="invoice-customer-input" value={f.customer_name} onChange={set("customer_name")} className={`${inputCls} mt-1`} />
            </label>
            <label className="block text-sm font-medium">Berlaku
              <select data-testid="invoice-expiry-select" value={f.expires_in} onChange={set("expires_in")} className={`${inputCls} mt-1`}>
                <option value="300">5 menit</option><option value="900">15 menit</option><option value="3600">1 jam</option><option value="86400">24 jam</option>
              </select>
            </label>
          </div>
          <label className="block text-sm font-medium">Akun QRIS penerima
            <select data-testid="invoice-qris-select" value={f.qris_account_id} onChange={set("qris_account_id")} className={`${inputCls} mt-1`}>
              <option value="">Akun sandbox virtual (default)</option>
              {active.map((q) => <option key={q.id} value={q.id}>{q.label}</option>)}
            </select>
          </label>
          <button disabled={busy} data-testid="invoice-submit-btn" className={`${btnPrimary} w-full`}>{busy ? "Membuat…" : "Buat Invoice"}</button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function Invoices() {
  const can = useCan();
  const [params, setParams] = useSearchParams();
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const { data, isLoading } = useGet(["merchant-invoices", status, q, page], "/merchant/invoices", { params: { status: status || undefined, q: q || undefined, page, page_size: 20 } });
  const open = params.get("new") === "1";
  const setOpen = (v) => setParams(v ? { new: "1" } : {});
  const pages = data ? Math.max(1, Math.ceil(data.total / 20)) : 1;
  return (
    <div data-testid="invoices-page">
      <PageHeader title="Invoice" description="Semua invoice tersimpan di database dan diproses lewat state machine pembayaran."
        actions={can("invoices:write") && <button type="button" onClick={() => setOpen(true)} data-testid="new-invoice-btn" className={btnPrimary}><Plus className="h-4 w-4" />Invoice Baru</button>} />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <input data-testid="invoice-search-input" placeholder="Cari ID invoice atau external ID" value={q} onChange={(e) => { setQ(e.target.value.trim()); setPage(1); }} className={`${inputCls} sm:max-w-xs`} />
        <select data-testid="invoice-status-filter" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className={`${inputCls} sm:max-w-xs`}>
          <option value="">Semua status</option>
          {STATUSES.map((s) => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
        </select>
      </div>
      <Panel testid="invoices-table-panel">
        {isLoading ? <Empty text="Memuat…" /> : !data.items.length ? <Empty text="Belum ada invoice." /> : (
          <div className="overflow-x-auto">
            <table className="tbl" data-testid="invoices-table">
              <thead><tr><th>Invoice</th><th>External ID</th><th>Nominal</th><th>Kode</th><th>Dibayar</th><th>Status</th><th>Dibuat</th></tr></thead>
              <tbody>{data.items.map((r) => (
                <tr key={r.id} data-testid={`invoice-row-${r.id}`}>
                  <td><Link to={`/dashboard/invoices/${r.id}`} className="font-mono text-xs font-semibold text-[#2563EB]">{r.id}</Link></td>
                  <td className="font-mono text-xs">{r.external_id || "-"}</td>
                  <td>{rupiah(r.amount)}</td><td className="font-mono">{r.unique_code}</td>
                  <td className="font-semibold">{rupiah(r.payable_amount)}</td>
                  <td><StatusBadge status={r.status} /></td><td className="text-xs text-slate-500">{dt(r.created_at)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </Panel>
      <div className="mt-4 flex items-center justify-end gap-2 text-sm">
        <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)} data-testid="invoices-prev-page" className={btnGhost}>Sebelumnya</button>
        <span data-testid="invoices-page-indicator">{page} / {pages}</span>
        <button type="button" disabled={page >= pages} onClick={() => setPage(page + 1)} data-testid="invoices-next-page" className={btnGhost}>Berikutnya</button>
      </div>
      {can("invoices:write") && <CreateInvoiceDialog open={open} onOpenChange={setOpen} />}
    </div>
  );
}
