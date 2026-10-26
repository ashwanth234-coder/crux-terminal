import { Header } from "@/components/site/Header";
import { Hero } from "@/components/site/Hero";
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
        <Discover />
        <HowItWorks />
        <FinalCta />
      </main>
      <Footer />
    </>
  );
}
