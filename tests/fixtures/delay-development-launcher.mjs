if (
  process.argv.some((argument) =>
    argument.endsWith('scripts/run-development-service.mjs'),
  )
) {
  await new Promise((resolve) => setTimeout(resolve, 500));
}
