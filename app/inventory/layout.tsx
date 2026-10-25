import { Suspense } from "react";
import BottomNav from "@/components/BottomNav";
import Sidebar from "@/components/Sidebar";
import Topbar from "@/components/Topbar";

/* Phone/tablet: single column + bottom nav.  Desktop (lg+): dark sidebar + top bar, like the original HTML. */
export default function InventoryLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="lg:flex lg:min-h-dvh">
      <Sidebar />
      <div className="mx-auto min-h-dvh w-full max-w-2xl pb-[calc(env(safe-area-inset-bottom)+4.5rem)] lg:mx-0 lg:min-w-0 lg:max-w-none lg:flex-1 lg:pb-10">
        <Topbar />
        {children}
      </div>
      <Suspense fallback={null}>
        <BottomNav />
      </Suspense>
    </div>
  );
}
