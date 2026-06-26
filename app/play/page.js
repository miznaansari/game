import { requireUser } from "@/lib/auth";
import DashboardClient from "@/components/DashboardClient";

export const dynamic = "force-dynamic";

export default async function PlayPage() {
  const user = await requireUser();

  return <DashboardClient user={user} defaultTab="friends" />;
}
