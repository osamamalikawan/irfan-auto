import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import BottomNav from "./BottomNav";
import { MeProvider } from "./Me";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";
import { Suspense } from "react";

/* Phone/tablet: single column + bottom nav.  Desktop (lg+): dark sidebar + top bar, like the original HTML. */
export default async function Shell({ children }: { children: React.ReactNode }) {
  const user = await getUser();
  if (!user) redirect("/login");
  if (user.mustChangePin) redirect("/change-pin");
  return (
    <MeProvider user={user}>
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
    </MeProvider>
  );
}
