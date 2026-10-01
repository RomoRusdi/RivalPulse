import { redirect } from "next/navigation";

// Folded into /signals: these three pages all rendered the same findings.
export default function Page() {
  redirect("/signals");
}
