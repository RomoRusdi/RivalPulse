import { Suspense } from "react";
import { FindingBrowser } from "@/components/dashboard/FindingBrowser";
import { Skeleton } from "@/components/ui/primitives";

export default function SignalsPage() {
  return <Suspense fallback={<Skeleton className="h-72 w-full" />}><FindingBrowser /></Suspense>;
}
