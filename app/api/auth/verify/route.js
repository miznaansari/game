import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createSession } from "@/lib/auth";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token");

  if (!token) {
    return NextResponse.redirect(new URL("/login?error=missing_token", request.url));
  }

  try {
    const verification = await prisma.verificationToken.findUnique({
      where: { token },
    });

    if (!verification || verification.expiresAt < new Date()) {
      return NextResponse.redirect(new URL("/login?error=expired_token", request.url));
    }

    const user = await prisma.user.findUnique({
      where: { email: verification.email },
    });

    if (!user) {
      return NextResponse.redirect(new URL("/login?error=user_not_found", request.url));
    }

    // Mark email as verified
    await prisma.user.update({
      where: { id: user.id },
      data: { isEmailVerified: true },
    });

    // Clean up the verification token
    await prisma.verificationToken.delete({
      where: { token },
    }).catch(() => {});

    // Create session and set cookie
    await createSession(user.id);

    // Redirect to home/dashboard
    return NextResponse.redirect(new URL("/", request.url));
  } catch (error) {
    console.error("Verification error:", error);
    return NextResponse.redirect(new URL("/login?error=internal_error", request.url));
  }
}
