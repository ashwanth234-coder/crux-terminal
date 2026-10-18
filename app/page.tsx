import { Header } from "@/components/site/Header";
import { Hero } from "@/components/site/Hero";
import { Experience } from "@/components/site/Experience";
import { Mechanics } from "@/components/site/Mechanics";
import { TokenSection } from "@/components/site/TokenSection";
import { Borderless } from "@/components/site/Borderless";
import { Footer } from "@/components/site/Footer";

export default function Home() {
  return (
    <>
      <Header />
      <main>
        <Hero />
        <Experience />
        <Mechanics />
        <TokenSection />
        <Borderless />
      </main>
      <Footer />
    </>
  );
}
