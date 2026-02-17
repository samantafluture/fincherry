import '@fastify/cookie';
import type { FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';

export interface Context {
  req: FastifyRequest;
  res: FastifyReply;
  isAuthenticated: boolean;
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

  if (token) {
    try {
      const secret = process.env.JWT_SECRET;
      if (!secret) throw new Error('JWT_SECRET not set');
      jwt.verify(token, secret);
      isAuthenticated = true;
    } catch {
      // Invalid or expired token — treat as unauthenticated
    }
  }

  return { req, res, isAuthenticated };
}
