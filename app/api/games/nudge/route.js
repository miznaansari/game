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

    const { gameId } = await request.json();
    if (!gameId) {
      return NextResponse.json({ error: "Game ID is required" }, { status: 400 });
    }

    const game = await prisma.game.findUnique({
      where: { id: gameId },
      include: {
        player1: true,
        player2: true,
      },
    });

    if (!game) {
      return NextResponse.json({ error: "Game not found" }, { status: 404 });
    }

    const isPlayer1 = game.player1Id === user.id;
    const isPlayer2 = game.player2Id === user.id;

    if (!isPlayer1 && !isPlayer2) {
      return NextResponse.json({ error: "Not authorized to access this game" }, { status: 403 });
    }

    const opponent = isPlayer1 ? game.player2 : game.player1;
    const senderName = user.name || user.email.split("@")[0];
    const modeText = game.mode === "MEMORY" ? "Emoji Memory Match" : "Grid Battleship";

    // Primary: target by opponent's DB user ID (external_id linked via OneSignal.login())
    // Fallback: target by stored subscription UUID if external_id targeting fails
    const result = await sendPushNotification({
      externalId: opponent.id,              // preferred — works if user called OneSignal.login()
      playerId: opponent.oneSignalPlayerId, // fallback — legacy subscription UUID
      title: "I am waiting! Come back 🎮",
      message: `${senderName} is waiting for you in our ${modeText} match!`,
      url: `/game/${game.id}`,
    });

    if (result.success) {
      return NextResponse.json({ success: true, message: "Push notification sent successfully" });
    }

    return NextResponse.json({
      success: false,
      reason: "push_failed",
      message: result.error || "Failed to send push notification",
    });
  } catch (error) {
    console.error("Nudge error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
