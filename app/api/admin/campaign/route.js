import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { sendPushNotification } from "@/lib/push";

// Fetch sent campaigns list
export async function GET() {
  try {
    const admin = await getSessionUser(); // Authenticate admin
    if (!admin || admin.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const campaigns = await prisma.campaign.findMany({
      orderBy: { sentAt: "desc" },
    });

    return NextResponse.json(campaigns);
  } catch (error) {
    console.error("Fetch campaigns error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// Send a push campaign to all players
export async function POST(request) {
  try {
    const admin = await getSessionUser(); // Authenticate admin
    if (!admin || admin.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { title, message } = await request.json();

    if (!title || !message) {
      return NextResponse.json(
        { error: "Title and message are required" },
        { status: 400 }
      );
    }

    // Save campaign record in DB
    const campaign = await prisma.campaign.create({
      data: { title, message },
    });

    // Send push notification broadcast to all subscribers
    const pushResult = await sendPushNotification({
      title,
      message,
      url: "/", // Clicking the notification opens the dashboard lobby
    });

    return NextResponse.json({
      message: "Push campaign successfully sent to all players!",
      campaign,
      pushResult,
    });
  } catch (error) {
    console.error("Create campaign push error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
