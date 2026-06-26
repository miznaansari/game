import { requireUser } from "@/lib/auth";
import ChatsClient from "./ChatsClient";

export const dynamic = "force-dynamic";

export default async function ChatsPage() {
  const user = await requireUser();
  return <ChatsClient user={user} />;
}
