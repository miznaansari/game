import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "./prisma";

export async function getSessionUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get("session_token")?.value;
  if (!token) return null;

  try {
    const session = await prisma.userSession.findUnique({
      where: { token },
      include: { user: true },
    });

    if (!session || session.expiresAt < new Date()) {
      return null;
    }
    return session.user;
  } catch (error) {
    console.error("Error fetching session user:", error);
    return null;
  }
}

export async function requireUser(redirectTo) {
  const user = await getSessionUser();
  if (!user) {
    if (redirectTo) {
      redirect(`/login?redirectTo=${encodeURIComponent(redirectTo)}`);
    } else {
      redirect("/login");
    }
  }
  return user;
}

export async function requireAdmin() {
  const user = await requireUser();
  if (user.role !== "ADMIN") {
    redirect("/");
  }
  return user;
}

export async function createSession(userId) {
  const token = Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2);
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

  await prisma.userSession.create({
    data: {
      userId,
      token,
      expiresAt,
    },
  });

  const cookieStore = await cookies();
  cookieStore.set("session_token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    expires: expiresAt,
    sameSite: "lax",
    path: "/",
  });

  return token;
}

export async function deleteSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get("session_token")?.value;
  if (token) {
    try {
      await prisma.userSession.delete({
        where: { token },
      });
    } catch (e) {
      // Ignore if session not found
    }
    cookieStore.delete("session_token");
  }
}
