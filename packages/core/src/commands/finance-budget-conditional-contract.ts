/** Worker-facing access to existing conditional semantics. This does not register
 * a stored-event wire, admit a source, or convert TEST_ONLY input to production. */
export {
  BUDGET_DOMAIN_SCHEMAS,
  computeBudgetSourceDomain,
  parseBudgetSourcePayload,
  replayBudgetSourceDomain,
  type BudgetDomainCommand,
  type BudgetDomainEnvelope,
  type BudgetDomainIntent,
  type BudgetDomainLine,
  type BudgetDomainResult,
  type BudgetDomainState,
} from './finance-budget-source-transition.js';
