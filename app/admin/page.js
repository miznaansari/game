import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import AdminClient from "@/components/AdminClient";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  // Ensure user is an admin
  await requireAdmin();

  // Fetch sent campaigns
  const initialCampaigns = await prisma.campaign.findMany({
    orderBy: { sentAt: "desc" },
  });

  return <AdminClient initialCampaigns={initialCampaigns} />;
}
