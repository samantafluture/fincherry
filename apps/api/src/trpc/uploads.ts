import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { router, protectedProcedure } from './trpc.js';
import { db } from '../db/index.js';
import { uploads, transactions, type Account } from '../db/schema.js';
import { parserRegistry } from '../parsers/registry.js';
import { categorizerService } from '../services/categorizer.js';
import { convertToCad } from '../services/currencyConverter.js';
import pdfParse from 'pdf-parse';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export const uploadsRouter = router({
  list: protectedProcedure.query(async () => {
    return db.query.uploads.findMany({
      with: { account: true },
      orderBy: (u, { desc }) => [desc(u.uploadedAt)],
    });
  }),

  preview: protectedProcedure
    .input(z.object({ uploadId: z.string().uuid() }))
    .query(async ({ input }) => {
      const upload = await db.query.uploads.findFirst({
        where: eq(uploads.id, input.uploadId),
        with: { account: true },
      });

      if (!upload || !upload.account) {
        throw new Error('Upload not found');
      }

      const account = upload.account as Account;

      const filePath = path.join(
        process.env.UPLOADS_DIR ?? './uploads',
        upload.filename,
      );

      const pdfBuffer = fs.readFileSync(filePath);
      const { text } = await pdfParse(pdfBuffer);

      // Determine parser from institution + account type
      const parserKey = `${account.institution.toLowerCase()}-${account.type}`;
      const parser = parserRegistry.get(parserKey);

      if (!parser) {
        throw new Error(
          `No parser registered for: ${parserKey}. ` +
            `Available: ${Array.from(parserRegistry.keys()).join(', ')}`,
        );
      }

      const parsed = parser.parse(text);

      // Duplicate detection: check against existing transactions
      const existing = await db.query.transactions.findMany({
        where: eq(transactions.accountId, account.id),
      });

      const existingKeys = new Set(
        existing.map(
          (tx) =>
            `${tx.date}|${tx.amount}|${crypto
              .createHash('md5')
              .update(tx.description.trim().toLowerCase())
              .digest('hex')}`,
        ),
      );

      const suggestions = await categorizerService.suggestBatch(
        parsed.map((p) => p.description),
      );

      return parsed.map((tx, i) => {
        const descHash = crypto
          .createHash('md5')
          .update(tx.description.trim().toLowerCase())
          .digest('hex');
        const key = `${tx.date}|${tx.amount}|${descHash}`;
        return {
          ...tx,
          isDuplicate: existingKeys.has(key),
          suggestedCategoryId: suggestions[i] ?? null,
        };
      });
    }),

  confirm: protectedProcedure
    .input(
      z.object({
        uploadId: z.string().uuid(),
        // Optional overrides: user may have changed categories in the preview
        categoryOverrides: z
          .array(z.object({ index: z.number(), categoryId: z.string().uuid() }))
          .default([]),
        skipDuplicates: z.boolean().default(true),
      }),
    )
    .mutation(async ({ input }) => {
      const upload = await db.query.uploads.findFirst({
        where: eq(uploads.id, input.uploadId),
        with: { account: true },
      });

      if (!upload || !upload.account) {
        throw new Error('Upload not found');
      }

      const account2 = upload.account as Account;

      // Re-parse (same as preview)
      const filePath = path.join(
        process.env.UPLOADS_DIR ?? './uploads',
        upload.filename,
      );
      const pdfBuffer = fs.readFileSync(filePath);
      const { text } = await pdfParse(pdfBuffer);

      const parserKey = `${account2.institution.toLowerCase()}-${account2.type}`;
      const parser = parserRegistry.get(parserKey);
      if (!parser) throw new Error(`No parser for: ${parserKey}`);

      const parsed = parser.parse(text);

      // Category overrides map
      const overrideMap = new Map(input.categoryOverrides.map((o) => [o.index, o.categoryId]));

      const suggestions = await categorizerService.suggestBatch(
        parsed.map((p) => p.description),
      );

      let imported = 0;
      let duplicates = 0;

      for (let i = 0; i < parsed.length; i++) {
        const tx = parsed[i]!;
        const descHash = crypto
          .createHash('md5')
          .update(tx.description.trim().toLowerCase())
          .digest('hex');

        // Duplicate check
        const existing = await db.query.transactions.findMany({
          where: eq(transactions.accountId, account2.id),
        });
        const isDuplicate = existing.some(
          (e) =>
            e.date === tx.date &&
            e.amount === String(tx.amount) &&
            crypto
              .createHash('md5')
              .update(e.description.trim().toLowerCase())
              .digest('hex') === descHash,
        );

        if (isDuplicate && input.skipDuplicates) {
          duplicates++;
          continue;
        }

        const categoryId = overrideMap.get(i) ?? suggestions[i] ?? null;

        // Convert to CAD
        const { amountCad, rate } = await convertToCad(
          tx.amount,
          tx.currency,
          tx.date,
        );

        await db.insert(transactions).values({
          accountId: account2.id,
          date: tx.date,
          description: tx.description,
          amount: String(tx.amount),
          currency: tx.currency,
          amountCad: String(amountCad),
          exchangeRate: rate ? String(rate) : null,
          categoryId,
          sourceFile: upload.filename,
          uploadId: upload.id,
        });

        imported++;
      }

      await db
        .update(uploads)
        .set({ status: 'parsed', transactionsCount: imported })
        .where(eq(uploads.id, input.uploadId));

      return { imported, duplicates };
    }),
});
