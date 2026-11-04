import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Clock, Loader2, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { DemoQR } from "@/components/common/DemoQR";
import { Logo } from "@/components/common/Logo";
import { StatusBadge } from "@/components/common/StatusBadge";
import { api, errMsg } from "@/lib/api";
import { rupiah } from "@/lib/format";

const useCountdown = (expiresAt, serverTime) => {
  const [left, setLeft] = useState(0);
  useEffect(() => {
    if (!expiresAt) return undefined;
    const skew = new Date(serverTime).getTime() - Date.now();
    const tick = () => setLeft(Math.max(0, Math.floor((new Date(expiresAt).getTime() - (Date.now() + skew)) / 1000)));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [expiresAt, serverTime]);
  return `${String(Math.floor(left / 60)).padStart(2, "0")}:${String(left % 60).padStart(2, "0")}`;
};

const FINAL = {
  PAID_VERIFIED: [CheckCircle2, "Pembayaran terverifikasi", "text-emerald-600"],
  EXPIRED: [XCircle, "Invoice kedaluwarsa", "text-slate-500"],
  CANCELLED: [XCircle, "Invoice dibatalkan", "text-slate-500"],
  FAILED: [XCircle, "Pembayaran gagal", "text-red-600"],
  AWAITING_VERIFICATION: [Clock, "Pembayaran terdeteksi, menunggu verifikasi", "text-amber-600"],
  PAYMENT_DETECTED: [Clock, "Pembayaran terdeteksi, menunggu verifikasi", "text-amber-600"],
  REVIEW_REQUIRED: [AlertTriangle, "Pembayaran sedang ditinjau", "text-orange-600"],
};

export default function PayPage() {
  const { invoiceId } = useParams();
  const { data, error, isLoading } = useQuery({
    queryKey: ["pay", invoiceId],
    queryFn: async () => (await api.get(`/public/pay/${invoiceId}`)).data,
    refetchInterval: (q) => (q.state.data && ["PENDING", "PAYMENT_DETECTED", "AWAITING_VERIFICATION"].includes(q.state.data.status) ? 5000 : false),
  });
  const countdown = useCountdown(data?.expires_at, data?.server_time);
  if (isLoading) return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-[#2563EB]" /></div>;
  if (error) return <div data-testid="pay-error" className="flex min-h-screen items-center justify-center text-sm text-red-600">{errMsg(error)}</div>;
  const final = FINAL[data.status];
  const FinalIcon = final?.[0];
  return (
    <div data-testid="pay-page" className="min-h-screen bg-[#F5F7FB] px-4 py-10 dark:bg-[#0B1736]">
      <div className="mx-auto max-w-md">
        <div className="mb-6 flex items-center justify-between"><Logo /><span data-testid="pay-mode-badge" className="rounded-md bg-amber-100 px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-amber-700">{data.mode}</span></div>
        <div className="card-q overflow-hidden">
          <div className="bg-[#0B1736] px-6 py-6 text-white">
            <p className="text-xs uppercase tracking-wider text-slate-400">Pembayaran ke</p>
            <p data-testid="pay-merchant-name" className="mt-1 text-lg font-bold">{data.merchant_name}</p>
            <p className="mt-1 font-mono text-xs text-slate-400" data-testid="pay-invoice-id">{data.id}</p>
            {data.description && <p className="mt-2 text-sm text-slate-300">{data.description}</p>}
          </div>
          <div className="px-6 py-6">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Total yang harus dibayar</p>
            <p data-testid="pay-payable-amount" className="mt-1 text-4xl font-extrabold tracking-tight text-[#0B1736] dark:text-white">{rupiah(data.payable_amount)}</p>
            <p className="mt-1 text-xs text-slate-500">{rupiah(data.amount)} + kode unik {data.unique_code}. Bayar tepat sesuai nominal.</p>
            <div className="mt-4"><StatusBadge status={data.status} testid="pay-status-badge" /></div>
            {data.status === "PENDING" ? (
              <>
                <div className="mt-6 flex justify-center"><DemoQR value={data.qr_string} size={210} testid="pay-qr" /></div>
                <p className="mt-3 text-center text-xs font-semibold text-red-600">Mode sandbox: kode QR ini hanya ilustrasi dan tidak dapat dibayar.</p>
                <div data-testid="pay-countdown" className="mt-5 flex items-center justify-center gap-2 rounded-xl bg-[#F5F7FB] py-3 font-mono text-lg font-bold dark:bg-white/5"><Clock className="h-4 w-4 text-[#2563EB]" />{countdown}</div>
                <ol className="mt-5 space-y-1.5 text-sm text-slate-600 dark:text-slate-300">
                  <li>1. Buka aplikasi bank atau e-wallet yang mendukung QRIS.</li>
                  <li>2. Pindai kode QR di atas.</li>
                  <li>3. Pastikan nominal {rupiah(data.payable_amount)} dan selesaikan pembayaran.</li>
                </ol>
              </>
            ) : final && (
              <div data-testid="pay-final-state" className={`mt-8 flex flex-col items-center gap-3 text-center ${final[2]}`}>
                <FinalIcon className="h-14 w-14" />
                <p className="text-lg font-bold">{final[1]}</p>
              </div>
            )}
          </div>
        </div>
        <p className="mt-6 text-center text-xs text-slate-500">Diproses oleh Qrisgg · Provider: Bank Mandiri — Livin' Usaha (sandbox)</p>
      </div>
    </div>
  );
}
