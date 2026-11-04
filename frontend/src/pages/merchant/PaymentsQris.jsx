import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Empty, PageHeader, Panel } from "@/components/common/Page";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Link } from "react-router-dom";
import { api, errMsg } from "@/lib/api";
import { dt, rupiah } from "@/lib/format";
import { btnDanger, btnGhost, btnPrimary, inputCls, useCan, useGet } from "@/lib/hooks";

export function PaymentsPage({ title = "Event Pembayaran" }) {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useGet(["merchant-events", page], "/merchant/payment-events", { params: { page, page_size: 25 } });
  return (
    <div data-testid="payments-page">
      <PageHeader title={title} description="Sinyal pembayaran yang diterima (simulator sandbox). Sinyal tidak sama dengan verifikasi." />
      <Panel testid="payments-table-panel">
        {isLoading ? <Empty text="Memuat…" /> : !data.items.length ? <Empty text="Belum ada event pembayaran." /> : (
          <div className="overflow-x-auto"><table className="tbl" data-testid="payments-table">
            <thead><tr><th>Event</th><th>Invoice</th><th>Sumber</th><th>Nominal</th><th>Referensi</th><th>Hasil</th><th>Status</th><th>Waktu</th></tr></thead>
            <tbody>{data.items.map((e) => (
              <tr key={e.id}><td className="font-mono text-xs">{e.id}</td>
                <td>{e.invoice_id ? <Link to={`/dashboard/invoices/${e.invoice_id}`} className="font-mono text-xs text-[#2563EB]">{e.invoice_id}</Link> : "-"}</td>
                <td className="text-xs">{e.source}</td><td className="font-semibold">{rupiah(e.amount)}</td><td className="font-mono text-xs">{e.reference}</td>
                <td className="font-mono text-xs">{e.match_result}</td><td><StatusBadge status={e.status} /></td><td className="text-xs text-slate-500">{dt(e.created_at)}</td></tr>
            ))}</tbody></table></div>
        )}
      </Panel>
      {data && data.total > 25 && (
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)} className={btnGhost} data-testid="payments-prev-page">Sebelumnya</button>
          <button type="button" disabled={page * 25 >= data.total} onClick={() => setPage(page + 1)} className={btnGhost} data-testid="payments-next-page">Berikutnya</button>
        </div>
      )}
    </div>
  );
}

export function QrisPage() {
  const can = useCan();
  const qc = useQueryClient();
  const { data = [], isLoading } = useGet("merchant-qris", "/merchant/qris");
  const [f, setF] = useState({ label: "", nmid: "", qris_payload: "", authorization_confirmed: false });
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post("/merchant/qris", { ...f, nmid: f.nmid || null, qris_payload: f.qris_payload.trim() || null });
      toast.success("Akun QRIS dikirim untuk ditinjau admin");
      setF({ label: "", nmid: "", qris_payload: "", authorization_confirmed: false });
      qc.invalidateQueries({ queryKey: ["merchant-qris"] });
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setBusy(false);
    }
  };
  const disable = async (id) => {
    try {
      await api.delete(`/merchant/qris/${id}`);
      qc.invalidateQueries({ queryKey: ["merchant-qris"] });
    } catch (err) {
      toast.error(errMsg(err));
    }
  };
  return (
    <div data-testid="qris-page">
      <PageHeader title="QRIS Bank Mandiri — Livin' Usaha" description="Fase 1 hanya mendukung QRIS statis Mandiri Livin' Usaha milik Anda sendiri. Integrasi API resmi Mandiri belum tersedia." />
      <div className="grid gap-6 xl:grid-cols-5">
        <Panel title="Akun QRIS terdaftar" className="xl:col-span-3" testid="qris-list-panel">
          {isLoading ? <Empty text="Memuat…" /> : !data.length ? <Empty text="Belum ada akun QRIS. Invoice memakai akun sandbox virtual." /> : (
            <table className="tbl"><thead><tr><th>Label</th><th>Nama di QRIS</th><th>Payload</th><th>Status</th><th /></tr></thead>
              <tbody>{data.map((q) => (
                <tr key={q.id} data-testid={`qris-row-${q.id}`}><td className="font-semibold">{q.label}</td><td>{q.qris_merchant_name || "-"}</td>
                  <td className="text-xs">{q.payload_validated ? "Tervalidasi (CRC OK)" : "Tidak diunggah"}</td><td><StatusBadge status={q.status} /></td>
                  <td>{can("qris:manage") && q.status !== "DISABLED" && <button type="button" onClick={() => disable(q.id)} data-testid={`qris-disable-${q.id}`} className={btnDanger}>Nonaktifkan</button>}</td></tr>
              ))}</tbody></table>
          )}
        </Panel>
        {can("qris:manage") && (
          <Panel title="Daftarkan QRIS statis" className="xl:col-span-2" testid="qris-form-panel">
            <form onSubmit={submit} className="space-y-3 p-5 text-sm">
              <input data-testid="qris-label-input" required minLength={2} placeholder="Label, mis. Kasir Utama" value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} className={inputCls} />
              <input data-testid="qris-nmid-input" placeholder="NMID (opsional)" value={f.nmid} onChange={(e) => setF({ ...f, nmid: e.target.value })} className={inputCls} />
              <textarea data-testid="qris-payload-input" rows={3} placeholder="Payload QRIS (string 000201…6304XXXX), opsional" value={f.qris_payload} onChange={(e) => setF({ ...f, qris_payload: e.target.value })} className={`${inputCls} font-mono text-xs`} />
              <label className="flex items-start gap-2 text-xs text-slate-600 dark:text-slate-300">
                <input type="checkbox" data-testid="qris-authorization-checkbox" checked={f.authorization_confirmed} onChange={(e) => setF({ ...f, authorization_confirmed: e.target.checked })} className="mt-0.5" />
                Saya menyatakan QRIS ini terdaftar atas nama bisnis saya di Bank Mandiri Livin' Usaha dan saya berwenang menggunakannya.
              </label>
              <button disabled={busy} data-testid="qris-submit-btn" className={`${btnPrimary} w-full`}>Kirim untuk Ditinjau</button>
              <p className="text-xs text-slate-500">Dalam mode sandbox, halaman pembayaran selalu menampilkan QR DEMO, bukan QRIS asli Anda.</p>
            </form>
          </Panel>
        )}
      </div>
    </div>
  );
}
