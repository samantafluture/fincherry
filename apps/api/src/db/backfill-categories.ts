/**
 * Backfill transaction categories after taxonomy updates.
 * Safe behavior:
 * - Categorizes only currently-uncategorized transactions.
 * - Migrates legacy "Delivery" category IDs to "Food Delivery".
 */
import { eq, isNull } from 'drizzle-orm';
import { db } from './index.js';
import { categories, transactions } from './schema.js';
import {
  SYSTEM_CATEGORY_PATHS,
  inferSystemCategoryPath,
  resolveCategoryIdsByPath,
} from '../services/systemCategoryMapping.js';

async function backfillUncategorized(idByPath: Map<string, string>): Promise<Map<string, number>> {
  const uncategorized = await db.query.transactions.findMany({
    where: isNull(transactions.categoryId),
    columns: {
      id: true,
      description: true,
      amount: true,
    },
  });

  const updatesByPath = new Map<string, number>();

  for (const tx of uncategorized) {
    const amount = Number(tx.amount);
    const path = inferSystemCategoryPath(tx.description, amount);
    if (!path) continue;

    const categoryId = idByPath.get(path);
    if (!categoryId) continue;

    await db
      .update(transactions)
      .set({ categoryId })
      .where(eq(transactions.id, tx.id));

    updatesByPath.set(path, (updatesByPath.get(path) ?? 0) + 1);
  }

  return updatesByPath;
}

async function migrateLegacyDelivery(foodDeliveryId: string | null): Promise<number> {
  if (!foodDeliveryId) return 0;

  const legacyDeliveryCategories = await db.query.categories.findMany({
    where: (c, { eq }) => eq(c.name, 'Delivery'),
    columns: { id: true },
  });

  let moved = 0;

  for (const legacy of legacyDeliveryCategories) {
    if (legacy.id === foodDeliveryId) continue;

    const txRows = await db.query.transactions.findMany({
      where: eq(transactions.categoryId, legacy.id),
      columns: { id: true },
    });
    if (txRows.length === 0) continue;

    await db
      .update(transactions)
      .set({ categoryId: foodDeliveryId })
      .where(eq(transactions.categoryId, legacy.id));

    moved += txRows.length;
  }

  return moved;
}

async function remapBillPaymentsFromSavingsTransfer(
  savingsTransferId: string | null,
  creditCardPaymentId: string | null,
): Promise<number> {
  if (!savingsTransferId || !creditCardPaymentId) return 0;

  const rows = await db.query.transactions.findMany({
    where: eq(transactions.categoryId, savingsTransferId),
    columns: { id: true, description: true },
  });

  const billPaymentIds = rows
    .filter((row) =>
      /(\bbill\s+payment\b|credit\s*card\s*payment|mastercard\s*payment)/i.test(
        row.description,
      ),
    )
    .map((row) => row.id);

  for (const id of billPaymentIds) {
    await db
      .update(transactions)
      .set({ categoryId: creditCardPaymentId })
      .where(eq(transactions.id, id));
  }

  return billPaymentIds.length;
}

async function main() {
  const idByPath = await resolveCategoryIdsByPath(Object.values(SYSTEM_CATEGORY_PATHS));
  const updatesByPath = await backfillUncategorized(idByPath);
  const deliveryMoved = await migrateLegacyDelivery(
    idByPath.get(SYSTEM_CATEGORY_PATHS.foodDelivery) ?? null,
  );
  const billPaymentsRemapped = await remapBillPaymentsFromSavingsTransfer(
    idByPath.get(SYSTEM_CATEGORY_PATHS.savingsTransfer) ?? null,
    idByPath.get(SYSTEM_CATEGORY_PATHS.creditCardPayment) ?? null,
  );

  const totalInferred = Array.from(updatesByPath.values()).reduce((sum, n) => sum + n, 0);
  console.log(`✅ Backfill complete. Inferred updates: ${totalInferred}.`);
  for (const [path, count] of updatesByPath) {
    console.log(`  - ${path}: ${count}`);
  }
  if (deliveryMoved > 0) {
    console.log(`  - Delivery -> Food Delivery migrated: ${deliveryMoved}`);
  }
  if (billPaymentsRemapped > 0) {
    console.log(`  - Savings Transfer -> Credit Card Payment (bill payment rows): ${billPaymentsRemapped}`);
  }
}

main().catch((err) => {
  console.error('❌ Category backfill failed:', err);
  process.exit(1);
});
