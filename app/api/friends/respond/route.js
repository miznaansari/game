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

    const { friendshipId, action } = await request.json();

    if (!friendshipId || !action) {
      return NextResponse.json({ error: "Friendship ID and action are required" }, { status: 400 });
    }

    const friendship = await prisma.friendship.findUnique({
      where: { id: friendshipId },
      include: {
        sender: true,
        receiver: true,
      },
    });

    if (!friendship) {
      return NextResponse.json({ error: "Friendship request not found" }, { status: 404 });
    }

    // Ensure the current user is the receiver of the request
    if (friendship.receiverId !== user.id) {
      return NextResponse.json({ error: "Unauthorized to respond to this request" }, { status: 403 });
    }

    if (action === "ACCEPT") {
      const updated = await prisma.friendship.update({
        where: { id: friendshipId },
        data: { status: "ACCEPTED" },
      });

      // Send push notification to the sender that their friend request was accepted
      await sendPushNotification({
        externalId: friendship.sender.id,
        playerId: friendship.sender.oneSignalPlayerId,
        title: "Friend Request Accepted! 🎉",
        message: `${friendship.receiver.name || friendship.receiver.email} accepted your friend request!`,
        url: `/`, // Link to dashboard
      });

      return NextResponse.json({ message: "Friend request accepted", friendship: updated });
    } else if (action === "DECLINE") {
      await prisma.friendship.delete({
        where: { id: friendshipId },
      });
      return NextResponse.json({ message: "Friend request declined" });
    } else {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }
  } catch (error) {
    console.error("Respond to friend request error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
