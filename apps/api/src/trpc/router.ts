import { router } from './trpc.js';
import { authRouter } from './auth.js';
import { accountsRouter } from './accounts.js';
import { transactionsRouter } from './transactions.js';
import { uploadsRouter } from './uploads.js';
import { categoriesRouter } from './categories.js';
import { goalsRouter } from './goals.js';
import { analyticsRouter } from './analytics.js';
import { aiRouter } from './ai.js';
import { exchangeRatesRouter } from './exchangeRates.js';

export const appRouter = router({
  auth: authRouter,
  accounts: accountsRouter,
  transactions: transactionsRouter,
  uploads: uploadsRouter,
  categories: categoriesRouter,
  goals: goalsRouter,
  analytics: analyticsRouter,
  ai: aiRouter,
  exchangeRates: exchangeRatesRouter,
});

// Export type for frontend consumption — the ONLY import the web app needs
export type AppRouter = typeof appRouter;
