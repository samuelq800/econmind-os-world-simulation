const serviceLauncher = process.argv.some((argument) =>
  argument.endsWith('scripts/run-development-service.mjs'),
);
const service = serviceLauncher ? process.argv.at(-1) : undefined;

if (
  service !== undefined &&
  service === process.env.TEST_BOOTSTRAP_FAIL_SERVICE
) {
  process.exit(73);
}

if (
  service !== undefined &&
  service === process.env.TEST_BOOTSTRAP_DELAY_SERVICE
) {
  const delayMs = Number(process.env.TEST_BOOTSTRAP_DELAY_MS ?? '5000');
  await new Promise((resolve) => setTimeout(resolve, delayMs));
}
