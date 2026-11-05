import { Header } from "@/components/site/Header";
import { Hero } from "@/components/site/Hero";
import { Pillars } from "@/components/site/Pillars";
import { OnBase } from "@/components/site/OnBase";
import { Discover } from "@/components/site/Discover";
import { HowItWorks } from "@/components/site/HowItWorks";
import { FinalCta } from "@/components/site/FinalCta";
import { Footer } from "@/components/site/Footer";

export default function Home() {
  return (
    <>
      <Header />
      <main>
        <Hero />
        <Pillars />
        <OnBase />
        <Discover />
        <HowItWorks />
        <FinalCta />
      </main>
      <Footer />
    </>
  );
}
