import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { sendPushNotification, checkUserOnline } from "@/lib/push";

export async function POST(request) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { receiverId, mode = "BATTLE", wordCount = 5, boxRows = 4, boxCols = 4 } = await request.json();

    if (!receiverId) {
      return NextResponse.json({ error: "Receiver ID is required" }, { status: 400 });
    }

    const opponent = await prisma.user.findUnique({
      where: { id: receiverId },
    });

    if (!opponent) {
      return NextResponse.json({ error: "Opponent not found" }, { status: 404 });
    }

    // Validate custom grid dimensions for Dots & Boxes
    const cleanBoxRows = Math.min(10, Math.max(2, parseInt(boxRows) || 4));
    const cleanBoxCols = Math.min(10, Math.max(2, parseInt(boxCols) || 4));

    // Generate shuffled memory grid if MEMORY mode, or empty board if TICTACTOE
    let memoryGrid = null;
    if (mode === "MEMORY") {
      const emojis = ["🎮", "🎲", "👾", "🤖", "⚔️", "🛡️", "🔥", "💧", "⚡", "🌟", "🍀", "👑", "🍕", "🍔", "🎈"];
      const doubled = [...emojis, ...emojis];
      for (let i = doubled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [doubled[i], doubled[j]] = [doubled[j], doubled[i]];
      }
      memoryGrid = doubled;
    } else if (mode === "TICTACTOE") {
      memoryGrid = Array(9).fill("");
    } else if (mode === "WORD_GUESS") {
      memoryGrid = { wordCount };
    } else if (mode === "DOTS") {
      memoryGrid = {
        rows: cleanBoxRows,
        cols: cleanBoxCols,
        lines: {},
        boxes: {}
      };
    }

    // Create game record
    const game = await prisma.game.create({
      data: {
        player1Id: user.id,
        player2Id: receiverId,
        status: (mode === "MEMORY" || mode === "TICTACTOE" || mode === "DOTS") ? "PLAYING" : "SELECTING",
        mode,
        turn: user.id, // Player 1 starts
        ...(mode === "MEMORY" ? {
          memoryGrid,
          memoryMatched: [],
          memoryFlipped: [],
          player1Score: 0,
          player2Score: 0,
        } : {}),
        ...(mode === "TICTACTOE" ? {
          memoryGrid,
        } : {}),
        ...(mode === "WORD_GUESS" ? {
          memoryGrid,
        } : {}),
        ...(mode === "DOTS" ? {
          memoryGrid,
          player1Score: 0,
          player2Score: 0,
        } : {}),
      },
    });

    // Check if the opponent is online before sending push notification.
    // 100% online confirm: must be online in DB AND active on socket server.
    const isOnlineDb = opponent.isOnline;
    const isOnlineSocket = await checkUserOnline(opponent.id);
    const isOnline = isOnlineDb && isOnlineSocket;

    if (!isOnline) {
      let title = "1v1 Grid Battleship Invite! 🎮";
      let message = `${user.name || user.email} invited you to play a 1v1 Grid Battleship game! 🎯`;
      if (mode === "MEMORY") {
        title = "1v1 Memory Match Invite! 🧩";
        message = `${user.name || user.email} invited you to play Emoji Memory Match! 🧩`;
      } else if (mode === "TICTACTOE") {
        title = "1v1 Tic Tac Toe Invite! ❌⭕";
        message = `${user.name || user.email} invited you to play Tic Tac Toe! ❌⭕`;
      } else if (mode === "WORD_GUESS") {
        title = "1v1 Word Guess Invite! 📝";
        message = `${user.name || user.email} invited you to play ${wordCount} Word Guess! 📝`;
      } else if (mode === "DOTS") {
        title = "1v1 Dots & Boxes Invite! ❌⭕";
        message = `${user.name || user.email} invited you to play a ${cleanBoxRows}x${cleanBoxCols} Dots & Boxes game! 🎮`;
      }

      await sendPushNotification({
        externalId: opponent.id,
        playerId: opponent.oneSignalPlayerId,
        title,
        message,
        url: `/game/${game.id}`,
      });
      console.log(`Push notification sent to offline opponent ${receiverId}.`);
    } else {
      console.log(`Opponent ${receiverId} is confirmed online; skipping push notification.`);
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
