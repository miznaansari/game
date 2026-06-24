import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { createSession } from "@/lib/auth";
import { sendVerificationEmail } from "@/lib/mail";

export async function POST(request) {
  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required" },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user || !user.password) {
      return NextResponse.json(
        { error: "Invalid email or password" },
        { status: 400 }
      );
    }

    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      return NextResponse.json(
        { error: "Invalid email or password" },
        { status: 400 }
      );
    }

    if (!user.isEmailVerified) {
      // Re-send verification email for convenience
      const token = Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2);
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

      // Upsert verification token (or create a new one)
      await prisma.verificationToken.upsert({
        where: { token },
        update: { expiresAt },
        create: { email, token, expiresAt },
      }).catch(() => {});

      await sendVerificationEmail(email, token);

      return NextResponse.json(
        { error: "Email is not verified. We sent a new verification link to your inbox." },
        { status: 403 }
      );
    }

    // Create session and set cookie
    await createSession(user.id);

    return NextResponse.json({
      message: "Login successful",
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
