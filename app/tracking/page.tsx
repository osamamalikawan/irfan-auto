import { redirect } from "next/navigation";
import TrackingView from "@/components/TrackingView";
import { getUser } from "@/lib/auth";
import { isDate, isUuid } from "@/lib/field";
import { hasAny } from "@/lib/permissions";

export default async function Page({ searchParams }: { searchParams: Promise<{ user?: string; date?: string }> }) {
  if (!hasAny(await getUser(), ["tracking.view"])) redirect("/dashboard");
  const sp = await searchParams;
  return <TrackingView initialUser={isUuid(sp.user) ? sp.user : undefined} initialDate={isDate(sp.date) ? sp.date : undefined} />;
}
