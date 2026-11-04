import { ArrowRight, KeyRound, Repeat, ShieldCheck, Webhook } from "lucide-react";
import { Link } from "react-router-dom";
import { CodeBlock } from "@/components/common/CodeBlock";
import { Reveal, SectionHead } from "./Reveal";

export const CREATE_SNIPPET = `curl -X POST https://api.qrisgg.com/v1/invoices \\
  -H "Authorization: Bearer qgg_sk_sandbox_..." \\
  -H "Idempotency-Key: ORDER-10001" \\
  -H "Content-Type: application/json" \\
  -d '{
    "external_id": "ORDER-10001",
    "amount": 100000,
    "currency": "IDR",
    "payment_method": "QRIS",
    "expires_in": 900
  }'`;

export const RESPONSE_SNIPPET = `{
  "id": "inv_3f9a1c...",
  "external_id": "ORDER-10001",
  "amount": 100000,
  "unique_code": 237,
  "payable_amount": 100237,
  "currency": "IDR",
  "status": "PENDING",
  "mode": "SANDBOX"
}`;

export const WEBHOOK_SNIPPET = `POST https://toko-anda.com/webhooks/qrisgg
X-Qrisgg-Event-Type: payment.verified
X-Qrisgg-Signature: t=1767225600,v1=5f2b...e91

{
  "id": "whe_8c2d...",
  "type": "payment.verified",
  "mode": "SANDBOX",
  "data": { "invoice_id": "inv_3f9a1c...", "amount": 100237 }
}`;

const POINTS = [
  [KeyRound, "API key ber-scope", "Disimpan sebagai hash, dapat dirotasi dan dicabut kapan saja."],
  [Repeat, "Idempotency-Key", "Permintaan yang diulang tidak membuat invoice ganda."],
  [Webhook, "Webhook HMAC-SHA256", "Tanda tangan dengan timestamp, retry backoff eksponensial, dead-letter."],
  [ShieldCheck, "Sandbox terlebih dahulu", "Uji seluruh alur dengan simulator sebelum transaksi nyata."],
];

export const DeveloperSection = () => (
  <section id="developer" data-testid="developer-section" className="relative overflow-hidden bg-[#0B1736] py-24 text-white lg:py-32">
    <div className="grid-bg pointer-events-none absolute inset-0 opacity-40" />
    <div className="container-q relative grid gap-16 lg:grid-cols-12">
      <div className="lg:col-span-5">
        <SectionHead light eyebrow="Developer" title="Dirancang untuk Bisnis. Dibangun untuk Developer." desc="REST API berversi /v1 dengan autentikasi Bearer API key. Buat invoice, baca status, dan terima event webhook bertanda tangan." />
        <div className="mt-10 grid gap-5 sm:grid-cols-2">
          {POINTS.map(([Icon, t, d]) => (
            <div key={t}>
              <Icon className="h-5 w-5 text-[#38BDF8]" />
              <h3 className="mt-3 text-sm font-bold">{t}</h3>
              <p className="mt-1 text-sm text-slate-400">{d}</p>
            </div>
          ))}
        </div>
        <Link to="/docs" data-testid="developer-docs-cta" className="mt-10 inline-flex items-center gap-2 rounded-full bg-white px-6 py-3.5 text-sm font-semibold text-[#0B1736] transition-transform hover:-translate-y-0.5 active:scale-95">
          Baca Dokumentasi <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
      <div className="space-y-5 lg:col-span-7">
        <Reveal><CodeBlock title="Buat invoice" code={CREATE_SNIPPET} testid="code-create-invoice" /></Reveal>
        <div className="grid gap-5 xl:grid-cols-2">
          <Reveal delay={0.1}><CodeBlock title="Respons sandbox" code={RESPONSE_SNIPPET} testid="code-response" /></Reveal>
          <Reveal delay={0.2}><CodeBlock title="Contoh webhook" code={WEBHOOK_SNIPPET} testid="code-webhook" /></Reveal>
        </div>
      </div>
    </div>
  </section>
);
