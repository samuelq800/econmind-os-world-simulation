if (
  process.argv.some((argument) =>
    argument.includes('node_modules/typescript/bin/tsc'),
  )
) {
  process.exit(2);
}
