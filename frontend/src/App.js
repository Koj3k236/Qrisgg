import "@/App.css";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { GuestOnly, RequireAdmin, RequireMerchant } from "@/components/common/Guards";
import { NotImplemented } from "@/components/common/Page";
import { useThemeMode } from "@/components/common/ThemeToggle";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider } from "@/context/AuthContext";
import AdminLayout from "@/layouts/AdminLayout";
import AuthLayout from "@/layouts/AuthLayout";
import MarketingLayout from "@/layouts/MarketingLayout";
import MerchantLayout from "@/layouts/MerchantLayout";
import * as A from "@/pages/admin/Admin";
import * as Auth from "@/pages/auth/AuthPages";
import Home from "@/pages/marketing/Home";
import * as M from "@/pages/marketing/Pages";
import { SettingsPage, SupportPage, TeamPage } from "@/pages/merchant/Account";
import { ApiKeysPage, DevelopersHome, WebhooksPage } from "@/pages/merchant/Developers";
import { BalancePage, SettlementsPage, WithdrawalsPage } from "@/pages/merchant/Finance";
import { AdminLedger, AdminSettlements, AdminWithdrawals } from "@/pages/admin/AdminFinance";
import InvoiceDetail from "@/pages/merchant/InvoiceDetail";
import Invoices from "@/pages/merchant/Invoices";
import Overview from "@/pages/merchant/Overview";
import { PaymentsPage, QrisPage } from "@/pages/merchant/PaymentsQris";
import PayPage from "@/pages/Pay";

const NI = (title, phase, note) => <NotImplemented title={title} phase={phase} note={note} />;

function App() {
  useThemeMode();
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route element={<MarketingLayout />}>
            <Route path="/" element={<Home />} />
            <Route path="/features" element={<M.FeaturesPage />} />
            <Route path="/pricing" element={<M.PricingPage />} />
            <Route path="/developers" element={<M.DevelopersPage />} />
            <Route path="/docs" element={<M.DocsPage />} />
            <Route path="/about" element={<M.AboutPage />} />
            <Route path="/contact" element={<M.ContactPage />} />
            <Route path="/security" element={<M.SecurityPage />} />
            <Route path="/terms" element={<M.TermsPage />} />
            <Route path="/privacy" element={<M.PrivacyPage />} />
            <Route path="/status" element={<M.StatusPage />} />
          </Route>
          <Route element={<AuthLayout />}>
            <Route path="/login" element={<GuestOnly><Auth.LoginPage /></GuestOnly>} />
            <Route path="/register" element={<GuestOnly><Auth.RegisterPage /></GuestOnly>} />
            <Route path="/forgot-password" element={<Auth.ForgotPasswordPage />} />
            <Route path="/reset-password" element={<Auth.ResetPasswordPage />} />
            <Route path="/verify-email" element={<Auth.VerifyEmailPage />} />
            <Route path="/2fa" element={<Auth.TwoFactorPage />} />
          </Route>
          <Route path="/pay/:invoiceId" element={<PayPage />} />
          <Route path="/dashboard" element={<RequireMerchant><MerchantLayout /></RequireMerchant>}>
            <Route index element={<Overview />} />
            <Route path="invoices" element={<Invoices />} />
            <Route path="invoices/:invoiceId" element={<InvoiceDetail />} />
            <Route path="payments" element={<PaymentsPage />} />
            <Route path="transactions" element={<PaymentsPage title="Transaksi" />} />
            <Route path="qris" element={<QrisPage />} />
            <Route path="payment-links" element={NI("Payment Links", "Fase 9")} />
            <Route path="balance" element={<BalancePage />} />
            <Route path="settlements" element={<SettlementsPage />} />
            <Route path="withdrawals" element={<WithdrawalsPage />} />
            <Route path="developers" element={<DevelopersHome />} />
            <Route path="api-keys" element={<ApiKeysPage />} />
            <Route path="webhooks" element={<WebhooksPage />} />
            <Route path="team" element={<TeamPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="support" element={<SupportPage />} />
          </Route>
          <Route path="/admin" element={<RequireAdmin><AdminLayout /></RequireAdmin>}>
            <Route index element={<A.AdminOverview />} />
            <Route path="merchants" element={<A.AdminMerchants />} />
            <Route path="users" element={<A.AdminUsers />} />
            <Route path="invoices" element={<A.AdminInvoices />} />
            <Route path="invoices/:invoiceId" element={<A.AdminInvoiceDetail />} />
            <Route path="transactions" element={<A.AdminInvoices title="Transaksi" />} />
            <Route path="payment-events" element={<A.AdminEvents />} />
            <Route path="reconciliation" element={<A.AdminReconciliation />} />
            <Route path="qris" element={<A.AdminQris />} />
            <Route path="payment-providers" element={<A.AdminProviders />} />
            <Route path="plans" element={<A.AdminPlans />} />
            <Route path="audit-logs" element={<A.AdminAudit />} />
            <Route path="settings" element={<A.AdminSettings />} />
            <Route path="support" element={<A.AdminSupport />} />
            <Route path="ledger" element={<AdminLedger />} />
            <Route path="settlements" element={<AdminSettlements />} />
            <Route path="withdrawals" element={<AdminWithdrawals />} />
            <Route path="fees" element={NI("Biaya", "setelah ada ketentuan komersial resmi", "Diblokir eksternal: belum ada MDR/biaya resmi dari Bank Mandiri untuk dicantumkan.")} />
            <Route path="risk" element={NI("Risiko", "Fase 13 lanjutan")} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <Toaster position="top-right" richColors />
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
