import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { CodeBlock } from "@/components/common/CodeBlock";
import { Empty, PageHeader, Panel } from "@/components/common/Page";
import { StatusBadge } from "@/components/common/StatusBadge";
import { CREATE_SNIPPET } from "@/components/marketing/DeveloperSection";
import { api, errMsg } from "@/lib/api";
import { dt } from "@/lib/format";
import { btnDanger, btnGhost, btnPrimary, inputCls, useGet } from "@/lib/hooks";

const SCOPES = ["invoices:read", "invoices:write", "webhooks:read"];
const EVENTS = ["payment.detected", "payment.verified", "payment.failed", "payment.expired"];

const SecretOnce = ({ secret, onClose, testid }) => secret ? (
  <div data-testid={testid} className="mb-6 rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-sm dark:border-emerald-500/30 dark:bg-emerald-500/10">
    <p className="font-semibold text-emerald-800 dark:text-emerald-200">Salin sekarang — secret ini hanya ditampilkan sekali.</p>
    <code className="mt-2 block break-all rounded bg-white p-2 font-mono text-xs dark:bg-black/30" data-testid={`${testid}-value`}>{secret}</code>
    <div className="mt-2 flex gap-2">
      <button type="button" onClick={() => { navigator.clipboard.writeText(secret); toast.success("Disalin"); }} className={btnGhost} data-testid={`${testid}-copy`}>Salin</button>
      <button type="button" onClick={onClose} className={btnGhost} data-testid={`${testid}-close`}>Tutup</button>
    </div>
  </div>
) : null;

export function DevelopersHome() {
  const base = `${process.env.REACT_APP_BACKEND_URL}/api/v1`;
  return (
    <div data-testid="developers-home-page">
      <PageHeader title="Ikhtisar API" description={`Base URL sandbox: ${base}`} />
      <div className="grid gap-6 xl:grid-cols-2">
        <CodeBlock title="Contoh membuat invoice (ganti host dengan base URL di atas)" code={CREATE_SNIPPET} testid="dev-home-snippet" />
        <Panel title="Langkah integrasi">
          <ol className="list-decimal space-y-2 p-5 pl-10 text-sm">
            <li>Buat API key di <Link to="/dashboard/api-keys" className="text-[#2563EB]">API Keys</Link> dengan scope yang diperlukan.</li>
            <li>Kirim <code>POST /v1/invoices</code> dengan header <code>Idempotency-Key</code>.</li>
            <li>Arahkan pelanggan ke <code>/pay/:invoiceId</code>.</li>
            <li>Daftarkan endpoint di <Link to="/dashboard/webhooks" className="text-[#2563EB]">Webhooks</Link> dan verifikasi tanda tangan HMAC.</li>
            <li>Lihat referensi lengkap di <a href={`${process.env.REACT_APP_BACKEND_URL}/api/docs`} target="_blank" rel="noreferrer" className="text-[#2563EB]">Swagger</a>.</li>
          </ol>
        </Panel>
      </div>
    </div>
  );
}

export function ApiKeysPage() {
  const qc = useQueryClient();
  const { data = [], isLoading } = useGet("api-keys", "/merchant/api-keys");
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState(["invoices:read", "invoices:write"]);
  const [secret, setSecret] = useState("");
  const call = async (fn) => {
    try {
      const r = await fn();
      if (r?.data?.secret) setSecret(r.data.secret);
      qc.invalidateQueries({ queryKey: ["api-keys"] });
    } catch (e) {
      toast.error(errMsg(e));
    }
  };
  const create = (e) => {
    e.preventDefault();
    call(() => api.post("/merchant/api-keys", { name, scopes })).then(() => setName(""));
  };
  return (
    <div data-testid="api-keys-page">
      <PageHeader title="API Keys" description="Key disimpan sebagai hash SHA-256. Rotasi membuat key baru dan mencabut key lama." />
      <SecretOnce secret={secret} onClose={() => setSecret("")} testid="api-key-secret" />
      <form onSubmit={create} className="card-q mb-6 flex flex-col gap-3 p-5 lg:flex-row lg:items-center">
        <input data-testid="api-key-name-input" required minLength={2} placeholder="Nama key, mis. Server Toko" value={name} onChange={(e) => setName(e.target.value)} className={`${inputCls} lg:max-w-xs`} />
        <div className="flex flex-wrap gap-3 text-sm">{SCOPES.map((s) => (
          <label key={s} className="flex items-center gap-1.5 font-mono text-xs">
            <input type="checkbox" data-testid={`api-key-scope-${s.replace(":", "-")}`} checked={scopes.includes(s)} onChange={(e) => setScopes(e.target.checked ? [...scopes, s] : scopes.filter((x) => x !== s))} />{s}
          </label>
        ))}</div>
        <button disabled={!scopes.length} data-testid="api-key-create-btn" className={`${btnPrimary} lg:ml-auto`}>Buat API Key</button>
      </form>
      <Panel testid="api-keys-table-panel">
        {isLoading ? <Empty text="Memuat…" /> : !data.length ? <Empty text="Belum ada API key." /> : (
          <div className="overflow-x-auto"><table className="tbl"><thead><tr><th>Nama</th><th>Prefix</th><th>Scope</th><th>Terakhir dipakai</th><th>Status</th><th /></tr></thead>
            <tbody>{data.map((k) => (
              <tr key={k.id} data-testid={`api-key-row-${k.id}`}><td className="font-semibold">{k.name}</td><td className="font-mono text-xs">{k.prefix}…</td>
                <td className="font-mono text-xs">{k.scopes.join(", ")}</td><td className="text-xs">{dt(k.last_used_at)}</td>
                <td>{k.revoked_at ? <StatusBadge status="DISABLED" /> : <StatusBadge status="ACTIVE" />}</td>
                <td className="whitespace-nowrap">{!k.revoked_at && <div className="flex gap-2">
                  <button type="button" onClick={() => call(() => api.post(`/merchant/api-keys/${k.id}/rotate`))} data-testid={`api-key-rotate-${k.id}`} className={btnGhost}>Rotasi</button>
                  <button type="button" onClick={() => call(() => api.delete(`/merchant/api-keys/${k.id}`))} data-testid={`api-key-revoke-${k.id}`} className={btnDanger}>Cabut</button>
                </div>}</td></tr>
            ))}</tbody></table></div>
        )}
      </Panel>
    </div>
  );
}

export function WebhooksPage() {
  const qc = useQueryClient();
  const { data = [] } = useGet("webhooks", "/merchant/webhooks");
  const { data: deliveries = [] } = useGet("webhook-deliveries", "/merchant/webhook-deliveries", { refetchInterval: 10000 });
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState(EVENTS);
  const [secret, setSecret] = useState("");
  const call = async (fn, ok) => {
    try {
      const r = await fn();
      if (r?.data?.secret) setSecret(r.data.secret);
      if (ok) toast.success(ok(r.data));
      qc.invalidateQueries({ queryKey: ["webhooks"] });
      qc.invalidateQueries({ queryKey: ["webhook-deliveries"] });
    } catch (e) {
      toast.error(errMsg(e));
    }
  };
  const create = (e) => {
    e.preventDefault();
    call(() => api.post("/merchant/webhooks", { url, events })).then(() => setUrl(""));
  };
  return (
    <div data-testid="webhooks-page">
      <PageHeader title="Webhooks" description="Ditandatangani HMAC-SHA256 (X-Qrisgg-Signature: t=…,v1=…). Retry eksponensial hingga 6 kali, lalu dead-letter." />
      <SecretOnce secret={secret} onClose={() => setSecret("")} testid="webhook-secret" />
      <form onSubmit={create} className="card-q mb-6 space-y-3 p-5">
        <input data-testid="webhook-url-input" type="url" required placeholder="https://toko-anda.com/webhooks/qrisgg" value={url} onChange={(e) => setUrl(e.target.value)} className={inputCls} />
        <div className="flex flex-wrap gap-4">{EVENTS.map((ev) => (
          <label key={ev} className="flex items-center gap-1.5 font-mono text-xs">
            <input type="checkbox" data-testid={`webhook-event-${ev.replace(".", "-")}`} checked={events.includes(ev)} onChange={(e) => setEvents(e.target.checked ? [...events, ev] : events.filter((x) => x !== ev))} />{ev}
          </label>
        ))}</div>
        <button disabled={!events.length} data-testid="webhook-create-btn" className={btnPrimary}>Tambah Endpoint</button>
      </form>
      <Panel title="Endpoint" testid="webhook-endpoints-panel" className="mb-6">
        {!data.length ? <Empty text="Belum ada endpoint." /> : data.map((w) => (
          <div key={w.id} data-testid={`webhook-row-${w.id}`} className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 last:border-0 dark:border-slate-800 lg:flex-row lg:items-center">
            <div className="min-w-0 flex-1"><p className="truncate font-mono text-sm">{w.url}</p><p className="text-xs text-slate-500">{w.events.join(", ")}</p></div>
            <StatusBadge status={w.enabled ? "ACTIVE" : "DISABLED"} />
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => call(() => api.post(`/merchant/webhooks/${w.id}/test`), (d) => `Tes: ${d.status}${d.last_error ? ` (${d.last_error})` : ""}`)} data-testid={`webhook-test-${w.id}`} className={btnGhost}>Kirim Tes</button>
              <button type="button" onClick={() => call(() => api.patch(`/merchant/webhooks/${w.id}`, { enabled: !w.enabled }))} data-testid={`webhook-toggle-${w.id}`} className={btnGhost}>{w.enabled ? "Nonaktifkan" : "Aktifkan"}</button>
              <button type="button" onClick={() => call(() => api.post(`/merchant/webhooks/${w.id}/rotate-secret`))} data-testid={`webhook-rotate-${w.id}`} className={btnGhost}>Rotasi Secret</button>
              <button type="button" onClick={() => call(() => api.delete(`/merchant/webhooks/${w.id}`))} data-testid={`webhook-delete-${w.id}`} className={btnDanger}>Hapus</button>
            </div>
          </div>
        ))}
      </Panel>
      <Panel title="Riwayat pengiriman" testid="webhook-deliveries-panel">
        {!deliveries.length ? <Empty text="Belum ada pengiriman." /> : (
          <div className="overflow-x-auto"><table className="tbl"><thead><tr><th>Event</th><th>Tipe</th><th>Percobaan</th><th>Kode HTTP</th><th>Error</th><th>Status</th><th>Waktu</th></tr></thead>
            <tbody>{deliveries.map((d) => (
              <tr key={d.id}><td className="font-mono text-xs">{d.event_id}</td><td className="font-mono text-xs">{d.event_type}</td><td>{d.attempts}</td><td>{d.last_status_code ?? "-"}</td>
                <td className="max-w-[220px] truncate text-xs">{d.last_error || "-"}</td><td><StatusBadge status={d.status} /></td><td className="text-xs">{dt(d.created_at)}</td></tr>
            ))}</tbody></table></div>
        )}
      </Panel>
    </div>
  );
}
