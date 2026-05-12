import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface User {
    id: string;
    role?: string;
    sessionVersion?: number;
  }

  interface Session {
    user: {
      userId: string;
      role: string;
      sessionVersion?: number;
      email?: string | null;
      name?: string | null;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    userId: string;
    role: string;
    sessionVersion?: number;
  }
}
