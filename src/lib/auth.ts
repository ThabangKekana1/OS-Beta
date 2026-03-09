import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import prisma from "./prisma";
import type { UserRole } from "@prisma/client";

declare module "next-auth" {
  interface User {
    id: string;
    role: UserRole;
    firstName: string;
    lastName: string;
  }
  interface Session {
    user: {
      id: string;
      email: string;
      role: UserRole;
      firstName: string;
      lastName: string;
    };
  }
}
export const { handlers, signIn, signOut, auth } = NextAuth({
  secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,
  trustHost: true,
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        try {
          const user = await prisma.user.findUnique({
            where: { email: credentials.email as string },
          });

          if (!user || user.status !== "ACTIVE") return null;

          const valid = await bcrypt.compare(
            credentials.password as string,
            user.passwordHash
          );
          if (!valid) return null;

          await prisma.user.update({
            where: { id: user.id },
            data: { lastLoginAt: new Date() },
          });

          return {
            id: user.id,
            email: user.email,
            role: user.role,
            firstName: user.firstName,
            lastName: user.lastName,
          };
        } catch (error) {
          console.error("Authentication database lookup failed.", error);
          throw error;
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id!;
        token.role = (user as { role: UserRole }).role;
        token.firstName = (user as { firstName: string }).firstName;
        token.lastName = (user as { lastName: string }).lastName;
      }
      return token;
    },
    async session({ session, token }) {
      session.user.id = token.id as string;
      session.user.role = token.role as UserRole;
      session.user.firstName = token.firstName as string;
      session.user.lastName = token.lastName as string;
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
  },
});

export async function getServerSession() {
  return auth();
}

export async function requireAuth() {
  const session = await auth();
  if (!session?.user) {
    throw new Error("Unauthorized");
  }
  return session;
}

export async function requireRole(roles: UserRole[]) {
  const session = await requireAuth();
  if (!roles.includes(session.user.role)) {
    throw new Error("Forbidden");
  }
  return session;
}
