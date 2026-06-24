import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { sendPushNotification } from "@/lib/push";

export async function POST(request) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { receiverId, mode = "BATTLE" } = await request.json();

    if (!receiverId) {
      return NextResponse.json({ error: "Receiver ID is required" }, { status: 400 });
    }

    const opponent = await prisma.user.findUnique({
      where: { id: receiverId },
    });

    if (!opponent) {
      return NextResponse.json({ error: "Opponent not found" }, { status: 404 });
    }

    // Generate shuffled memory grid if MEMORY mode
    let memoryGrid = null;
    if (mode === "MEMORY") {
      const emojis = ["🎮", "🎲", "👾", "🤖", "⚔️", "🛡️", "🔥", "💧", "⚡", "🌟", "🍀", "👑", "🍕", "🍔", "🎈"];
      const doubled = [...emojis, ...emojis];
      for (let i = doubled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [doubled[i], doubled[j]] = [doubled[j], doubled[i]];
      }
      memoryGrid = doubled;
    }

    // Create game record
    const game = await prisma.game.create({
      data: {
        player1Id: user.id,
        player2Id: receiverId,
        status: mode === "MEMORY" ? "PLAYING" : "SELECTING",
        mode,
        turn: user.id, // Player 1 starts
        ...(mode === "MEMORY" ? {
          memoryGrid,
          memoryMatched: [],
          memoryFlipped: [],
          player1Score: 0,
          player2Score: 0,
        } : {}),
      },
    });

    // Send push notification via OneSignal if the receiver has registered a player ID
    if (opponent.oneSignalPlayerId) {
      await sendPushNotification({
        playerId: opponent.oneSignalPlayerId,
        title: mode === "MEMORY" ? "1v1 Memory Match Invite! 🧩" : "1v1 Grid Battleship Invite! 🎮",
        message: mode === "MEMORY"
          ? `${user.name || user.email} invited you to play Emoji Memory Match! 🧩`
          : `${user.name || user.email} invited you to play a 1v1 Grid Battleship game! 🎯`,
        url: `/game/${game.id}`,
      });
    } else {
      console.log(`Opponent ${receiverId} does not have a OneSignal player ID registered. Skipped push.`);
    }

    return NextResponse.json({
      message: "Game invitation created",
      gameId: game.id,
    });
  } catch (error) {
    console.error("Create game invitation error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
