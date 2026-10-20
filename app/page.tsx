import { Header } from "@/components/site/Header";
import { Hero } from "@/components/site/Hero";
import { Discover } from "@/components/site/Discover";
import { FairLaunch } from "@/components/site/FairLaunch";
import { Execution } from "@/components/site/Execution";
import { Liquidity } from "@/components/site/Liquidity";
import { Economics } from "@/components/site/Economics";
import { FinalCta } from "@/components/site/FinalCta";
import { Footer } from "@/components/site/Footer";

export default function Home() {
  return (
    <>
      <Header />
      <main>
        <Hero />
        <Discover />
        <FairLaunch />
        <Execution />
        <Liquidity />
        <Economics />
        <FinalCta />
      </main>
      <Footer />
    </>
  );
}
