import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { sendPushNotification, checkUserOnline } from "@/lib/push";

export const dynamic = "force-dynamic";

// GET message history
export async function GET(request, { params }) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { userId } = await params;

    // Check that they are accepted friends
    const friendship = await prisma.friendship.findFirst({
      where: {
        OR: [
          { senderId: user.id, receiverId: userId },
          { senderId: userId, receiverId: user.id }
        ],
        status: "ACCEPTED"
      }
    });

    if (!friendship) {
      return NextResponse.json({ error: "You can only chat with accepted friends" }, { status: 403 });
    }

    const messages = await prisma.directMessage.findMany({
      where: {
        OR: [
          { senderId: user.id, receiverId: userId },
          { senderId: userId, receiverId: user.id }
        ]
      },
      orderBy: { createdAt: "asc" }
    });

    // Fetch game details for invite messages to determine status and winner
    const inviteGameIds = messages
      .filter((m) => m.isGameInvite && m.inviteGameId)
      .map((m) => m.inviteGameId);

    let gamesMap = {};
    if (inviteGameIds.length > 0) {
      const games = await prisma.game.findMany({
        where: { id: { in: inviteGameIds } },
        select: {
          id: true,
          status: true,
          winnerId: true,
          player1Id: true,
          player2Id: true,
          winner: {
            select: { id: true, name: true, email: true }
          },
          player1: {
            select: { id: true, name: true, email: true }
          },
          player2: {
            select: { id: true, name: true, email: true }
          }
        }
      });
      games.forEach((game) => {
        gamesMap[game.id] = game;
      });
    }

    // Attach game details to messages
    const enrichedMessages = messages.map((m) => {
      if (m.isGameInvite && m.inviteGameId && gamesMap[m.inviteGameId]) {
        return {
          ...m,
          game: gamesMap[m.inviteGameId]
        };
      }
      return m;
    });

    return NextResponse.json(enrichedMessages);
  } catch (error) {
    console.error("GET /api/chats/[userId] error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST new direct message
export async function POST(request, { params }) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { userId } = await params;
    const { content, isGameInvite = false, inviteGameId = null, inviteMode = null } = await request.json();

    if (!content && !isGameInvite) {
      return NextResponse.json({ error: "Content is required" }, { status: 400 });
    }

    // Check that they are accepted friends
    const friendship = await prisma.friendship.findFirst({
      where: {
        OR: [
          { senderId: user.id, receiverId: userId },
          { senderId: userId, receiverId: user.id }
        ],
        status: "ACCEPTED"
      }
    });

    if (!friendship) {
      return NextResponse.json({ error: "You can only chat with accepted friends" }, { status: 403 });
    }

    // Create the message
    const message = await prisma.directMessage.create({
      data: {
        senderId: user.id,
        receiverId: userId,
        content: content || (isGameInvite ? "Challenged you to a match!" : ""),
        isGameInvite,
        inviteGameId,
        inviteMode
      },
      include: {
        sender: {
          select: { name: true, email: true }
        }
      }
    });

    // Check if receiver is online (DB status + socket check)
    const recipient = await prisma.user.findUnique({
      where: { id: userId },
      select: { isOnline: true, oneSignalPlayerId: true }
    });

    const isOnlineDb = recipient?.isOnline || false;
    const isOnlineSocket = await checkUserOnline(userId);
    const isOnline = isOnlineDb && isOnlineSocket;

    // Send push notification if recipient is offline
    if (!isOnline && recipient) {
      const senderName = user.name || user.email.split("@")[0];
      await sendPushNotification({
        externalId: userId,
        playerId: recipient.oneSignalPlayerId,
        title: isGameInvite ? `Game challenge from ${senderName} 🎮` : `New message from ${senderName} 💬`,
        message: isGameInvite ? `${senderName} challenged you to a game!` : content,
        url: `/chats/${user.id}`,
      });
      console.log(`Push notification sent to offline chat recipient ${userId}.`);
    }

    return NextResponse.json(message);
  } catch (error) {
    console.error("POST /api/chats/[userId] error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
