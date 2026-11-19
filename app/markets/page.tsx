import { redirect } from "next/navigation";

/** /markets is retired: old links land on Discover. */
export default function MarketsPage() {
  redirect("/discover");
}
