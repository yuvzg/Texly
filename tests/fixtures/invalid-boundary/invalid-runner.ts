// Deliberate architectural violation fixture for boundary testing
// compile-runner must NEVER import from packages/db
import { checkDbHealth } from '../../../packages/db/src/index.js';

export function illegalCompileOperation() {
  return checkDbHealth();
}
