import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";

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

        const adminEmail = process.env.ADMIN_EMAIL;
        const adminPasswordHash = process.env.ADMIN_PASSWORD_HASH;

        if (!adminEmail || !adminPasswordHash) {
          console.error("ADMIN_EMAIL or ADMIN_PASSWORD_HASH not configured in env");
          return null;
        }

        if (credentials.email.toLowerCase() !== adminEmail.toLowerCase()) {
          return null;
        }

        const isValid = await bcrypt.compare(
          credentials.password,
          adminPasswordHash
        );

        if (!isValid) return null;

        return {
          id: process.env.APP_USER_ID ?? "default-user",
          email: adminEmail,
          name: "Me",
        };
      },
    }),
  ],
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 days
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
      }
      return token;
    },
    session({ session, token }) {
      if (token && session.user) {
        // userId is declared in types/next-auth.d.ts
        session.user.userId = token.userId;
      }
      return session;
    },
  },
};
