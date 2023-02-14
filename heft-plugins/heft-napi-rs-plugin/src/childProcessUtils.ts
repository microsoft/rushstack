import {
  Executable,
  ExecutableStdioMapping,
  IExecutableSpawnSyncOptions
} from '@rushstack/node-core-library';
import * as child_process from 'child_process';

interface IEnvironment {
  [envionmentVariableName: string]: string | undefined;
}

export function executeCommandAndCaptureOutput(
  command: string,
  args: string[],
  workingDirectory: string,
  environment?: IEnvironment
): child_process.SpawnSyncReturns<string> {
  return _executeCommandInternal(command, args, workingDirectory, ['pipe', 'pipe', 'pipe'], environment);
}

function _executeCommandInternal(
  command: string,
  args: string[],
  workingDirectory: string,
  stdio: ExecutableStdioMapping,
  environment?: IEnvironment
): child_process.SpawnSyncReturns<string> {
  const options: IExecutableSpawnSyncOptions = {
    currentWorkingDirectory: workingDirectory,
    stdio,
    environment,
    maxBuffer: 1024 * 1024 * 10
  };

  const result = Executable.spawnSync(command, args, options);

  _processResult(result);
  return result;
}

function _processResult(result: child_process.SpawnSyncReturns<string>): void {
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
