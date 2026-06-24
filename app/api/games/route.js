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

    const { receiverId } = await request.json();

    if (!receiverId) {
      return NextResponse.json({ error: "Receiver ID is required" }, { status: 400 });
    }

    const opponent = await prisma.user.findUnique({
      where: { id: receiverId },
    });

    if (!opponent) {
      return NextResponse.json({ error: "Opponent not found" }, { status: 404 });
    }

    // Create game record
    const game = await prisma.game.create({
      data: {
        player1Id: user.id,
        player2Id: receiverId,
        status: "SELECTING",
        turn: user.id, // Player 1 starts
      },
    });

    // Send push notification via OneSignal if the receiver has registered a player ID
    if (opponent.oneSignalPlayerId) {
      await sendPushNotification({
        playerId: opponent.oneSignalPlayerId,
        title: "1v1 Game Invite! 🎮",
        message: `${user.name || user.email} invited you to play a 1v1 Grid Battleship game!`,
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
