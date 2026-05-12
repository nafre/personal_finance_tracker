import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email", placeholder: "you@example.com" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        // Primary path: look up the user in the DB
        const dbUser = await db.user.findUnique({
          where: { email: credentials.email.toLowerCase() },
        });

        if (dbUser) {
          const ok = await bcrypt.compare(credentials.password, dbUser.passwordHash);
          if (!ok) return null;
          return {
            id: dbUser.id,
            email: dbUser.email,
            name: dbUser.name,
            role: dbUser.role,
            sessionVersion: dbUser.sessionVersion,
          };
        }

        // Bootstrap fallback: fires only on first login before seed has run
        const adminEmail = process.env.ADMIN_EMAIL;
        const adminPasswordHash = process.env.ADMIN_PASSWORD_HASH;
        const adminUserId = process.env.APP_USER_ID ?? "default-user";

        if (!adminEmail || !adminPasswordHash) {
          console.error("[auth] No user in DB and ADMIN_EMAIL/ADMIN_PASSWORD_HASH not set");
          return null;
        }

        if (credentials.email.toLowerCase() !== adminEmail.toLowerCase()) return null;

        const ok = await bcrypt.compare(credentials.password, adminPasswordHash);
        if (!ok) return null;

        // Auto-create the admin User so subsequent logins use the DB path
        const created = await db.user.upsert({
          where: { id: adminUserId },
          create: {
            id: adminUserId,
            email: adminEmail.toLowerCase(),
            name: "Me",
            passwordHash: adminPasswordHash,
            role: "admin",
          },
          update: {},
        });

        // Seed default categories for the bootstrap admin if not already done
        try {
          const { DEFAULT_CATEGORIES } = await import("@/lib/utils");
          await db.category.createMany({
            data: DEFAULT_CATEGORIES.map((c) => ({ ...c, userId: created.id, isDefault: true })),
            skipDuplicates: true,
          });
        } catch {
          // Non-fatal — user can manually trigger via Settings
        }

        return {
          id: created.id,
          email: created.email,
          name: created.name,
          role: created.role,
          sessionVersion: created.sessionVersion,
        };
      },
    }),
  ],
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60,
  },
  jwt: {
    maxAge: 30 * 24 * 60 * 60,
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.userId = user.id;
        token.role = (user as { role?: string }).role ?? "user";
        token.sessionVersion = (user as { sessionVersion?: number }).sessionVersion ?? 1;
      }
      return token;
    },
    session({ session, token }) {
      if (token && session.user) {
        session.user.userId = token.userId;
        session.user.role = token.role;
        session.user.sessionVersion = token.sessionVersion as number;
      }
      return session;
    },
  },
};
