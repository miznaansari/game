import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createSession } from "@/lib/auth";

export async function POST(request) {
  try {
    const { email, name, photoURL } = await request.json();

    if (!email) {
      return NextResponse.json(
        { error: "Email is required for Google Sign-In" },
        { status: 400 }
      );
    }

    let user = await prisma.user.findUnique({
      where: { email },
    });

    if (user) {
      // User exists. Ensure their email is marked verified since they signed in via Google
      if (!user.isEmailVerified) {
        user = await prisma.user.update({
          where: { id: user.id },
          data: { isEmailVerified: true },
        });
      }
    } else {
      // Create a new user with Google details
      user = await prisma.user.create({
        data: {
          email,
          name: name || email.split("@")[0],
          isEmailVerified: true,
        },
      });
    }

    // Create session and set cookie
    await createSession(user.id);

    return NextResponse.json({
      message: "Google login successful",
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("Google Auth error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
