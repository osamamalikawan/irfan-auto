import { Suspense } from "react";
import BottomNav from "@/components/BottomNav";

export default function InventoryLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto min-h-dvh max-w-2xl pb-[calc(env(safe-area-inset-bottom)+4.5rem)]">
      {children}
      <Suspense fallback={null}>
        <BottomNav />
      </Suspense>
    </div>
  );
}
