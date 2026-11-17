import { redirect } from "next/navigation";

/** The first Solana test page; coins now have their own pages (/sol/[mint]) and the header search finds them. */
export default function SolanaPage() {
  redirect("/sol/DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263");
}
