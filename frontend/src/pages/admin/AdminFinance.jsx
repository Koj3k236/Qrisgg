import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Empty, PageHeader, Panel } from "@/components/common/Page";
import { StatusBadge } from "@/components/common/StatusBadge";
import { api, errMsg } from "@/lib/api";
import { dt, rupiah } from "@/lib/format";
import { btnDanger, btnGhost, btnPrimary, useGet } from "@/lib/hooks";
import { JournalTable, SandboxNote } from "@/pages/merchant/Finance";

const useDecide = (keys) => {
  const qc = useQueryClient();
  return async (url, label) => {
    const note = window.prompt(`${label} — catatan / bukti`);
    if (!note) return;
    const totp_code = window.prompt("Kode 2FA (otorisasi tambahan)");
    if (!totp_code) return;
    try {
      await api.post(url, { note, totp_code });
      toast.success(`${label} berhasil`);
      keys.forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
    } catch (e) {
      toast.error(errMsg(e));
    }
  };
};

export function AdminLedger() {
  const { data } = useGet("admin-ledger", "/admin/ledger");
  if (!data) return <p className="text-sm text-slate-500">Memuat…</p>;
  const inv = data.invariants;
  return (
    <div data-testid="admin-ledger-page">
      <PageHeader title="Ledger (Sandbox)" description="Jurnal double-entry immutable. Tidak ada endpoint untuk mengedit saldo." />
      <SandboxNote />
      <Panel title="Pemeriksaan invarian" className="mb-6" testid="ledger-invariants">
        <div className="grid gap-3 p-5 text-sm sm:grid-cols-4">
          <div>Status: <strong data-testid="ledger-invariants-ok" className={inv.ok ? "text-emerald-600" : "text-red-600"}>{inv.ok ? "LULUS" : "GAGAL"}</strong></div>
          <div>Jurnal: <strong>{inv.journals}</strong></div>
          <div>Total debit: <strong>{rupiah(inv.total_debit)}</strong></div>
          <div>Total kredit: <strong>{rupiah(inv.total_credit)}</strong></div>
          <div>Jurnal tidak seimbang: <strong>{inv.unbalanced_journals.length}</strong></div>
          <div>Akun merchant negatif: <strong>{inv.negative_merchant_accounts.length}</strong></div>
          <div>Kredit ganda settlement: <strong>{inv.double_credits.length}</strong></div>
        </div>
      </Panel>
      <Panel title="Jurnal terbaru" testid="admin-journals-panel">{!data.journals.length ? <Empty text="Belum ada jurnal." /> : <JournalTable journals={data.journals} />}</Panel>
    </div>
  );
}

export function AdminSettlements() {
  const decide = useDecide(["admin-settlements", "admin-ledger"]);
  const { data } = useGet("admin-settlements", "/admin/settlements");
  return (
    <div data-testid="admin-settlements-page">
      <PageHeader title="Settlement (Sandbox)" description="Konfirmasi hanya jika dana benar-benar diterima dari sumber terpercaya. Hold berjalan setelah konfirmasi." />
      <SandboxNote />
      <Panel testid="admin-settlements-table">
        {!data ? <Empty text="Memuat…" /> : !data.length ? <Empty text="Belum ada settlement." /> : (
          <table className="tbl"><thead><tr><th>Settlement</th><th>Merchant</th><th>Invoice</th><th>Nominal</th><th>Status</th><th>Rilis hold</th><th>Aksi</th></tr></thead>
            <tbody>{data.map((s) => (
              <tr key={s.id}><td className="font-mono text-xs">{s.id}</td><td className="font-mono text-xs">{s.merchant_id}</td><td className="font-mono text-xs">{s.invoice_id}</td>
                <td className="font-semibold">{rupiah(s.amount)}</td><td><StatusBadge status={s.status} /></td><td className="text-xs">{dt(s.hold_release_at)}</td>
                <td className="whitespace-nowrap">
                  {s.status === "PENDING_CONFIRMATION" && <div className="flex gap-2">
                    <button type="button" data-testid={`confirm-settlement-${s.id}`} onClick={() => decide(`/admin/settlements/${s.id}/confirm`, "Konfirmasi settlement")} className={btnPrimary}>Konfirmasi</button>
                    <button type="button" data-testid={`fail-settlement-${s.id}`} onClick={() => decide(`/admin/settlements/${s.id}/fail`, "Tandai gagal")} className={btnDanger}>Gagal</button></div>}
                  {s.status === "REVIEW_REQUIRED" && <button type="button" data-testid={`release-settlement-${s.id}`} onClick={() => decide(`/admin/settlements/${s.id}/release`, "Rilis setelah review")} className={btnGhost}>Rilis</button>}
                </td></tr>
            ))}</tbody></table>
        )}
      </Panel>
    </div>
  );
}

export function AdminWithdrawals() {
  const qc = useQueryClient();
  const decide = useDecide(["admin-withdrawals", "admin-ledger"]);
  const { data } = useGet("admin-withdrawals", "/admin/withdrawals", { refetchInterval: 10000 });
  const { data: banks = [] } = useGet("admin-banks", "/admin/bank-accounts");
  const bankAction = async (id, action) => {
    try {
      await api.post(`/admin/bank-accounts/${id}/${action}`);
      toast.success("Rekening diperbarui");
      qc.invalidateQueries({ queryKey: ["admin-banks"] });
    } catch (e) {
      toast.error(errMsg(e));
    }
  };
  return (
    <div data-testid="admin-withdrawals-page">
      <PageHeader title="Penarikan (Sandbox)" description="Persetujuan wajib 2FA. Payout dijalankan simulator; rekening berakhiran 0000 mensimulasikan penolakan bank." />
      <SandboxNote />
      <Panel title="Verifikasi rekening" className="mb-6" testid="admin-banks-panel">
        {!banks.length ? <Empty text="Belum ada rekening." /> : banks.map((b) => (
          <div key={b.id} className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-3 text-sm last:border-0 dark:border-slate-800">
            <span>{b.bank_name} · {b.account_holder} · {b.account_number_masked} · <span className="font-mono text-xs">{b.merchant_id}</span></span>
            {b.status === "PENDING_VERIFICATION" ? <div className="flex gap-2">
              <button type="button" data-testid={`verify-bank-${b.id}`} onClick={() => bankAction(b.id, "verify")} className={btnPrimary}>Verifikasi</button>
              <button type="button" data-testid={`reject-bank-${b.id}`} onClick={() => bankAction(b.id, "reject")} className={btnDanger}>Tolak</button></div> : <span className="text-xs font-semibold">{b.status}</span>}
          </div>
        ))}
      </Panel>
      <Panel title="Permintaan penarikan" testid="admin-withdrawals-table">
        {!data ? <Empty text="Memuat…" /> : !data.length ? <Empty text="Belum ada penarikan." /> : (
          <table className="tbl"><thead><tr><th>ID</th><th>Merchant</th><th>Nominal</th><th>Sumber</th><th>Percobaan</th><th>Status</th><th>Aksi</th></tr></thead>
            <tbody>{data.map((w) => (
              <tr key={w.id}><td className="font-mono text-xs">{w.id}</td><td className="font-mono text-xs">{w.merchant_id}</td><td className="font-semibold">{rupiah(w.amount)}</td>
                <td className="text-xs">{w.source}</td><td>{w.attempts}</td><td><StatusBadge status={w.status} /></td>
                <td>{w.status === "REQUESTED" && <div className="flex gap-2">
                  <button type="button" data-testid={`approve-withdrawal-${w.id}`} onClick={() => decide(`/admin/withdrawals/${w.id}/approve`, "Setujui penarikan")} className={btnPrimary}>Setujui</button>
                  <button type="button" data-testid={`reject-withdrawal-${w.id}`} onClick={() => decide(`/admin/withdrawals/${w.id}/reject`, "Tolak penarikan")} className={btnDanger}>Tolak</button></div>}</td></tr>
            ))}</tbody></table>
        )}
      </Panel>
    </div>
  );
}
