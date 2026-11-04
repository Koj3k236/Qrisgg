import { AboutSection, FinalCta, SecuritySection } from "@/components/marketing/AboutSecurity";
import { BusinessValue } from "@/components/marketing/BusinessValue";
import { DeveloperSection } from "@/components/marketing/DeveloperSection";
import { Features } from "@/components/marketing/Features";
import { Hero } from "@/components/marketing/Hero";
import { HowItWorks } from "@/components/marketing/HowItWorks";
import { PricingSection } from "@/components/marketing/PricingSection";
import { DashboardShowcase, PaymentShowcase } from "@/components/marketing/Showcases";
import { Solutions } from "@/components/marketing/Solutions";

export default function Home() {
  return (
    <div data-testid="home-page">
      <Hero />
      <BusinessValue />
      <Features />
      <Solutions />
      <HowItWorks />
      <PaymentShowcase />
      <DashboardShowcase />
      <DeveloperSection />
      <PricingSection />
      <AboutSection />
      <SecuritySection />
      <FinalCta />
    </div>
  );
}
