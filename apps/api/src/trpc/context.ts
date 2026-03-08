import '@fastify/cookie';
import type { FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';

export type Role = 'admin' | 'partner';

export interface Context {
  req: FastifyRequest;
  res: FastifyReply;
  isAuthenticated: boolean;
  role: Role | null;
}

export async function createContext({
  req,
  res,
}: {
  req: FastifyRequest;
  res: FastifyReply;
}): Promise<Context> {
  const token = req.cookies?.session;
  let isAuthenticated = false;
  let role: Role | null = null;

  if (token) {
    try {
      const secret = process.env.JWT_SECRET;
      if (!secret) throw new Error('JWT_SECRET not set');
      const payload = jwt.verify(token, secret) as { sub?: string };
      isAuthenticated = true;
      role = payload.sub === 'partner' ? 'partner' : 'admin';
    } catch {
      // Invalid or expired token — treat as unauthenticated
    }
  }

  return { req, res, isAuthenticated, role };
}
