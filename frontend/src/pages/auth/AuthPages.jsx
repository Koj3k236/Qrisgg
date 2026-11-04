import { Loader2 } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useEffect, useRef, useState } from "react";
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { homeFor, useAuth } from "@/context/AuthContext";
import { api, errMsg } from "@/lib/api";

const Field = ({ label, id, ...props }) => (
  <label htmlFor={id} className="block text-sm font-medium text-[#0B1736] dark:text-slate-200">
    {label}
    <input id={id} data-testid={`${id}-input`} {...props}
      className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none transition-[border-color,box-shadow] focus:border-[#2563EB] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.12)] dark:border-slate-700 dark:bg-[#122045]" />
  </label>
);

const Submit = ({ busy, children, testid }) => (
  <button type="submit" disabled={busy} data-testid={testid}
    className="flex w-full items-center justify-center gap-2 rounded-full bg-[#2563EB] py-3.5 text-sm font-semibold text-white shadow-[0_10px_24px_-10px_rgba(37,99,235,0.8)] transition-[background-color,transform] hover:bg-[#1D4ED8] active:scale-95 disabled:opacity-60">
    {busy && <Loader2 className="h-4 w-4 animate-spin" />}{children}
  </button>
);

const Head = ({ title, desc }) => (
  <div className="mb-8">
    <h1 className="text-3xl font-extrabold tracking-tight text-[#0B1736] dark:text-white">{title}</h1>
    {desc && <p className="mt-2 text-sm text-slate-500">{desc}</p>}
  </div>
);

const Err = ({ msg }) => msg ? <p data-testid="auth-error-msg" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">{msg}</p> : null;

const useSubmit = () => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const run = async (fn) => {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, run };
};

export function LoginPage() {
  const { setUser } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [f, setF] = useState({ email: "", password: "" });
  const { busy, error, run } = useSubmit();
  const submit = (e) => {
    e.preventDefault();
    run(async () => {
      const { data } = await api.post("/auth/login", f);
      if (data.mfa_required) return nav("/2fa", { state: { mfa_token: data.mfa_token } });
      setUser(data);
      toast.success("Berhasil masuk");
      nav(loc.state?.from || homeFor(data), { replace: true });
    });
  };
  return (
    <form onSubmit={submit} className="space-y-5" data-testid="login-form">
      <Head title="Masuk ke Qrisgg" desc="Kelola invoice dan pembayaran QRIS bisnis Anda." />
      <Field id="login-email" label="Email" type="email" required autoComplete="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
      <Field id="login-password" label="Kata sandi" type="password" required autoComplete="current-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
      <div className="text-right"><Link to="/forgot-password" data-testid="forgot-password-link" className="text-sm font-medium text-[#2563EB]">Lupa kata sandi?</Link></div>
      <Err msg={error} />
      <Submit busy={busy} testid="login-submit-btn">Masuk</Submit>
      <p className="text-center text-sm text-slate-500">Belum punya akun? <Link to="/register" data-testid="go-register-link" className="font-semibold text-[#2563EB]">Daftar sekarang</Link></p>
    </form>
  );
}

export function RegisterPage() {
  const { setUser } = useAuth();
  const nav = useNavigate();
  const [f, setF] = useState({ name: "", email: "", business_name: "", password: "" });
  const { busy, error, run } = useSubmit();
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = (e) => {
    e.preventDefault();
    run(async () => {
      const { data } = await api.post("/auth/register", f);
      setUser(data);
      toast.success(data.verification_email_status === "SENT" ? "Akun dibuat. Cek email untuk verifikasi." : "Akun dibuat. Email verifikasi belum terkirim — kirim ulang dari Pengaturan.");
      nav("/dashboard", { replace: true });
    });
  };
  return (
    <form onSubmit={submit} className="space-y-4" data-testid="register-form">
      <Head title="Daftar Qrisgg" desc="Buat akun merchant dan mulai uji alur pembayaran di sandbox." />
      <Field id="register-name" label="Nama lengkap" required minLength={2} value={f.name} onChange={set("name")} />
      <Field id="register-business" label="Nama usaha" required minLength={2} value={f.business_name} onChange={set("business_name")} />
      <Field id="register-email" label="Email" type="email" required value={f.email} onChange={set("email")} />
      <Field id="register-password" label="Kata sandi (min. 10 karakter, huruf & angka)" type="password" required minLength={10} autoComplete="new-password" value={f.password} onChange={set("password")} />
      <Err msg={error} />
      <Submit busy={busy} testid="register-submit-btn">Buat Akun</Submit>
      <p className="text-center text-sm text-slate-500">Sudah punya akun? <Link to="/login" data-testid="go-login-link" className="font-semibold text-[#2563EB]">Masuk</Link></p>
    </form>
  );
}

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [done, setDone] = useState("");
  const { busy, error, run } = useSubmit();
  const submit = (e) => {
    e.preventDefault();
    run(async () => setDone((await api.post("/auth/forgot-password", { email })).data.message));
  };
  return (
    <form onSubmit={submit} className="space-y-5" data-testid="forgot-form">
      <Head title="Lupa kata sandi" desc="Kami akan mengirim tautan atur ulang ke email Anda." />
      {done ? <p data-testid="forgot-success-msg" className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{done}</p> : <>
        <Field id="forgot-email" label="Email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <Err msg={error} />
        <Submit busy={busy} testid="forgot-submit-btn">Kirim Tautan</Submit>
      </>}
      <Link to="/login" data-testid="back-login-link" className="block text-center text-sm font-semibold text-[#2563EB]">Kembali ke halaman masuk</Link>
    </form>
  );
}

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const [password, setPassword] = useState("");
  const { busy, error, run } = useSubmit();
  const submit = (e) => {
    e.preventDefault();
    run(async () => {
      const { data } = await api.post("/auth/reset-password", { token: params.get("token") || "", password });
      toast.success(data.message);
      nav("/login");
    });
  };
  return (
    <form onSubmit={submit} className="space-y-5" data-testid="reset-form">
      <Head title="Atur ulang kata sandi" desc="Semua sesi aktif akan dikeluarkan setelah kata sandi diubah." />
      <Field id="reset-password" label="Kata sandi baru" type="password" required minLength={10} value={password} onChange={(e) => setPassword(e.target.value)} />
      <Err msg={error} />
      <Submit busy={busy} testid="reset-submit-btn">Simpan Kata Sandi</Submit>
    </form>
  );
}

export function VerifyEmailPage() {
  const [params] = useSearchParams();
  const { refresh } = useAuth();
  const [state, setState] = useState({ status: "loading", msg: "" });
  const once = useRef(false);
  useEffect(() => {
    if (once.current) return;
    once.current = true;
    api.post("/auth/verify-email", { token: params.get("token") || "" })
      .then(() => { setState({ status: "ok", msg: "Email berhasil diverifikasi." }); refresh(); })
      .catch((e) => setState({ status: "error", msg: errMsg(e) }));
  }, [params, refresh]);
  return (
    <div data-testid="verify-email-page">
      <Head title="Verifikasi email" />
      <p data-testid="verify-email-status" className={`rounded-lg px-4 py-3 text-sm ${state.status === "ok" ? "bg-emerald-50 text-emerald-700" : state.status === "error" ? "bg-red-50 text-red-700" : "bg-slate-100"}`}>
        {state.status === "loading" ? "Memverifikasi…" : state.msg}
      </p>
      <Link to="/dashboard" data-testid="verify-go-dashboard" className="mt-6 inline-block text-sm font-semibold text-[#2563EB]">Ke dashboard</Link>
    </div>
  );
}

const CodeInput = ({ value, onChange }) => (
  <input data-testid="totp-code-input" inputMode="numeric" autoComplete="one-time-code" maxLength={6} required value={value}
    onChange={(e) => onChange(e.target.value.replace(/\D/g, ""))}
    className="w-full rounded-xl border border-slate-300 bg-white px-4 py-4 text-center font-mono text-2xl tracking-[0.5em] outline-none focus:border-[#2563EB] dark:border-slate-700 dark:bg-[#122045]" />
);

function MfaSetup() {
  const { refresh } = useAuth();
  const nav = useNavigate();
  const [setup, setSetup] = useState(null);
  const [code, setCode] = useState("");
  const { busy, error, run } = useSubmit();
  const start = () => run(async () => setSetup((await api.post("/auth/2fa/setup")).data));
  const enable = (e) => {
    e.preventDefault();
    run(async () => {
      await api.post("/auth/2fa/enable", { code });
      const me = await refresh();
      toast.success("2FA aktif");
      nav(homeFor(me));
    });
  };
  return (
    <div data-testid="mfa-setup">
      <Head title="Aktifkan 2FA" desc="Wajib untuk administrator. Gunakan aplikasi authenticator (TOTP)." />
      {!setup ? <button type="button" onClick={start} data-testid="mfa-start-btn" className="w-full rounded-full bg-[#2563EB] py-3.5 text-sm font-semibold text-white">Mulai Pengaturan</button> : (
        <form onSubmit={enable} className="space-y-5">
          <div className="flex justify-center rounded-2xl border border-slate-200 bg-white p-5"><QRCodeSVG value={setup.otpauth_uri} size={180} /></div>
          <p className="break-all text-center font-mono text-xs text-slate-500" data-testid="mfa-secret">{setup.secret}</p>
          <CodeInput value={code} onChange={setCode} />
          <Submit busy={busy} testid="mfa-enable-btn">Verifikasi & Aktifkan</Submit>
        </form>
      )}
      <div className="mt-4"><Err msg={error} /></div>
    </div>
  );
}

export function TwoFactorPage() {
  const { user, setUser } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const token = loc.state?.mfa_token;
  const [code, setCode] = useState("");
  const { busy, error, run } = useSubmit();
  if (!token) {
    if (user === null) return null;
    if (!user) return <Navigate to="/login" replace />;
    if (!user.mfa_enabled) return <MfaSetup />;
    return <Navigate to={homeFor(user)} replace />;
  }
  const submit = (e) => {
    e.preventDefault();
    run(async () => {
      const { data } = await api.post("/auth/2fa/verify", { mfa_token: token, code });
      setUser(data);
      toast.success("Verifikasi 2FA berhasil");
      nav(homeFor(data), { replace: true });
    });
  };
  return (
    <form onSubmit={submit} className="space-y-5" data-testid="mfa-verify-form">
      <Head title="Verifikasi dua langkah" desc="Masukkan 6 digit kode dari aplikasi authenticator Anda." />
      <CodeInput value={code} onChange={setCode} />
      <Err msg={error} />
      <Submit busy={busy} testid="mfa-verify-btn">Verifikasi</Submit>
    </form>
  );
}
