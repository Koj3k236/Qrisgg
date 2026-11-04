import { useQuery } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { Reveal, SectionHead } from "./Reveal";

export const PricingSection = () => {
  const { data: plans = [], isLoading } = useQuery({ queryKey: ["public-plans"], queryFn: async () => (await api.get("/public/plans")).data });
  return (
    <section id="harga" data-testid="pricing-section" className="py-24 lg:py-32">
      <div className="container-q">
        <SectionHead center eyebrow="Harga" title="Harga yang transparan, saat sudah final." desc="Biaya komersial belum ditetapkan. Kami tidak mencantumkan MDR atau biaya bank yang belum resmi. Paket dikelola melalui panel admin." />
        <div className="mx-auto mt-14 grid max-w-6xl gap-6 md:grid-cols-3">
          {isLoading && <p className="col-span-3 text-center text-sm text-slate-500">Memuat paket…</p>}
          {plans.map((p, i) => (
            <Reveal key={p.id} delay={i * 0.08}>
              <div data-testid={`pricing-plan-${i}`} className={`relative flex h-full flex-col rounded-3xl border p-8 ${p.highlighted ? "border-[#2563EB] bg-[#0B1736] text-white shadow-[0_30px_60px_-30px_rgba(37,99,235,0.8)]" : "border-slate-200 bg-white dark:border-slate-800 dark:bg-[#122045]"}`}>
                {p.highlighted && <span className="absolute -top-3 left-8 rounded-full bg-[#38BDF8] px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-[#0B1736]">Untuk Merchant</span>}
                <h3 className="text-lg font-bold">{p.name}</h3>
                <p className={`mt-2 text-sm ${p.highlighted ? "text-slate-300" : "text-slate-600 dark:text-slate-400"}`}>{p.description}</p>
                <div className="mt-6 text-3xl font-extrabold tracking-tight">{p.price_label}</div>
                <ul className="mt-6 flex-1 space-y-3 text-sm">
                  {p.features.map((f) => (
                    <li key={f} className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-[#38BDF8]" />{f}</li>
                  ))}
                </ul>
                <Link to={p.price_label === "Hubungi Kami" ? "/contact" : "/register"} data-testid={`pricing-plan-${i}-cta`}
                  className={`mt-8 rounded-full py-3 text-center text-sm font-semibold transition-[background-color,transform] active:scale-95 ${p.highlighted ? "bg-[#2563EB] text-white hover:bg-[#1D4ED8]" : "border border-slate-300 hover:border-[#2563EB] hover:text-[#2563EB] dark:border-slate-600"}`}>
                  {p.price_label === "Hubungi Kami" ? "Hubungi Kami" : "Daftar Sekarang"}
                </Link>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
};
