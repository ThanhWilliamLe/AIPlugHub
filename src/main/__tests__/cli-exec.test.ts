import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('child_process')>();
  return {
    ...actual,
    execFile: vi.fn(
      (_cmd: string, _args: string[], _opts: unknown, cb: (...a: unknown[]) => void) => {
        cb(null, '', '');
      },
    ),
  };
});

import { execCli } from '../adapters/cli-exec';

describe('execCli', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls execFile with shell:true and default timeout', async () => {
    const cp = await import('child_process');
    await execCli('claude', ['mcp', 'add', 'foo', 'bar']);
    expect(cp.execFile).toHaveBeenCalledWith(
      'claude',
      ['mcp', 'add', 'foo', 'bar'],
      expect.objectContaining({ shell: true, timeout: 30_000 }),
      expect.any(Function),
    );
  });

  it('returns stdout and stderr on success', async () => {
    const cp = await import('child_process');
    (cp.execFile as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(
      (_cmd: string, _args: string[], _opts: unknown, cb: (...a: unknown[]) => void) => {
        cb(null, 'output text', 'warning text');
      },
    );
    const result = await execCli('claude', ['mcp', 'list']);
    expect(result.stdout).toBe('output text');
    expect(result.stderr).toBe('warning text');
  });

  it('passes cwd option when provided', async () => {
    const cp = await import('child_process');
    await execCli('claude', ['mcp', 'add', 'foo', 'bar'], { cwd: '/project/path' });
    expect(cp.execFile).toHaveBeenCalledWith(
      'claude',
      ['mcp', 'add', 'foo', 'bar'],
      expect.objectContaining({ cwd: '/project/path' }),
      expect.any(Function),
    );
  });

  it('passes custom timeout when provided', async () => {
    const cp = await import('child_process');
    await execCli('gemini', ['extensions', 'install', 'foo'], { timeout: 60_000 });
    expect(cp.execFile).toHaveBeenCalledWith(
      'gemini',
      ['extensions', 'install', 'foo'],
      expect.objectContaining({ timeout: 60_000 }),
      expect.any(Function),
    );
  });

  it('treats unclean exit as success when successPattern matches output', async () => {
    const cp = await import('child_process');
    (cp.execFile as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(
      (_cmd: string, _args: string[], _opts: unknown, cb: (...a: unknown[]) => void) => {
        const err = Object.assign(new Error('Command failed'), {
          stdout: 'Extension "foo" successfully uninstalled.\n',
          stderr: 'Assertion failed\n',
          code: 1,
        });
        cb(err, '', '');
      },
    );
    await execCli('gemini', ['extensions', 'uninstall', 'foo'], {
      successPattern: 'successfully uninstalled',
    });
  });

  it('throws AppError on genuine failure', async () => {
    const cp = await import('child_process');
    (cp.execFile as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(
      (_cmd: string, _args: string[], _opts: unknown, cb: (...a: unknown[]) => void) => {
        cb(new Error('Command not found'), '', 'command not found');
      },
    );
    await expect(execCli('claude', ['mcp', 'add', 'x', 'y'])).rejects.toThrow(/claude.*failed/);
  });

  it('produces user-friendly error when CLI binary is not found', async () => {
    const cp = await import('child_process');
    (cp.execFile as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(
      (_cmd: string, _args: string[], _opts: unknown, cb: (...a: unknown[]) => void) => {
        const err = Object.assign(new Error('spawn claude ENOENT'), { code: 'ENOENT' });
        cb(err, '', '');
      },
    );
    await expect(execCli('claude', ['mcp', 'list'])).rejects.toThrow(/claude.*failed/);
  });
});
