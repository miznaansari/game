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

    return NextResponse.json(messages);
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
