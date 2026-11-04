import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";
import { Empty, Metric, PageHeader, Panel } from "@/components/common/Page";
import { StatusBadge } from "@/components/common/StatusBadge";
import { useAuth } from "@/context/AuthContext";
import { api, errMsg } from "@/lib/api";
import { dt, rupiah, ROLE_LABEL } from "@/lib/format";
import { btnDanger, btnGhost, btnPrimary, inputCls, useGet } from "@/lib/hooks";
import { EventsTable, InvoiceSummary, Timeline } from "@/pages/merchant/InvoiceDetail";

const useAct = (keys) => {
  const qc = useQueryClient();
  return async (fn, ok) => {
    try {
      const r = await fn();
      if (ok) toast.success(typeof ok === "function" ? ok(r.data) : ok);
      keys.forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      return r;
    } catch (e) {
      toast.error(errMsg(e));
      return null;
    }
  };
};

const Table = ({ cols, rows, empty = "Tidak ada data.", testid }) => (
  <Panel testid={testid}>
    {!rows ? <Empty text="Memuat…" /> : !rows.length ? <Empty text={empty} /> : (
      <div className="overflow-x-auto"><table className="tbl"><thead><tr>{cols.map((c) => <th key={c[0]}>{c[0]}</th>)}</tr></thead>
        <tbody>{rows.map((r) => <tr key={r.id || r.provider}>{cols.map((c) => <td key={c[0]}>{c[1](r)}</td>)}</tr>)}</tbody></table></div>
    )}
  </Panel>
);

const mono = (v) => <span className="font-mono text-xs">{v || "-"}</span>;

export function AdminOverview() {
  const { data } = useGet("admin-overview", "/admin/overview");
  if (!data) return <p className="text-sm text-slate-500">Memuat…</p>;
  const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);
  return (
    <div data-testid="admin-overview-page">
      <PageHeader title="Ringkasan Platform" description="Semua angka diambil langsung dari database." />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric testid="admin-metric-users" label="Pengguna" value={data.users} />
        <Metric testid="admin-metric-merchants" label="Merchant" value={sum(data.merchants)} hint={`${data.merchants.PENDING_REVIEW || 0} menunggu review`} />
        <Metric testid="admin-metric-invoices" label="Invoice" value={sum(data.invoices)} hint={`${data.invoices.PAID_VERIFIED || 0} terverifikasi`} />
        <Metric testid="admin-metric-review" label="Antrian verifikasi" value={data.review_queue} hint={`${data.unmatched_events} event tidak cocok`} />
        <Metric testid="admin-metric-qris" label="QRIS menunggu review" value={data.pending_qris} />
        <Metric testid="admin-metric-tickets" label="Tiket terbuka" value={data.open_tickets} />
        <Metric testid="admin-metric-deadletter" label="Webhook dead-letter" value={data.dead_letter_webhooks} />
      </div>
      <Panel title="Audit terbaru" className="mt-6" testid="admin-recent-audit">
        {data.recent_audit.map((a) => <div key={a.id} className="flex justify-between border-b border-slate-100 px-5 py-2.5 text-sm last:border-0 dark:border-slate-800"><span className="font-mono text-xs">{a.action}</span><span className="text-xs text-slate-500">{dt(a.created_at)}</span></div>)}
      </Panel>
    </div>
  );
}

export function AdminMerchants() {
  const act = useAct(["admin-merchants"]);
  const { data } = useGet("admin-merchants", "/admin/merchants");
  const suspend = (id) => {
    const reason = window.prompt("Alasan penangguhan");
    if (reason) act(() => api.post(`/admin/merchants/${id}/suspend`, { reason }), "Merchant ditangguhkan");
  };
  return (
    <div data-testid="admin-merchants-page">
      <PageHeader title="Merchant" description="Persetujuan dan penangguhan merchant tercatat di audit log." />
      <Table testid="admin-merchants-table" rows={data?.items} cols={[
        ["Merchant", (r) => <div><p className="font-semibold">{r.name}</p>{mono(r.id)}</div>], ["Pemilik", (r) => r.owner?.email],
        ["Invoice", (r) => r.invoice_count], ["Status", (r) => <StatusBadge status={r.status} />], ["Dibuat", (r) => dt(r.created_at)],
        ["Aksi", (r) => <div className="flex gap-2">
          {r.status !== "ACTIVE" && <button type="button" onClick={() => act(() => api.post(`/admin/merchants/${r.id}/approve`), "Merchant disetujui")} data-testid={`approve-merchant-${r.id}`} className={btnPrimary}>Setujui</button>}
          {r.status !== "SUSPENDED" && <button type="button" onClick={() => suspend(r.id)} data-testid={`suspend-merchant-${r.id}`} className={btnDanger}>Tangguhkan</button>}
        </div>],
      ]} />
    </div>
  );
}

export function AdminUsers() {
  const { user: me } = useAuth();
  const act = useAct(["admin-users"]);
  const { data } = useGet("admin-users", "/admin/users");
  return (
    <div data-testid="admin-users-page">
      <PageHeader title="Pengguna" />
      <Table testid="admin-users-table" rows={data?.items} cols={[
        ["Nama", (r) => <div><p className="font-semibold">{r.name}</p><p className="text-xs text-slate-500">{r.email}</p></div>],
        ["Peran platform", (r) => ROLE_LABEL[r.platform_role] || "-"], ["Email", (r) => (r.email_verified ? "Terverifikasi" : "Belum")],
        ["2FA", (r) => (r.mfa_enabled ? "Aktif" : "-")], ["Status", (r) => <StatusBadge status={r.status} />],
        ["Aksi", (r) => r.id !== me.id && r.platform_role !== "SUPER_ADMIN" && (
          <button type="button" data-testid={`toggle-user-${r.id}`} onClick={() => act(() => api.patch(`/admin/users/${r.id}`, { status: r.status === "ACTIVE" ? "DISABLED" : "ACTIVE" }), "Pengguna diperbarui")} className={r.status === "ACTIVE" ? btnDanger : btnGhost}>
            {r.status === "ACTIVE" ? "Nonaktifkan" : "Aktifkan"}</button>)],
      ]} />
    </div>
  );
}

export function AdminInvoices({ title = "Invoice" }) {
  const [status, setStatus] = useState("");
  const { data } = useGet(["admin-invoices", status], "/admin/invoices", { params: { status: status || undefined } });
  return (
    <div data-testid="admin-invoices-page">
      <PageHeader title={title} actions={
        <select data-testid="admin-invoice-status-filter" value={status} onChange={(e) => setStatus(e.target.value)} className={inputCls}>
          <option value="">Semua status</option>{["PENDING", "AWAITING_VERIFICATION", "REVIEW_REQUIRED", "PAID_VERIFIED", "EXPIRED", "FAILED", "CANCELLED"].map((s) => <option key={s} value={s}>{s}</option>)}
        </select>} />
      <Table testid="admin-invoices-table" rows={data?.items} cols={[
        ["Invoice", (r) => <Link to={`/admin/invoices/${r.id}`} data-testid={`admin-invoice-link-${r.id}`} className="font-mono text-xs font-semibold text-[#2563EB]">{r.id}</Link>],
        ["Merchant", (r) => r.merchant_name], ["Total", (r) => rupiah(r.payable_amount)], ["Diterima", (r) => rupiah(r.paid_amount)],
        ["Status", (r) => <StatusBadge status={r.status} />], ["Dibuat", (r) => dt(r.created_at)],
      ]} />
    </div>
  );
}

export function AdminInvoiceDetail() {
  const { invoiceId } = useParams();
  const act = useAct(["admin-invoice", "admin-invoices", "admin-overview"]);
  const { data: inv, refetch } = useGet(["admin-invoice", invoiceId], `/admin/invoices/${invoiceId}`);
  const [f, setF] = useState({ event_id: "", note: "", totp_code: "" });
  useEffect(() => {
    if (inv?.events?.length && !f.event_id) setF((x) => ({ ...x, event_id: inv.events[inv.events.length - 1].id }));
  }, [inv, f.event_id]);
  if (!inv) return <p className="text-sm text-slate-500">Memuat…</p>;
  const canDecide = ["AWAITING_VERIFICATION", "REVIEW_REQUIRED"].includes(inv.status);
  const go = async (kind) => {
    const body = kind === "verify" ? f : { note: f.note, totp_code: f.totp_code };
    if (await act(() => api.post(`/admin/invoices/${inv.id}/${kind}`, body), kind === "verify" ? "Pembayaran diverifikasi" : "Invoice ditandai gagal")) {
      setF({ ...f, note: "", totp_code: "" });
      refetch();
    }
  };
  return (
    <div data-testid="admin-invoice-detail-page">
      <Link to="/admin/invoices" className="text-sm font-semibold text-[#2563EB]">← Invoice</Link>
      <PageHeader title={<span className="font-mono text-xl">{inv.id}</span>} description={`Merchant ${inv.merchant_id} · akun ${inv.account_key}`} actions={<StatusBadge status={inv.status} testid="admin-invoice-status" />} />
      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Panel title="Ringkasan"><InvoiceSummary inv={inv} /></Panel>
          <Panel title="Event pembayaran"><EventsTable events={inv.events} /></Panel>
          <Panel title="Riwayat transisi"><Timeline transitions={inv.transitions} /></Panel>
        </div>
        <Panel title="Rekonsiliasi terpercaya" testid="admin-reconcile-panel">
          {!canDecide ? <p className="p-5 text-sm text-slate-500">Rekonsiliasi hanya untuk status Menunggu Verifikasi atau Perlu Ditinjau.</p> : (
            <div className="space-y-3 p-5 text-sm">
              <p className="text-slate-600 dark:text-slate-300">Verifikasi hanya jika dana sudah dikonfirmasi dari sumber terpercaya (mis. mutasi rekening resmi). Wajib kode 2FA.</p>
              <select data-testid="reconcile-event-select" value={f.event_id} onChange={(e) => setF({ ...f, event_id: e.target.value })} className={inputCls}>
                {inv.events.map((e) => <option key={e.id} value={e.id}>{e.id} · {rupiah(e.amount)} · {e.match_result}</option>)}
              </select>
              <textarea data-testid="reconcile-note-input" rows={3} placeholder="Bukti / catatan rekonsiliasi (min. 5 karakter)" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} className={inputCls} />
              <input data-testid="reconcile-totp-input" inputMode="numeric" maxLength={6} placeholder="Kode 2FA" value={f.totp_code} onChange={(e) => setF({ ...f, totp_code: e.target.value.replace(/\D/g, "") })} className={`${inputCls} font-mono tracking-widest`} />
              <div className="flex gap-2">
                <button type="button" onClick={() => go("verify")} disabled={!f.event_id} data-testid="reconcile-verify-btn" className={`${btnPrimary} flex-1`}>Verifikasi</button>
                <button type="button" onClick={() => go("fail")} data-testid="reconcile-fail-btn" className={`${btnDanger} flex-1`}>Tandai Gagal</button>
              </div>
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}

export function AdminEvents() {
  const act = useAct(["admin-events"]);
  const { data } = useGet("admin-events", "/admin/payment-events");
  const [f, setF] = useState({ merchant_id: "", amount: "", reference: "" });
  const ingest = (e) => {
    e.preventDefault();
    act(() => api.post("/admin/payment-events/ingest", { ...f, amount: parseInt(f.amount, 10) }), (d) => `Event ${d.status}: ${d.match_result}`);
  };
  return (
    <div data-testid="admin-events-page">
      <PageHeader title="Event Pembayaran" description="Ingest manual sandbox menguji pencocokan berdasarkan nominal unik tanpa menyebut invoice." />
      <form onSubmit={ingest} className="card-q mb-6 grid gap-3 p-5 md:grid-cols-4">
        <input data-testid="ingest-merchant-input" required placeholder="merchant_id (mch_…)" value={f.merchant_id} onChange={(e) => setF({ ...f, merchant_id: e.target.value.trim() })} className={inputCls} />
        <input data-testid="ingest-amount-input" required type="number" placeholder="Nominal diterima" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} className={inputCls} />
        <input data-testid="ingest-reference-input" required minLength={3} placeholder="Referensi unik" value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} className={inputCls} />
        <button data-testid="ingest-submit-btn" className={btnPrimary}>Ingest Event</button>
      </form>
      <Table testid="admin-events-table" rows={data?.items} cols={[
        ["Event", (r) => mono(r.id)], ["Merchant", (r) => mono(r.merchant_id)], ["Invoice", (r) => (r.invoice_id ? <Link to={`/admin/invoices/${r.invoice_id}`} className="font-mono text-xs text-[#2563EB]">{r.invoice_id}</Link> : "-")],
        ["Sumber", (r) => r.source], ["Nominal", (r) => rupiah(r.amount)], ["Hasil", (r) => mono(r.match_result)], ["Status", (r) => <StatusBadge status={r.status} />], ["Waktu", (r) => dt(r.created_at)],
      ]} />
    </div>
  );
}

export function AdminReconciliation() {
  const { data } = useGet("admin-recon", "/admin/reconciliation");
  return (
    <div data-testid="admin-reconciliation-page">
      <PageHeader title="Rekonsiliasi" description="Catatan rekonsiliasi manual admin (sandbox)." />
      <Table testid="admin-recon-table" rows={data} empty="Belum ada rekonsiliasi." cols={[
        ["ID", (r) => mono(r.id)], ["Invoice", (r) => <Link to={`/admin/invoices/${r.invoice_id}`} className="font-mono text-xs text-[#2563EB]">{r.invoice_id}</Link>],
        ["Hasil", (r) => <StatusBadge status={r.result === "VERIFIED" ? "PAID_VERIFIED" : "FAILED"} />], ["Diharapkan", (r) => rupiah(r.amount_expected)], ["Diterima", (r) => rupiah(r.amount_received)],
        ["Catatan", (r) => r.note], ["Waktu", (r) => dt(r.created_at)],
      ]} />
    </div>
  );
}

export function AdminQris() {
  const act = useAct(["admin-qris"]);
  const { data } = useGet("admin-qris", "/admin/qris-accounts");
  return (
    <div data-testid="admin-qris-page">
      <PageHeader title="Akun QRIS" description="Tinjau QRIS statis Mandiri Livin' Usaha yang diajukan merchant." />
      <Table testid="admin-qris-table" rows={data} empty="Belum ada pengajuan." cols={[
        ["Label", (r) => r.label], ["Merchant", (r) => mono(r.merchant_id)], ["Nama di QRIS", (r) => r.qris_merchant_name || "-"], ["Payload", (r) => (r.payload_validated ? "CRC valid" : "-")],
        ["Status", (r) => <StatusBadge status={r.status} />],
        ["Aksi", (r) => r.status === "PENDING_REVIEW" && <div className="flex gap-2">
          <button type="button" onClick={() => act(() => api.post(`/admin/qris-accounts/${r.id}/approve`), "Disetujui")} data-testid={`approve-qris-${r.id}`} className={btnPrimary}>Setujui</button>
          <button type="button" onClick={() => act(() => api.post(`/admin/qris-accounts/${r.id}/reject`), "Ditolak")} data-testid={`reject-qris-${r.id}`} className={btnDanger}>Tolak</button></div>],
      ]} />
    </div>
  );
}

export function AdminProviders() {
  const { data } = useGet("admin-providers", "/admin/providers");
  return (
    <div data-testid="admin-providers-page">
      <PageHeader title="Payment Provider" description="Fase 1: hanya Bank Mandiri — Livin' Usaha. Adapter resmi nonaktif sampai ada dokumentasi, kredensial, dan otorisasi." />
      <div className="grid gap-4 md:grid-cols-2">{(data || []).map((p) => (
        <div key={p.provider} data-testid={`provider-${p.provider}`} className="card-q p-6 text-sm">
          <div className="flex items-center justify-between"><span className="font-mono font-bold">{p.provider}</span><StatusBadge status={p.enabled ? "ACTIVE" : "DISABLED"} /></div>
          <pre className="mt-4 overflow-x-auto rounded-lg bg-slate-50 p-3 font-mono text-xs dark:bg-black/30">{JSON.stringify(p, null, 2)}</pre>
        </div>
      ))}</div>
    </div>
  );
}

const EMPTY_PLAN = { name: "", description: "", price_label: "Hubungi Kami", features: "", highlighted: false, active: true, sort: 0 };

export function AdminPlans() {
  const act = useAct(["admin-plans", "public-plans"]);
  const { data } = useGet("admin-plans", "/admin/plans");
  const [f, setF] = useState(EMPTY_PLAN);
  const [editId, setEditId] = useState(null);
  const save = async (e) => {
    e.preventDefault();
    const body = { ...f, sort: Number(f.sort), features: f.features.split("\n").map((s) => s.trim()).filter(Boolean) };
    if (await act(() => (editId ? api.put(`/admin/plans/${editId}`, body) : api.post("/admin/plans", body)), "Paket disimpan")) { setF(EMPTY_PLAN); setEditId(null); }
  };
  return (
    <div data-testid="admin-plans-page">
      <PageHeader title="Paket Harga" description="Ditampilkan di halaman publik. Jangan mencantumkan MDR atau biaya bank yang belum resmi." />
      <div className="grid gap-6 xl:grid-cols-2">
        <Table testid="admin-plans-table" rows={data} cols={[["Nama", (r) => r.name], ["Harga", (r) => r.price_label], ["Aktif", (r) => (r.active ? "Ya" : "Tidak")],
          ["Aksi", (r) => <div className="flex gap-2"><button type="button" data-testid={`edit-plan-${r.id}`} onClick={() => { setEditId(r.id); setF({ ...r, features: r.features.join("\n") }); }} className={btnGhost}>Ubah</button>
            <button type="button" data-testid={`delete-plan-${r.id}`} onClick={() => act(() => api.delete(`/admin/plans/${r.id}`), "Paket dihapus")} className={btnDanger}>Hapus</button></div>]]} />
        <form onSubmit={save} className="card-q space-y-3 p-5" data-testid="plan-form">
          <input data-testid="plan-name-input" required placeholder="Nama" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className={inputCls} />
          <input data-testid="plan-desc-input" placeholder="Deskripsi" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} className={inputCls} />
          <input data-testid="plan-price-input" required placeholder="Label harga" value={f.price_label} onChange={(e) => setF({ ...f, price_label: e.target.value })} className={inputCls} />
          <textarea data-testid="plan-features-input" rows={4} placeholder="Fitur (satu per baris)" value={f.features} onChange={(e) => setF({ ...f, features: e.target.value })} className={inputCls} />
          <div className="flex gap-4 text-sm">
            <label className="flex items-center gap-2"><input type="checkbox" checked={f.highlighted} onChange={(e) => setF({ ...f, highlighted: e.target.checked })} data-testid="plan-highlight-checkbox" />Sorot</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} data-testid="plan-active-checkbox" />Aktif</label>
            <input type="number" value={f.sort} onChange={(e) => setF({ ...f, sort: e.target.value })} className={`${inputCls} w-24`} data-testid="plan-sort-input" />
          </div>
          <button data-testid="plan-save-btn" className={btnPrimary}>{editId ? "Simpan Perubahan" : "Tambah Paket"}</button>
        </form>
      </div>
    </div>
  );
}

export function AdminAudit() {
  const [action, setAction] = useState("");
  const { data } = useGet(["admin-audit", action], "/admin/audit-logs", { params: { action: action || undefined } });
  return (
    <div data-testid="admin-audit-page">
      <PageHeader title="Audit Log" actions={<input data-testid="audit-filter-input" placeholder="Filter aksi, mis. invoice" value={action} onChange={(e) => setAction(e.target.value.trim())} className={inputCls} />} />
      <Table testid="admin-audit-table" rows={data?.items} cols={[["Waktu", (r) => dt(r.created_at)], ["Aksi", (r) => mono(r.action)], ["Aktor", (r) => mono(`${r.actor_type}:${r.actor_id || "-"}`)],
        ["Target", (r) => mono(r.target_id)], ["Merchant", (r) => mono(r.merchant_id)], ["IP", (r) => mono(r.ip)], ["Metadata", (r) => <span className="font-mono text-[11px]">{JSON.stringify(r.metadata)}</span>]]} />
    </div>
  );
}

const SETTING_LABELS = { unique_code_min: "Kode unik minimum", unique_code_max: "Kode unik maksimum", reuse_cooldown_minutes: "Jeda pemakaian ulang nominal (menit)",
  default_expiry_seconds: "Masa berlaku invoice default (detik)", min_amount: "Nominal minimum (Rp)", max_amount: "Nominal maksimum (Rp)", hold_hours: "Hold dana (jam) — belum dipakai, ledger NOT IMPLEMENTED" };

export function AdminSettings() {
  const { user } = useAuth();
  const act = useAct(["admin-settings"]);
  const { data } = useGet("admin-settings", "/admin/settings");
  const [vals, setVals] = useState(null);
  useEffect(() => { if (data) setVals(data.values); }, [data]);
  if (!vals) return <p className="text-sm text-slate-500">Memuat…</p>;
  const isSuper = user.platform_role === "SUPER_ADMIN";
  return (
    <div data-testid="admin-settings-page">
      <PageHeader title="Pengaturan Sistem" description={`Transaksi multi-dokumen MongoDB: ${data.transactions_supported ? "didukung" : "TIDAK didukung di lingkungan ini (perlu replica set)"}. Hanya SUPER_ADMIN yang dapat mengubah.`} />
      <form onSubmit={(e) => { e.preventDefault(); act(() => api.patch("/admin/settings", Object.fromEntries(Object.entries(vals).map(([k, v]) => [k, parseInt(v, 10)]))), "Pengaturan disimpan"); }} className="card-q grid gap-4 p-6 md:grid-cols-2">
        {Object.keys(SETTING_LABELS).map((k) => (
          <label key={k} className="text-sm font-medium">{SETTING_LABELS[k]}
            <input type="number" disabled={!isSuper} data-testid={`setting-${k}-input`} value={vals[k]} onChange={(e) => setVals({ ...vals, [k]: e.target.value })} className={`${inputCls} mt-1`} /></label>
        ))}
        {isSuper && <button data-testid="settings-save-btn" className={`${btnPrimary} md:col-span-2`}>Simpan</button>}
      </form>
    </div>
  );
}

export function AdminSupport() {
  const act = useAct(["admin-support"]);
  const { data } = useGet("admin-support", "/admin/support");
  return (
    <div data-testid="admin-support-page">
      <PageHeader title="Dukungan" />
      <Table testid="admin-support-table" rows={data} empty="Belum ada tiket." cols={[["Subjek", (r) => <div><p className="font-semibold">{r.subject}</p><p className="max-w-md truncate text-xs text-slate-500">{r.message}</p></div>],
        ["Sumber", (r) => r.source], ["Kontak", (r) => r.contact_email || mono(r.merchant_id)], ["Waktu", (r) => dt(r.created_at)],
        ["Status", (r) => <select data-testid={`ticket-status-${r.id}`} value={r.status} onChange={(e) => act(() => api.patch(`/admin/support/${r.id}`, { status: e.target.value }), "Status tiket diperbarui")} className={`${inputCls} py-1.5`}>
          {["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"].map((s) => <option key={s}>{s}</option>)}</select>]]} />
    </div>
  );
}
