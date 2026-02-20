import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { router, protectedProcedure } from './trpc.js';
import { db } from '../db/index.js';
import {
  uploads,
  transactions,
  goals,
  goalSnapshots,
  type Account,
} from '../db/schema.js';
import { parserRegistry } from '../parsers/registry.js';
import { categorizerService } from '../services/categorizer.js';
import { convertToCad } from '../services/currencyConverter.js';
import {
  SYSTEM_CATEGORY_PATHS,
  inferSystemCategoryPath,
  normalizeTransferTag,
  resolveCategoryIdsByPath,
} from '../services/systemCategoryMapping.js';
import pdfParse from 'pdf-parse';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const TS1_GOAL_NAME = 'Moving / House';
const TS2_GOAL_NAME = 'Private Health Fund';

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function normalizeDescriptionForDedupe(description: string): string {
  return description
    .replace(/\s+\(TS\s*[12]\)\s*$/i, '')
    .trim()
    .toLowerCase();
}

function parseSpacedAmount(raw: string): number {
  return Number(raw.replace(/\s+/g, '').replace(/,/g, ''));
}

function monthToNumber(month: string): number | null {
  const key = month.toLowerCase();
  const months: Record<string, number> = {
    january: 1,
    february: 2,
    march: 3,
    april: 4,
    may: 5,
    june: 6,
    july: 7,
    august: 8,
    september: 9,
    october: 10,
    november: 11,
    december: 12,
  };
  return months[key] ?? null;
}

function extractDesjardinsSavingsBalances(text: string):
  | { snapshotDate: string; ts1Balance: number; ts2Balance: number }
  | null {
  const periodMatch = text.match(
    /From\s+([A-Za-z]+)\s+\d{1,2}\s+to\s+([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})/i,
  );
  if (!periodMatch) return null;

  const endMonth = monthToNumber(periodMatch[2] ?? '');
  const endDay = Number(periodMatch[3]);
  const year = Number(periodMatch[4]);
  if (!endMonth || !endDay || !year) return null;

  const snapshotDate = `${year}-${String(endMonth).padStart(2, '0')}-${String(endDay).padStart(2, '0')}`;

  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const amountRows = lines
    .map((line) => {
      const m = line.match(
        /^(\d{1,3}(?:\s\d{3})*(?:\.\d{2})?)\s+(\d{1,3}(?:\s\d{3})*\.\d{2})$/,
      );
      if (!m) return null;
      return {
        amount: parseSpacedAmount(m[1] ?? '0'),
        balance: parseSpacedAmount(m[2] ?? '0'),
      };
    })
    .filter((row): row is { amount: number; balance: number } => row !== null);

  // Desjardins account statement structure in this project:
  // - 26 rows for PCA section (opening + 25 tx)
  // - TS1 rows are next (opening + 6 tx)
  // - TS2 rows follow; in some extracted PDFs TS2 opening line is not captured,
  //   so we use the last TS row as the final TS2 balance.
  const savingsRows = amountRows.slice(26);
  if (savingsRows.length < 13) return null;

  const ts1Balance = savingsRows[6]?.balance;
  const ts2Balance = savingsRows[savingsRows.length - 1]?.balance;
  if (ts1Balance === undefined || ts2Balance === undefined) return null;

  return { snapshotDate, ts1Balance, ts2Balance };
}

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
              .update(normalizeDescriptionForDedupe(tx.description))
              .digest('hex')}`,
        ),
      );

      const suggestions = await categorizerService.suggestBatch(
        parsed.map((p) => p.description),
      );
      const systemCategoryIdsByPath = await resolveCategoryIdsByPath(
        Object.values(SYSTEM_CATEGORY_PATHS),
      );

      return parsed.map((tx, i) => {
        const descHash = crypto
          .createHash('md5')
          .update(normalizeDescriptionForDedupe(tx.description))
          .digest('hex');
        const key = `${tx.date}|${tx.amount}|${descHash}`;
        const systemCategoryPath = inferSystemCategoryPath(tx.description, tx.amount);
        const systemCategoryId =
          (systemCategoryPath ? systemCategoryIdsByPath.get(systemCategoryPath) : null) ?? null;

        return {
          ...tx,
          isDuplicate: existingKeys.has(key),
          suggestedCategoryId: systemCategoryId ?? (suggestions[i] ?? null),
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
      const savingsBalances =
        parserKey === 'desjardins-checking'
          ? extractDesjardinsSavingsBalances(text)
          : null;

      // Category overrides map
      const overrideMap = new Map(input.categoryOverrides.map((o) => [o.index, o.categoryId]));

      const suggestions = await categorizerService.suggestBatch(
        parsed.map((p) => p.description),
      );
      const systemCategoryIdsByPath = await resolveCategoryIdsByPath(
        Object.values(SYSTEM_CATEGORY_PATHS),
      );

      const transferGoals = await db.query.goals.findMany({
        where: (g, { or, eq }) =>
          or(eq(g.name, TS1_GOAL_NAME), eq(g.name, TS2_GOAL_NAME)),
        with: {
          snapshots: {
            orderBy: (s, { desc }) => [desc(s.snapshotDate)],
            limit: 1,
          },
        },
      });

      const goalStateByTag = new Map<
        'ts1' | 'ts2',
        { id: string; name: string; targetAmount: number; currentAmount: number }
      >();

      for (const goal of transferGoals) {
        const currentAmount = Number(goal.snapshots[0]?.currentAmount ?? 0);
        const state = {
          id: goal.id,
          name: goal.name,
          targetAmount: Number(goal.targetAmount),
          currentAmount,
        };
        if (goal.name === TS1_GOAL_NAME) goalStateByTag.set('ts1', state);
        if (goal.name === TS2_GOAL_NAME) goalStateByTag.set('ts2', state);
      }

      const existing = await db.query.transactions.findMany({
        where: eq(transactions.accountId, account2.id),
      });
      const existingKeys = new Set(
        existing.map(
          (tx) =>
            `${tx.date}|${tx.amount}|${crypto
              .createHash('md5')
              .update(normalizeDescriptionForDedupe(tx.description))
              .digest('hex')}`,
        ),
      );

      let imported = 0;
      let duplicates = 0;

      for (let i = 0; i < parsed.length; i++) {
        const tx = parsed[i]!;
        const descHash = crypto
          .createHash('md5')
          .update(normalizeDescriptionForDedupe(tx.description))
          .digest('hex');

        const dedupeKey = `${tx.date}|${tx.amount}|${descHash}`;
        const isDuplicate = existingKeys.has(dedupeKey);

        if (isDuplicate && input.skipDuplicates) {
          duplicates++;
          continue;
        }

        const transferTag = normalizeTransferTag(tx.description);
        const systemCategoryPath = inferSystemCategoryPath(tx.description, tx.amount);
        const systemCategoryId =
          (systemCategoryPath ? systemCategoryIdsByPath.get(systemCategoryPath) : null) ?? null;
        const categoryId =
          overrideMap.get(i) ??
          systemCategoryId ??
          (suggestions[i] ?? null);

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

        existingKeys.add(dedupeKey);

        if (transferTag && !savingsBalances) {
          const goalState = goalStateByTag.get(transferTag);
          if (goalState) {
            goalState.currentAmount = round2(goalState.currentAmount + Math.abs(tx.amount));
            await db.insert(goalSnapshots).values({
              goalId: goalState.id,
              snapshotDate: tx.date,
              currentAmount: String(goalState.currentAmount),
              targetAmount: String(goalState.targetAmount),
              notes: `Auto transfer mapping (${transferTag.toUpperCase()})`,
            });
          }
        }

        imported++;
      }

      if (savingsBalances) {
        const snapshotEntries: Array<{ tag: 'ts1' | 'ts2'; balance: number }> = [
          { tag: 'ts1', balance: savingsBalances.ts1Balance },
          { tag: 'ts2', balance: savingsBalances.ts2Balance },
        ];

        for (const entry of snapshotEntries) {
          const goalState = goalStateByTag.get(entry.tag);
          if (!goalState) continue;

          const existingSnapshot = await db.query.goalSnapshots.findFirst({
            where: and(
              eq(goalSnapshots.goalId, goalState.id),
              eq(goalSnapshots.snapshotDate, savingsBalances.snapshotDate),
            ),
          });

          if (existingSnapshot) {
            await db
              .update(goalSnapshots)
              .set({
                currentAmount: String(entry.balance),
                targetAmount: String(goalState.targetAmount),
                notes: `Auto from Desjardins savings table (${entry.tag.toUpperCase()})`,
              })
              .where(eq(goalSnapshots.id, existingSnapshot.id));
          } else {
            await db.insert(goalSnapshots).values({
              goalId: goalState.id,
              snapshotDate: savingsBalances.snapshotDate,
              currentAmount: String(entry.balance),
              targetAmount: String(goalState.targetAmount),
              notes: `Auto from Desjardins savings table (${entry.tag.toUpperCase()})`,
            });
          }
        }
      }

      await db
        .update(uploads)
        .set({ status: 'parsed', transactionsCount: imported })
        .where(eq(uploads.id, input.uploadId));

      return { imported, duplicates };
    }),
});
