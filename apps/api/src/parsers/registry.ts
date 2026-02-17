/**
 * Parser registry — maps "institution-accountType" → StatementParser.
 *
 * Parsers are added as real bank PDFs are obtained and tested.
 * The upload flow looks up: `${account.institution.toLowerCase()}-${account.type}`
 */
import type { StatementParser } from './types.js';

export const parserRegistry = new Map<string, StatementParser>();

// Parsers will be registered here as they are built (Phase 2–3).
// Example (uncomment when parsers are implemented):
//
// import { DesjardinsBankParser } from './desjardins-bank.js';
// import { DesjardinsCCParser } from './desjardins-cc.js';
// import { DesjardinsSavingsParser } from './desjardins-savings.js';
//
// parserRegistry.set('desjardins-checking', new DesjardinsBankParser());
// parserRegistry.set('desjardins-credit_card', new DesjardinsCCParser());
// parserRegistry.set('desjardins-savings', new DesjardinsSavingsParser());

export function registerParser(parser: StatementParser): void {
  const key = `${parser.institution.toLowerCase()}-${parser.accountType}`;
  parserRegistry.set(key, parser);
}
