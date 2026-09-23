import { runV09DisposablePostgresEvidence } from './v09-staging-evidence-runner.mjs';

const evidence = await runV09DisposablePostgresEvidence();
console.log(JSON.stringify(evidence, null, 2));
if (evidence.status !== 'PASS') process.exitCode = 1;
