import { exec as child_process_exec } from 'child_process';

/**
 * The result of spawning a command
 */
export interface IExecResult {
  /**
   * The standard output of the spawned command
   */
  stdout: string;

  /**
   * The standard error of the spawned command
   */
  stderr: string;

  /**
   * The exit code of the spawned command
   */
  error?: Error;
}

/**
 * Spawn a child process and obtain the contents of its output streams as text
 * @param cmd - Command to execute
 * @param args - Arguments to pass to command
 * @returns The exit code and output of the executed command
 */
export function exec(cmd: string, cwd: string): Promise<IExecResult> {
  return new Promise(function (resolve: (result: IExecResult) => void, reject: (error: unknown) => void) {
    child_process_exec(cmd, { cwd }, function (error, stdout, stderr) {
      resolve({ stdout, stderr, error: error || undefined });
    });
  });
}
