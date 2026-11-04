import { Banknote, BarChart3, Code2, FileText, HelpCircle, KeyRound, Landmark, LayoutDashboard, Link2, QrCode, Receipt, Settings, Users, Wallet, Webhook } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import AppShell from "./AppShell";

const GROUPS = [
  { label: "Utama", items: [
    { id: "overview", label: "Ringkasan", to: "/dashboard", icon: LayoutDashboard, end: true },
    { id: "invoices", label: "Invoice", to: "/dashboard/invoices", icon: FileText },
    { id: "payments", label: "Event Pembayaran", to: "/dashboard/payments", icon: Receipt },
    { id: "transactions", label: "Transaksi", to: "/dashboard/transactions", icon: BarChart3 },
    { id: "payment-links", label: "Payment Links", to: "/dashboard/payment-links", icon: Link2, soon: true },
    { id: "qris", label: "QRIS Mandiri", to: "/dashboard/qris", icon: QrCode },
  ] },
  { label: "Keuangan", items: [
    { id: "balance", label: "Saldo", to: "/dashboard/balance", icon: Wallet, soon: true },
    { id: "settlements", label: "Settlement", to: "/dashboard/settlements", icon: Landmark, soon: true },
    { id: "withdrawals", label: "Penarikan", to: "/dashboard/withdrawals", icon: Banknote, soon: true },
  ] },
  { label: "Developer", items: [
    { id: "developers", label: "Ikhtisar API", to: "/dashboard/developers", icon: Code2 },
    { id: "api-keys", label: "API Keys", to: "/dashboard/api-keys", icon: KeyRound },
    { id: "webhooks", label: "Webhooks", to: "/dashboard/webhooks", icon: Webhook },
  ] },
  { label: "Akun", items: [
    { id: "team", label: "Tim", to: "/dashboard/team", icon: Users },
    { id: "settings", label: "Pengaturan", to: "/dashboard/settings", icon: Settings },
    { id: "support", label: "Bantuan", to: "/dashboard/support", icon: HelpCircle },
  ] },
];

export default function MerchantLayout() {
  const { membership } = useAuth();
  return <AppShell groups={GROUPS} home="/dashboard" title="Merchant" subtitle={membership?.merchant_name} />;
}
