import { requireUser } from "@/lib/auth";
import ChatWindowClient from "./ChatWindowClient";

export const dynamic = "force-dynamic";

export default async function ChatWindowPage({ params }) {
  const user = await requireUser();
  const { userId } = await params;
  
  return <ChatWindowClient user={user} recipientId={userId} />;
}
