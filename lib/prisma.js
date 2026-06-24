import { PrismaClient } from "@prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";

const globalForPrisma = global;

let prismaInstance;

if (typeof window === "undefined") {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    throw new Error("DATABASE_URL env variable is missing");
  }

  try {
    const parsedUrl = new URL(dbUrl);
    const adapter = new PrismaMariaDb({
      host: parsedUrl.hostname,
      port: parseInt(parsedUrl.port || "3306", 10),
      user: parsedUrl.username,
      password: decodeURIComponent(parsedUrl.password),
      database: parsedUrl.pathname.replace(/^\//, ""),
    });

    prismaInstance = new PrismaClient({
      adapter,
      log: ["query"],
    });
  } catch (error) {
    console.error("Failed to parse DATABASE_URL or initialize Prisma MariaDB adapter:", error);
    prismaInstance = new PrismaClient({
      log: ["query"],
    });
  }
} else {
  prismaInstance = new PrismaClient();
}

export const prisma = globalForPrisma.prisma || prismaInstance;

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
