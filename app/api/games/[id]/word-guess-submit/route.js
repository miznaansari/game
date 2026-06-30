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

    // Check if both players have now submitted their selections
    const hasPlayer1Submitted = isPlayer1 ? true : !!game.player1Selections;
    const hasPlayer2Submitted = isPlayer2 ? true : !!game.player2Selections;

    if (hasPlayer1Submitted && hasPlayer2Submitted) {
      // Transition to PLAYING
      updateData.status = "PLAYING";
      
      // Initialize guesses objects
      let wordCount = 5;
      if (game.memoryGrid) {
        try {
          const grid = typeof game.memoryGrid === 'string' ? JSON.parse(game.memoryGrid) : game.memoryGrid;
          if (grid && grid.wordCount) {
            wordCount = grid.wordCount;
          }
        } catch (e) {
          // Fallback
        }
      }
      
      updateData.player1Guesses = {
        correct: [],
        revealedLetters: Array(wordCount).fill(1)
      };
      updateData.player2Guesses = {
        correct: [],
        revealedLetters: Array(wordCount).fill(1)
      };
    }

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
