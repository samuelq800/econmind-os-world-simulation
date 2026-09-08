const expectedNode = 'v24.20.0';
const expectedPnpm = '12.3.4';
const userAgent = process.env.npm_config_user_agent ?? '';
const pnpmMatch = /^pnpm\/([^\s]+)/u.exec(userAgent);

const problems = [];

if (process.version !== expectedNode) {
  problems.push(`Node ${expectedNode} required; received ${process.version}`);
}

if (pnpmMatch?.[1] !== expectedPnpm) {
  problems.push(
    `pnpm ${expectedPnpm} required; received ${pnpmMatch?.[1] ?? 'unknown package manager'}`,
  );
}

if (problems.length > 0) {
  console.error(['Toolchain verification failed:', ...problems].join('\n- '));
  process.exit(1);
}

console.log(
  `Toolchain verified: Node ${process.version}, pnpm ${expectedPnpm}`,
);
