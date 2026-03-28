import * as childProcess from 'child_process';
import { AppError } from '@shared/types';

export type ExecCliOptions = {
  cwd?: string;
  timeout?: number;
  /** If the CLI exits non-zero but output matches this pattern, treat as success */
  successPattern?: string;
};

export type ExecCliResult = {
  stdout: string;
  stderr: string;
};

/**
 * Execute a CLI tool command. Uses shell:true to resolve binaries through PATH.
 * Handles unclean exits (e.g. Gemini libuv crash on Windows) gracefully.
 */
export async function execCli(
  bin: string,
  args: string[],
  opts: ExecCliOptions = {},
): Promise<ExecCliResult> {
  const { cwd, timeout = 30_000, successPattern } = opts;

  return new Promise((resolve, reject) => {
    childProcess.execFile(bin, args, { shell: true, timeout, cwd }, (err, stdout, stderr) => {
      if (!err) {
        resolve({ stdout: stdout ?? '', stderr: stderr ?? '' });
        return;
      }

      if (successPattern) {
        const output = [
          (err as { stdout?: string }).stdout ?? '',
          (err as { stderr?: string }).stderr ?? '',
          stdout ?? '',
          stderr ?? '',
          err.message,
        ].join('\n');
        if (output.includes(successPattern)) {
          resolve({
            stdout: (err as { stdout?: string }).stdout ?? stdout ?? '',
            stderr: (err as { stderr?: string }).stderr ?? stderr ?? '',
          });
          return;
        }
      }

      reject(
        new AppError('CLI_EXEC_FAILED', `${bin} ${args.join(' ')} failed: ${err.message}`, true),
      );
    });
  });
}
