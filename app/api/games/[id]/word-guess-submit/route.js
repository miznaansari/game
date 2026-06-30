import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";

export async function POST(request, { params }) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const { words, connection } = await request.json();

    if (!Array.isArray(words) || words.length === 0 || !connection) {
      return NextResponse.json({ error: "Words and connection are required" }, { status: 400 });
    }

    const game = await prisma.game.findUnique({
      where: { id },
    });

    if (!game) {
      return NextResponse.json({ error: "Game not found" }, { status: 404 });
    }

    const isPlayer1 = game.player1Id === user.id;
    const isPlayer2 = game.player2Id === user.id;

    if (!isPlayer1 && !isPlayer2) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const selectionData = {
      words: words.map(w => w.trim().toLowerCase()),
      connection: connection.trim()
    };

    let updateData = {};
    if (isPlayer1) {
      updateData.player1Selections = selectionData;
    } else {
      updateData.player2Selections = selectionData;
    }

    // Do not automatically transition to PLAYING. That will be done when they click Start Game.

    const updatedGame = await prisma.game.update({
      where: { id: id },
      data: updateData,
      include: {
        player1: { select: { id: true, name: true, email: true } },
        player2: { select: { id: true, name: true, email: true } },
        winner: { select: { id: true, name: true, email: true } },
      }
    });

    return NextResponse.json({ success: true, game: updatedGame });
  } catch (error) {
    console.error("Word guess submit error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
