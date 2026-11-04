import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Empty, Metric, PageHeader, Panel } from "@/components/common/Page";
import { StatusBadge } from "@/components/common/StatusBadge";
import { api, errMsg } from "@/lib/api";
import { dt, rupiah } from "@/lib/format";
import { btnDanger, btnPrimary, inputCls, useCan, useGet } from "@/lib/hooks";

export const SandboxNote = () => (
  <div data-testid="finance-sandbox-note" className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
    <strong>SANDBOX · simulasi model managed.</strong> Angka di bawah berasal dari ledger sandbox Qrisgg, bukan dana nyata. Pada model QRIS langsung ke merchant, dana masuk ke rekening Mandiri Anda dan Qrisgg tidak menahan saldo.
  </div>
);

export const JournalTable = ({ journals }) => (
  <div className="overflow-x-auto"><table className="tbl" data-testid="journal-table">
    <thead><tr><th>Jurnal</th><th>Referensi</th><th>Baris (akun · debit · kredit)</th><th>Waktu</th></tr></thead>
    <tbody>{journals.map((j) => (
      <tr key={j.id}><td className="font-mono text-xs">{j.id}</td><td className="text-xs">{j.reference_type}<br /><span className="font-mono">{j.reference_id}</span></td>
        <td className="font-mono text-[11px]">{j.lines.map((l) => <div key={l.account + l.debit + l.credit}>{l.account} · {l.debit ? rupiah(l.debit) : "-"} · {l.credit ? rupiah(l.credit) : "-"}</div>)}</td>
        <td className="text-xs">{dt(j.created_at)}</td></tr>
    ))}</tbody></table></div>
);

export function BalancePage() {
  const { data } = useGet("merchant-balance", "/merchant/balance", { refetchInterval: 15000 });
  if (!data) return <p className="text-sm text-slate-500">Memuat…</p>;
  return (
    <div data-testid="balance-page">
      <PageHeader title="Saldo (Sandbox)" description="Saldo dihitung dari jurnal double-entry yang tidak dapat diubah, bukan dari field yang diedit." />
      <SandboxNote />
      <div className="grid gap-4 sm:grid-cols-3">
        <Metric testid="balance-pending" label="Ditahan (hold)" value={rupiah(data.balances.pending)} />
        <Metric testid="balance-available" label="Tersedia" value={rupiah(data.balances.available)} />
        <Metric testid="balance-reserved" label="Dalam proses penarikan" value={rupiah(data.balances.payout_reserved)} />
      </div>
      <Panel title="Hold aktif" className="mt-6" testid="holds-panel">
        {!data.holds.length ? <Empty text="Tidak ada hold aktif." /> : data.holds.map((h) => (
          <div key={h.id} className="flex items-center justify-between border-b border-slate-100 px-5 py-3 text-sm last:border-0 dark:border-slate-800">
            <span className="font-mono text-xs">{h.invoice_id}</span><span className="font-semibold">{rupiah(h.amount)}</span><span className="text-xs">Rilis paling cepat {dt(h.hold_release_at)}</span><StatusBadge status={h.status} />
          </div>
        ))}
      </Panel>
      <Panel title="Jurnal ledger" className="mt-6" testid="merchant-journals-panel">{!data.journals.length ? <Empty text="Belum ada jurnal." /> : <JournalTable journals={data.journals} />}</Panel>
    </div>
  );
}

export function SettlementsPage() {
  const { data } = useGet("merchant-settlements", "/merchant/settlements");
  return (
    <div data-testid="settlements-page">
      <PageHeader title="Settlement (Sandbox)" description="Settlement dibuat setelah invoice PAID_VERIFIED dan harus dikonfirmasi admin sebelum hold berjalan." />
      <SandboxNote />
      <Panel testid="settlements-table-panel">
        {!data ? <Empty text="Memuat…" /> : !data.length ? <Empty text="Belum ada settlement." /> : (
          <table className="tbl"><thead><tr><th>Settlement</th><th>Invoice</th><th>Nominal</th><th>Status</th><th>Rilis hold</th><th>Dibuat</th></tr></thead>
            <tbody>{data.map((s) => <tr key={s.id}><td className="font-mono text-xs">{s.id}</td><td className="font-mono text-xs">{s.invoice_id}</td><td className="font-semibold">{rupiah(s.amount)}</td>
              <td><StatusBadge status={s.status} /></td><td className="text-xs">{dt(s.hold_release_at)}</td><td className="text-xs">{dt(s.created_at)}</td></tr>)}</tbody></table>
        )}
      </Panel>
    </div>
  );
}

function BankAccounts({ banks, onChange }) {
  const [f, setF] = useState({ bank_name: "", account_holder: "", account_number: "" });
  const add = async (e) => {
    e.preventDefault();
    try {
      await api.post("/merchant/bank-accounts", f);
      toast.success("Rekening ditambahkan, menunggu verifikasi admin");
      setF({ bank_name: "", account_holder: "", account_number: "" });
      onChange();
    } catch (err) {
      toast.error(errMsg(err));
    }
  };
  return (
    <Panel title="Rekening tujuan" testid="bank-accounts-panel">
      {banks.map((b) => (
        <div key={b.id} className="flex items-center justify-between border-b border-slate-100 px-5 py-3 text-sm dark:border-slate-800">
          <span>{b.bank_name} · {b.account_holder} · {b.account_number_masked}</span><StatusBadge status={b.status === "VERIFIED" ? "ACTIVE" : b.status === "REJECTED" ? "REJECTED" : "PENDING_REVIEW"} />
        </div>
      ))}
      <form onSubmit={add} className="grid gap-2 p-5 sm:grid-cols-4">
        <input data-testid="bank-name-input" required placeholder="Bank" value={f.bank_name} onChange={(e) => setF({ ...f, bank_name: e.target.value })} className={inputCls} />
        <input data-testid="bank-holder-input" required placeholder="Nama pemilik" value={f.account_holder} onChange={(e) => setF({ ...f, account_holder: e.target.value })} className={inputCls} />
        <input data-testid="bank-number-input" required pattern="\d{6,20}" placeholder="No. rekening" value={f.account_number} onChange={(e) => setF({ ...f, account_number: e.target.value })} className={inputCls} />
        <button data-testid="bank-add-btn" className={btnPrimary}>Tambah</button>
      </form>
    </Panel>
  );
}

export function WithdrawalsPage() {
  const can = useCan();
  const qc = useQueryClient();
  const { data } = useGet("merchant-withdrawals", "/merchant/withdrawals", { refetchInterval: 10000 });
  const { data: banks = [] } = useGet("bank-accounts", "/merchant/bank-accounts", { enabled: can("settings:manage") });
  const [f, setF] = useState({ amount: "", bank_account_id: "" });
  const refresh = () => ["merchant-withdrawals", "bank-accounts", "merchant-balance"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
  const verified = banks.filter((b) => b.status === "VERIFIED");
  const submit = async (e) => {
    e.preventDefault();
    try {
      await api.post("/merchant/withdrawals", { amount: parseInt(f.amount, 10), bank_account_id: f.bank_account_id }, { headers: { "Idempotency-Key": crypto.randomUUID() } });
      toast.success("Permintaan penarikan dibuat, menunggu persetujuan admin");
      setF({ ...f, amount: "" });
      refresh();
    } catch (err) {
      toast.error(errMsg(err));
    }
  };
  const auto = data?.auto_withdraw || { enabled: false };
  const toggleAuto = async () => {
    try {
      await api.put("/merchant/withdrawals/auto", { enabled: !auto.enabled, bank_account_id: auto.bank_account_id || verified[0]?.id || null, min_amount: 10000 });
      toast.success(auto.enabled ? "Penarikan otomatis dimatikan" : "Penarikan otomatis harian aktif");
      refresh();
    } catch (err) {
      toast.error(errMsg(err));
    }
  };
  return (
    <div data-testid="withdrawals-page">
      <PageHeader title="Penarikan (Sandbox)" description="Semua payout dijalankan oleh simulator. Tidak ada dana nyata yang dipindahkan." />
      <SandboxNote />
      {can("settings:manage") && (
        <div className="mb-6 grid gap-6 xl:grid-cols-2">
          <BankAccounts banks={banks} onChange={refresh} />
          <Panel title="Ajukan penarikan" testid="withdraw-form-panel">
            <form onSubmit={submit} className="space-y-3 p-5">
              <input data-testid="withdraw-amount-input" type="number" required min={1} placeholder="Nominal (Rp)" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} className={inputCls} />
              <select data-testid="withdraw-bank-select" required value={f.bank_account_id} onChange={(e) => setF({ ...f, bank_account_id: e.target.value })} className={inputCls}>
                <option value="">Pilih rekening terverifikasi</option>{verified.map((b) => <option key={b.id} value={b.id}>{b.bank_name} {b.account_number_masked}</option>)}
              </select>
              <button data-testid="withdraw-submit-btn" className={`${btnPrimary} w-full`}>Ajukan</button>
              <button type="button" onClick={toggleAuto} data-testid="auto-withdraw-toggle" className={auto.enabled ? `${btnDanger} w-full` : "w-full text-sm font-semibold text-[#2563EB]"}>
                {auto.enabled ? "Matikan penarikan otomatis harian" : "Aktifkan penarikan otomatis harian"}
              </button>
            </form>
          </Panel>
        </div>
      )}
      <Panel title="Riwayat penarikan" testid="withdrawals-table-panel">
        {!data ? <Empty text="Memuat…" /> : !data.items.length ? <Empty text="Belum ada penarikan." /> : (
          <table className="tbl"><thead><tr><th>ID</th><th>Nominal</th><th>Rekening</th><th>Sumber</th><th>Percobaan</th><th>Status</th><th>Waktu</th></tr></thead>
            <tbody>{data.items.map((w) => <tr key={w.id} data-testid={`withdrawal-row-${w.id}`}><td className="font-mono text-xs">{w.id}</td><td className="font-semibold">{rupiah(w.amount)}</td>
              <td className="text-xs">{w.bank_snapshot.bank_name} {w.bank_snapshot.account_number_masked}</td><td className="text-xs">{w.source}</td><td>{w.attempts}</td>
              <td><StatusBadge status={w.status} /></td><td className="text-xs">{dt(w.created_at)}</td></tr>)}</tbody></table>
        )}
      </Panel>
    </div>
  );
}
