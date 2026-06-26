import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Fetch all accepted friendships involving this user
    const friendships = await prisma.friendship.findMany({
      where: {
        OR: [
          { senderId: user.id },
          { receiverId: user.id }
        ],
        status: "ACCEPTED"
      },
      include: {
        sender: {
          select: { id: true, name: true, email: true, isOnline: true, oneSignalPlayerId: true }
        },
        receiver: {
          select: { id: true, name: true, email: true, isOnline: true, oneSignalPlayerId: true }
        }
      }
    });

    const friends = friendships.map((f) => {
      const friend = f.senderId === user.id ? f.receiver : f.sender;
      return {
        friendshipId: f.id,
        friend
      };
    });

    // Query last message for each friend and format response
    const chats = await Promise.all(
      friends.map(async (item) => {
        const lastMessage = await prisma.directMessage.findFirst({
          where: {
            OR: [
              { senderId: user.id, receiverId: item.friend.id },
              { senderId: item.friend.id, receiverId: user.id }
            ]
          },
          orderBy: { createdAt: "desc" }
        });

        return {
          friendshipId: item.friendshipId,
          friend: item.friend,
          lastMessage
        };
      })
    );

    // Sort: chats with recent messages first
    chats.sort((a, b) => {
      const timeA = a.lastMessage ? new Date(a.lastMessage.createdAt).getTime() : 0;
      const timeB = b.lastMessage ? new Date(b.lastMessage.createdAt).getTime() : 0;
      return timeB - timeA;
    });

    return NextResponse.json(chats);
  } catch (error) {
    console.error("GET /api/chats error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
