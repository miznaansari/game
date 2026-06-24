import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";

// Fetch current user's friendships (sent pending, received pending, accepted)
export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const friendships = await prisma.friendship.findMany({
      where: {
        OR: [
          { senderId: user.id },
          { receiverId: user.id },
        ],
      },
      include: {
        sender: {
          select: { id: true, name: true, email: true, oneSignalPlayerId: true },
        },
        receiver: {
          select: { id: true, name: true, email: true, oneSignalPlayerId: true },
        },
      },
    });

    const pendingSent = [];
    const pendingReceived = [];
    const accepted = [];

    friendships.forEach((f) => {
      if (f.status === "ACCEPTED") {
        const friend = f.senderId === user.id ? f.receiver : f.sender;
        accepted.push({
          friendshipId: f.id,
          friend,
        });
      } else if (f.status === "PENDING") {
        if (f.senderId === user.id) {
          pendingSent.push({
            friendshipId: f.id,
            receiver: f.receiver,
          });
        } else {
          pendingReceived.push({
            friendshipId: f.id,
            sender: f.sender,
          });
        }
      }
    });

    return NextResponse.json({
      pendingSent,
      pendingReceived,
      accepted,
    });
  } catch (error) {
    console.error("Fetch friends error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// Send a friend request by email
export async function POST(request) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { email } = await request.json();

    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    if (email.toLowerCase() === user.email.toLowerCase()) {
      return NextResponse.json({ error: "You cannot add yourself as a friend" }, { status: 400 });
    }

    const targetUser = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (!targetUser) {
      return NextResponse.json({ error: "User with this email not found" }, { status: 404 });
    }

    // Check if friendship already exists
    const existing = await prisma.friendship.findFirst({
      where: {
        OR: [
          { senderId: user.id, receiverId: targetUser.id },
          { senderId: targetUser.id, receiverId: user.id },
        ],
      },
    });

    if (existing) {
      if (existing.status === "ACCEPTED") {
        return NextResponse.json({ error: "You are already friends with this user" }, { status: 400 });
      } else if (existing.senderId === user.id) {
        return NextResponse.json({ error: "You have already sent a friend request to this user" }, { status: 400 });
      } else {
        return NextResponse.json({ error: "This user has already sent a friend request to you" }, { status: 400 });
      }
    }

    const friendship = await prisma.friendship.create({
      data: {
        senderId: user.id,
        receiverId: targetUser.id,
        status: "PENDING",
      },
    });

    return NextResponse.json({
      message: "Friend request sent successfully",
      friendship,
    });
  } catch (error) {
    console.error("Send friend request error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
