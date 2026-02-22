/**
 * Parser registry — maps "institution-accountType" → StatementParser.
 *
 * Parsers are added as real bank PDFs are obtained and tested.
 * The upload flow looks up: `${account.institution.toLowerCase()}-${account.type}`
 */
import type { StatementParser } from './types.js';
import { DesjardinsCheckingParser } from './desjardins-checking.js';
import { DesjardinsCreditCardParser } from './desjardins-credit-card.js';
import { ItauCheckingParser } from './itau-checking.js';
import { ItauCreditCardParser } from './itau-credit-card.js';
import { N26CheckingParser } from './n26-checking.js';
import { ScotiabankCreditCardParser } from './scotiabank-credit-card.js';

export const parserRegistry = new Map<string, StatementParser>();

parserRegistry.set('desjardins-checking', new DesjardinsCheckingParser());
parserRegistry.set('desjardins-credit_card', new DesjardinsCreditCardParser());
parserRegistry.set('n26-checking', new N26CheckingParser());
parserRegistry.set('scotiabank-credit_card', new ScotiabankCreditCardParser());
parserRegistry.set('itaú-checking', new ItauCheckingParser());
parserRegistry.set('itaú-credit_card', new ItauCreditCardParser());
// ASCII aliases in case an account institution is entered without accent.
parserRegistry.set('itau-checking', new ItauCheckingParser());
parserRegistry.set('itau-credit_card', new ItauCreditCardParser());

export function registerParser(parser: StatementParser): void {
  const key = `${parser.institution.toLowerCase()}-${parser.accountType}`;
  parserRegistry.set(key, parser);
}
