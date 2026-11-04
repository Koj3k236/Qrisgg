import { Activity, AlertTriangle, BookOpen, Building2, Coins, FileText, GitCompare, HelpCircle, LayoutDashboard, Landmark, Plug, QrCode, Receipt, ScrollText, Settings, Tags, Users, Wallet } from "lucide-react";
import AppShell from "./AppShell";

const GROUPS = [
  { label: "Operasional", items: [
    { id: "admin-overview", label: "Ringkasan", to: "/admin", icon: LayoutDashboard, end: true },
    { id: "admin-merchants", label: "Merchant", to: "/admin/merchants", icon: Building2 },
    { id: "admin-users", label: "Pengguna", to: "/admin/users", icon: Users },
    { id: "admin-invoices", label: "Invoice", to: "/admin/invoices", icon: FileText },
    { id: "admin-transactions", label: "Transaksi", to: "/admin/transactions", icon: Activity },
    { id: "admin-payment-events", label: "Event Pembayaran", to: "/admin/payment-events", icon: Receipt },
    { id: "admin-reconciliation", label: "Rekonsiliasi", to: "/admin/reconciliation", icon: GitCompare },
    { id: "admin-qris", label: "Akun QRIS", to: "/admin/qris", icon: QrCode },
    { id: "admin-providers", label: "Provider", to: "/admin/payment-providers", icon: Plug },
  ] },
  { label: "Keuangan", items: [
    { id: "admin-ledger", label: "Ledger", to: "/admin/ledger", icon: BookOpen },
    { id: "admin-settlements", label: "Settlement", to: "/admin/settlements", icon: Landmark },
    { id: "admin-withdrawals", label: "Penarikan", to: "/admin/withdrawals", icon: Wallet },
    { id: "admin-fees", label: "Biaya", to: "/admin/fees", icon: Coins, soon: true },
    { id: "admin-plans", label: "Paket Harga", to: "/admin/plans", icon: Tags },
  ] },
  { label: "Kepatuhan", items: [
    { id: "admin-risk", label: "Risiko", to: "/admin/risk", icon: AlertTriangle, soon: true },
    { id: "admin-audit", label: "Audit Log", to: "/admin/audit-logs", icon: ScrollText },
    { id: "admin-support", label: "Dukungan", to: "/admin/support", icon: HelpCircle },
    { id: "admin-settings", label: "Pengaturan Sistem", to: "/admin/settings", icon: Settings },
  ] },
];

export default function AdminLayout() {
  return <AppShell groups={GROUPS} home="/admin" title="Panel Admin" subtitle="Qrisgg Platform" />;
}
