const READ_ONLY_COMMANDS = new Set(['--version', 'status']);

export function classifySupabaseArguments(arguments_) {
  if (arguments_.length === 1 && READ_ONLY_COMMANDS.has(arguments_[0])) {
    return { allowed: true, command: arguments_[0] };
  }

  return {
    allowed: false,
    command: arguments_.join(' ') || '(none)',
  };
}
