import * as child_process from 'child_process';
import type { Stream } from 'stream';

type StioOptions =
  | 'pipe'
  | 'ignore'
  | 'inherit'
  | (number | 'pipe' | 'ignore' | 'inherit' | 'ipc' | Stream | null | undefined)[]
  | undefined;

interface IEnvironment {
  [envionmentVariableName: string]: string | undefined;
}

export function executeCommandAndCaptureOutput(
  command: string,
  args: string[],
  workingDirectory: string,
  environment?: IEnvironment,
  keepEnvironment: boolean = false
): child_process.SpawnSyncReturns<string | Buffer> {
  return _executeCommandInternal(
    command,
    args,
    workingDirectory,
    ['pipe', 'pipe', 'pipe'],
    environment,
    keepEnvironment
  );
}

function _executeCommandInternal(
  command: string,
  args: string[],
  workingDirectory: string,
  stdio: StioOptions,
  environment?: IEnvironment,
  keepEnvironment: boolean = false
): child_process.SpawnSyncReturns<string | Buffer> {
  const options: child_process.SpawnSyncOptions = {
    cwd: workingDirectory,
    shell: true,
    stdio,
    env: environment,
    maxBuffer: 1024 * 1024 * 10
  };

  // This is needed since we specify shell=true below.
  // NOTE: On Windows if we escape "NPM", the spawnSync() function runs something like this:
  //   [ 'C:\\Windows\\system32\\cmd.exe', '/s', '/c', '""NPM" "install""' ]
  //
  // Due to a bug with Windows cmd.exe, the npm.cmd batch file's "%~dp0" variable will
  // return the current working directory instead of the batch file's directory.
  // The workaround is to not escape, npm, i.e. do this instead:
  //   [ 'C:\\Windows\\system32\\cmd.exe', '/s', '/c', '"npm "install""' ]
  //
  // We will come up with a better solution for this when we promote executeCommand()
  // into node-core-library, but for now this hack will unblock people:

  // Only escape the command if it actually contains spaces:
  const escapedCommand: string = command.indexOf(' ') < 0 ? command : _escapeShellParameter(command);

  const escapedArgs: string[] = args.map((x) => _escapeShellParameter(x));

  let result: child_process.SpawnSyncReturns<string | Buffer> = child_process.spawnSync(
    escapedCommand,
    escapedArgs,
    options
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (result.error && (result.error as any).errno === 'ENOENT') {
    // This is a workaround for GitHub issue #25330
    // https://github.com/nodejs/node-v0.x-archive/issues/25330
    //
    // TODO: The fully worked out solution for this problem is now provided by the "Executable" API
    // from @rushstack/node-core-library
    result = child_process.spawnSync(command + '.cmd', args, options);
  }

  _processResult(result);
  return result;
}

function _escapeShellParameter(parameter: string): string {
  return JSON.stringify(parameter);
}

function _processResult(result: child_process.SpawnSyncReturns<string | Buffer>): void {
  if (result.error) {
    result.error.message += '\n' + (result.stderr ? result.stderr.toString() + '\n' : '');
    throw result.error;
  }

  if (result.status) {
    throw new Error(
      'The command failed with exit code ' +
        result.status +
        '\n' +
        (result.stderr ? result.stderr.toString() : '')
    );
  }
}
