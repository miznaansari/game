import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import GameClient from "@/components/GameClient";

export const dynamic = "force-dynamic";

export default async function GamePage({ params }) {
  const { id } = await params;
  
  if (!id) {
    redirect("/");
  }

  const user = await requireUser(`/game/${id}`);

  const game = await prisma.game.findUnique({
    where: { id },
    include: {
      player1: { select: { id: true, name: true, email: true } },
      player2: { select: { id: true, name: true, email: true } },
      winner: { select: { id: true, name: true, email: true } },
    },
  });

  if (!game) {
    redirect("/");
  }

  // Authorize player participation
  if (game.player1Id !== user.id && game.player2Id !== user.id) {
    redirect("/");
  }

  // Fetch previous messages
  const initialMessages = await prisma.chatMessage.findMany({
    where: { gameId: id },
    include: {
      sender: { select: { name: true, email: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  return (
    <GameClient
      game={game}
      user={user}
      initialMessages={initialMessages}
    />
  );
}
