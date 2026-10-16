import { Suspense } from "react";
import { AuthedFrame, FrameFallback } from "@/app/components/dashboard-shell";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<FrameFallback />}>
      <AuthedFrame>{children}</AuthedFrame>
    </Suspense>
  );
}
