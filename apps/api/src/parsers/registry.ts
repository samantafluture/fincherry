/**
 * Parser registry — maps "institution-accountType" → StatementParser.
 *
 * Parsers are added as real bank PDFs are obtained and tested.
 * The upload flow looks up: `${account.institution.toLowerCase()}-${account.type}`
 */
import type { StatementParser } from './types.js';
import { DesjardinsCheckingParser } from './desjardins-checking.js';
import { DesjardinsCreditCardParser } from './desjardins-credit-card.js';

export const parserRegistry = new Map<string, StatementParser>();

parserRegistry.set('desjardins-checking', new DesjardinsCheckingParser());
parserRegistry.set('desjardins-credit_card', new DesjardinsCreditCardParser());

export function registerParser(parser: StatementParser): void {
  const key = `${parser.institution.toLowerCase()}-${parser.accountType}`;
  parserRegistry.set(key, parser);
}
