// Shell commands that only look at things. Ducky runs these without asking; every other command asks first.
//
// The check is deliberately narrow: a known command, a known subcommand, and no shell syntax at all,
// so nothing can be chained, redirected or substituted into something that changes files.

const PLAIN_COMMANDS = new Set(["ls", "pwd", "head", "tail", "wc", "file", "stat", "tree"]);

const GIT_SUBCOMMANDS = new Set(["status", "log", "diff", "show", "ls-files", "blame", "rev-parse"]);

const GH_SUBCOMMANDS = new Map([
  ["issue", new Set(["list", "view"])],
  ["pr", new Set(["list", "view", "diff", "checks"])],
  ["repo", new Set(["view"])],
]);

// Pipes, redirects, chaining, substitution, variables, quotes and line breaks.
const SHELL_SYNTAX = /[;&|<>`$\\(){}'"!\n\r]/;

// Options that write a file or open something outside the terminal.
const RISKY_OPTION = /^(?:-o|--output(?:=.*)?|--ext-diff|--textconv|-w|--web|--editor)$/;

export function isSafeReadOnlyCommand(command: string): boolean {
  if (SHELL_SYNTAX.test(command)) {
    return false;
  }
  const [program, ...args] = command.trim().split(/\s+/);
  if (args.some((arg) => RISKY_OPTION.test(arg))) {
    return false;
  }

  if (PLAIN_COMMANDS.has(program)) {
    return true;
  }
  if (program === "git") {
    return GIT_SUBCOMMANDS.has(args[0]);
  }
  if (program === "gh") {
    return GH_SUBCOMMANDS.get(args[0])?.has(args[1]) ?? false;
  }
  return false;
}
