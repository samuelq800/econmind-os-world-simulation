import { createPGliteV09AtomicTestDatabase } from '../support/v09-atomic-database.js';
import { defineDurableIntakeSuite } from '../support/f-durable-command-intake-suite.js';

defineDurableIntakeSuite('F staged intake / PGlite', () => ({
  ...createPGliteV09AtomicTestDatabase(),
  native: false,
}));
