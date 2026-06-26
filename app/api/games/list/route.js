import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";

export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const games = await prisma.game.findMany({
      where: {
        OR: [
          { player1Id: user.id },
          { player2Id: user.id },
        ],
      },
      select: {
        id: true,
        player1Id: true,
        player2Id: true,
        mode: true,
        status: true,
        turn: true,
        winnerId: true,
        updatedAt: true,
        createdAt: true,
        player1: {
          select: { id: true, name: true, email: true },
        },
        player2: {
          select: { id: true, name: true, email: true },
        },
        winner: {
          select: { id: true, name: true, email: true },
        },
      },
      orderBy: {
        updatedAt: "desc",
      },
    });

    const activeGames = games.filter((g) => g.status !== "FINISHED");
    const pastGames = games.filter((g) => g.status === "FINISHED");

    return NextResponse.json({
      activeGames,
      pastGames,
    });
  } catch (error) {
    console.error("Fetch games list error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
