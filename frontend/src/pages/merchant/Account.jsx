import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Empty, PageHeader, Panel } from "@/components/common/Page";
import { StatusBadge } from "@/components/common/StatusBadge";
import { useAuth } from "@/context/AuthContext";
import { api, errMsg } from "@/lib/api";
import { dt, ROLE_LABEL } from "@/lib/format";
import { btnDanger, btnGhost, btnPrimary, inputCls, useCan, useGet } from "@/lib/hooks";

const ROLES = ["MERCHANT_ADMIN", "MERCHANT_DEVELOPER", "MERCHANT_VIEWER"];

const useAction = (keys) => {
  const qc = useQueryClient();
  return async (fn, ok) => {
    try {
      await fn();
      if (ok) toast.success(ok);
      keys.forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      return true;
    } catch (e) {
      toast.error(errMsg(e));
      return false;
    }
  };
};

export function TeamPage() {
  const can = useCan();
  const act = useAction(["team"]);
  const { data = [], isLoading } = useGet("team", "/merchant/team");
  const [f, setF] = useState({ email: "", role: "MERCHANT_VIEWER" });
  const add = async (e) => {
    e.preventDefault();
    if (await act(() => api.post("/merchant/team", f), "Anggota ditambahkan")) setF({ ...f, email: "" });
  };
  return (
    <div data-testid="team-page">
      <PageHeader title="Tim" description="Peran ditegakkan di backend: Pemilik/Admin kelola semua, Developer kelola invoice & API, Viewer hanya baca." />
      {can("team:manage") && (
        <form onSubmit={add} className="card-q mb-6 flex flex-col gap-3 p-5 sm:flex-row">
          <input data-testid="team-email-input" type="email" required placeholder="email@pengguna-terdaftar.com" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} className={inputCls} />
          <select data-testid="team-role-select" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })} className={`${inputCls} sm:max-w-[200px]`}>
            {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
          </select>
          <button data-testid="team-add-btn" className={btnPrimary}>Tambah</button>
        </form>
      )}
      <Panel testid="team-table-panel">
        {isLoading ? <Empty text="Memuat…" /> : (
          <table className="tbl"><thead><tr><th>Nama</th><th>Email</th><th>Peran</th><th /></tr></thead>
            <tbody>{data.map((m) => (
              <tr key={m.id} data-testid={`team-row-${m.id}`}><td className="font-semibold">{m.name}</td><td>{m.email}</td>
                <td>{can("team:manage") && m.role !== "MERCHANT_OWNER" ? (
                  <select data-testid={`team-role-${m.id}`} value={m.role} onChange={(e) => act(() => api.patch(`/merchant/team/${m.id}`, { role: e.target.value }), "Peran diperbarui")} className={`${inputCls} max-w-[180px] py-1.5`}>
                    {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                  </select>) : ROLE_LABEL[m.role]}</td>
                <td>{can("team:manage") && m.role !== "MERCHANT_OWNER" && <button type="button" onClick={() => act(() => api.delete(`/merchant/team/${m.id}`), "Anggota dihapus")} data-testid={`team-remove-${m.id}`} className={btnDanger}>Hapus</button>}</td></tr>
            ))}</tbody></table>
        )}
      </Panel>
    </div>
  );
}

export function SupportPage() {
  const act = useAction(["tickets"]);
  const { data = [] } = useGet("tickets", "/merchant/support");
  const [f, setF] = useState({ subject: "", message: "" });
  const submit = async (e) => {
    e.preventDefault();
    if (await act(() => api.post("/merchant/support", f), "Tiket dibuat")) setF({ subject: "", message: "" });
  };
  return (
    <div data-testid="support-page">
      <PageHeader title="Bantuan" description="Kirim tiket ke tim Qrisgg." />
      <div className="grid gap-6 xl:grid-cols-2">
        <form onSubmit={submit} className="card-q space-y-3 p-5">
          <input data-testid="ticket-subject-input" required minLength={3} placeholder="Subjek" value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} className={inputCls} />
          <textarea data-testid="ticket-message-input" required minLength={5} rows={5} placeholder="Jelaskan kendala Anda" value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} className={inputCls} />
          <button data-testid="ticket-submit-btn" className={btnPrimary}>Kirim Tiket</button>
        </form>
        <Panel title="Tiket saya" testid="tickets-panel">
          {!data.length ? <Empty text="Belum ada tiket." /> : data.map((t) => (
            <div key={t.id} className="flex items-center justify-between border-b border-slate-100 px-5 py-3 last:border-0 dark:border-slate-800"><div><p className="text-sm font-semibold">{t.subject}</p><p className="text-xs text-slate-500">{dt(t.created_at)}</p></div><StatusBadge status={t.status} /></div>
          ))}
        </Panel>
      </div>
    </div>
  );
}

function ProfileForm() {
  const can = useCan();
  const act = useAction(["merchant-profile", "merchant-overview"]);
  const { data } = useGet("merchant-profile", "/merchant/profile");
  const [f, setF] = useState(null);
  useEffect(() => {
    if (data) setF({ name: data.name || "", business_type: data.business_type || "", phone: data.phone || "", website: data.website || "", address: data.address || "" });
  }, [data]);
  if (!f) return null;
  const save = (e) => {
    e.preventDefault();
    act(() => api.patch("/merchant/profile", Object.fromEntries(Object.entries(f).filter(([, v]) => v))), "Profil disimpan");
  };
  return (
    <Panel title="Profil merchant" testid="profile-panel">
      <form onSubmit={save} className="grid gap-3 p-5 sm:grid-cols-2">
        {[["name", "Nama usaha"], ["business_type", "Jenis usaha"], ["phone", "Telepon"], ["website", "Website"], ["address", "Alamat"]].map(([k, l]) => (
          <label key={k} className={`text-sm font-medium ${k === "address" ? "sm:col-span-2" : ""}`}>{l}
            <input data-testid={`profile-${k}-input`} disabled={!can("settings:manage")} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} className={`${inputCls} mt-1`} /></label>
        ))}
        {can("settings:manage") && <button data-testid="profile-save-btn" className={`${btnPrimary} sm:col-span-2`}>Simpan</button>}
      </form>
    </Panel>
  );
}

function SecurityPanel() {
  const { user, refresh } = useAuth();
  const act = useAction(["sessions"]);
  const { data: sessions = [] } = useGet("sessions", "/auth/sessions");
  const [pw, setPw] = useState({ current_password: "", new_password: "" });
  const change = async (e) => {
    e.preventDefault();
    if (await act(() => api.post("/auth/change-password", pw), "Kata sandi diubah, sesi lain dikeluarkan")) setPw({ current_password: "", new_password: "" });
  };
  const disable2fa = async () => {
    const code = window.prompt("Masukkan kode 2FA untuk menonaktifkan");
    if (code && (await act(() => api.post("/auth/2fa/disable", { code }), "2FA dinonaktifkan"))) refresh();
  };
  return (
    <div className="space-y-6">
      <Panel title="Keamanan akun" testid="security-panel">
        <div className="space-y-4 p-5 text-sm">
          <div className="flex items-center justify-between"><span>Email terverifikasi</span><StatusBadge status={user.email_verified ? "ACTIVE" : "PENDING_REVIEW"} testid="settings-email-verified" /></div>
          <div className="flex items-center justify-between"><span>Autentikasi dua langkah</span>
            {user.mfa_enabled ? <button type="button" onClick={disable2fa} data-testid="disable-2fa-btn" className={btnGhost}>Nonaktifkan</button> : <a href="/2fa" data-testid="enable-2fa-link" className={btnGhost}>Aktifkan 2FA</a>}
          </div>
          <form onSubmit={change} className="space-y-2 border-t border-slate-100 pt-4 dark:border-slate-800">
            <input data-testid="current-password-input" type="password" required placeholder="Kata sandi saat ini" value={pw.current_password} onChange={(e) => setPw({ ...pw, current_password: e.target.value })} className={inputCls} />
            <input data-testid="new-password-input" type="password" required minLength={10} placeholder="Kata sandi baru" value={pw.new_password} onChange={(e) => setPw({ ...pw, new_password: e.target.value })} className={inputCls} />
            <button data-testid="change-password-btn" className={btnPrimary}>Ubah Kata Sandi</button>
          </form>
        </div>
      </Panel>
      <Panel title="Sesi aktif" testid="sessions-panel">
        {sessions.map((s) => (
          <div key={s.id} className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-3 text-xs last:border-0 dark:border-slate-800">
            <div className="min-w-0"><p className="truncate">{s.user_agent || "-"}</p><p className="text-slate-500">{s.ip} · {dt(s.created_at)}</p></div>
            {s.current ? <span className="font-semibold text-emerald-600">Sesi ini</span> : <button type="button" onClick={() => act(() => api.delete(`/auth/sessions/${s.id}`), "Sesi dicabut")} data-testid={`revoke-session-${s.id}`} className={btnDanger}>Cabut</button>}
          </div>
        ))}
      </Panel>
    </div>
  );
}

export function SettingsPage() {
  return (
    <div data-testid="settings-page">
      <PageHeader title="Pengaturan" />
      <div className="grid gap-6 xl:grid-cols-2"><ProfileForm /><SecurityPanel /></div>
    </div>
  );
}
