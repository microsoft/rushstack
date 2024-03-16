import { HeftConfiguration } from '@rushstack/heft';
import { SubprocessTerminator } from '@rushstack/node-core-library';
import child_process from 'child_process';
import path from 'path';

export function runShellCommand(heftConfiguration: HeftConfiguration, command: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const shellScriptProcess: child_process.ChildProcess = child_process.spawn(command, {
      cwd: heftConfiguration.buildFolder,
      stdio: ['ignore', 'inherit', 'inherit'],
      shell: true,
      env: {
        ...process.env,
        PATH: `${path.join(heftConfiguration.buildFolder, 'node_modules', '.bin')}:${process.env.PATH}`
      },
      ...SubprocessTerminator.RECOMMENDED_OPTIONS
    });
    SubprocessTerminator.killProcessTreeOnExit(shellScriptProcess, SubprocessTerminator.RECOMMENDED_OPTIONS);
    shellScriptProcess.on('error', (error) => {
      reject(error);
    });
    shellScriptProcess.on('exit', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error('Failed running command.'));
      }
    });
  });
}
