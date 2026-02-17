import '@fastify/cookie';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { TRPCError } from '@trpc/server';
import { router, publicProcedure, protectedProcedure } from './trpc.js';

export const authRouter = router({
  login: publicProcedure
    .input(z.object({ passphrase: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      const storedHash = process.env.AUTH_PASSPHRASE_HASH;
      const jwtSecret = process.env.JWT_SECRET;

      if (!storedHash || !jwtSecret) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Auth not configured on server',
        });
      }

      const valid = await bcrypt.compare(input.passphrase, storedHash);
      if (!valid) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Invalid passphrase' });
      }

      const token = jwt.sign({ sub: 'sam' }, jwtSecret, { expiresIn: '30d' });

      ctx.res.setCookie('session', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 30 * 24 * 60 * 60, // 30 days in seconds
        path: '/',
      });

      return { ok: true };
    }),

  logout: publicProcedure.mutation(async ({ ctx }) => {
    ctx.res.clearCookie('session', { path: '/' });
    return { ok: true };
  }),

  verify: publicProcedure.query(async ({ ctx }) => {
    return { valid: ctx.isAuthenticated };
  }),
});
