import { readFile } from 'node:fs/promises';
import { consumeSocialModelCandidate } from '../../apps/world-worker/dist/preparation/social-model-candidate-consumer.js';

// Explicit repository/CI preview only. No arbitrary source paths or persistent output.
try {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== '--model-id' || !args[1])
    throw new Error('Usage: consume.mjs --model-id EXACT_CANDIDATE_ID');
  const data = new URL(
    '../../data/scenario-candidates/social-c01-independent-demand-v2/',
    import.meta.url,
  );
  const [modelOptionsJson, independentDemandJson, wageInputJson] =
    await Promise.all(
      [
        'model-options.v2.json',
        'independent-demand.v2.json',
        'wage-input.v1.json',
      ].map((name) => readFile(new URL(name, data), 'utf8')),
    );
  const result = consumeSocialModelCandidate({
    modelId: args[1],
    modelOptionsJson,
    independentDemandJson,
    wageInputJson,
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
} catch (error) {
  process.stderr.write(
    `${error instanceof Error ? error.message : 'Candidate consumption failed'}\n`,
  );
  process.exitCode = 1;
}
