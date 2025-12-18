// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as os from 'node:os';
import * as path from 'node:path';
import type * as child_process from 'node:child_process';
import { once } from 'node:events';

import {
  Executable,
  parseProcessListOutput,
  parseProcessListOutputAsync,
  type IProcessInfo,
  type IExecutableSpawnSyncOptions,
  type IWaitForExitResult,
  type IWaitForExitResultWithoutOutput
} from '../Executable';
import { FileSystem } from '../FileSystem';
import { PosixModeBits } from '../PosixModeBits';
import { Text } from '../Text';
import { Readable } from 'node:stream';

describe('Executable process tests', () => {
  // The PosixModeBits are intended to be used with bitwise operations.
  /* eslint-disable no-bitwise */

  // Use src/test/test-data instead of lib/test/test-data
  const executableFolder: string = path.join(__dirname, '..', '..', 'src', 'test', 'test-data', 'executable');

  let environment: NodeJS.ProcessEnv;

  if (os.platform() === 'win32') {
    environment = {
      PATH: [
        path.join(executableFolder, 'skipped'),
        path.join(executableFolder, 'success'),
        path.join(executableFolder, 'fail'),
        path.dirname(process.execPath) // the folder where node.exe can be found
      ].join(path.delimiter),

      PATHEXT: '.COM;.EXE;.BAT;.CMD;.VBS',

      TEST_VAR: '123'
    };
  } else {
    environment = {
      PATH: [
        path.join(executableFolder, 'skipped'),
        path.join(executableFolder, 'success'),
        path.join(executableFolder, 'fail'),
        path.dirname(process.execPath), // the folder where node.exe can be found
        // These are needed because our example script needs to find bash
        '/usr/local/bin',
        '/usr/bin',
        '/bin'
      ].join(path.delimiter),

      TEST_VAR: '123'
    };
  }

  const options: IExecutableSpawnSyncOptions = {
    environment: environment,
    currentWorkingDirectory: executableFolder,
    stdio: 'pipe'
  };

  beforeAll(() => {
    // Make sure the test folder exists where we expect it
    expect(FileSystem.exists(executableFolder)).toEqual(true);

    // Git's core.filemode setting wrongly defaults to true on Windows.  This design flaw makes
    // it completely impractical to store POSIX file permissions in a cross-platform Git repo.
    // So instead we set them before the test runs, and then revert them after the test completes.
    if (os.platform() !== 'win32') {
      FileSystem.changePosixModeBits(
        path.join(executableFolder, 'success', 'npm-binary-wrapper'),
        PosixModeBits.AllRead | PosixModeBits.AllWrite | PosixModeBits.AllExecute
      );
      FileSystem.changePosixModeBits(
        path.join(executableFolder, 'fail', 'npm-binary-wrapper'),
        PosixModeBits.AllRead | PosixModeBits.AllWrite | PosixModeBits.AllExecute
      );
    }
  });

  afterAll(() => {
    // Revert the permissions to the defaults
    if (os.platform() !== 'win32') {
      FileSystem.changePosixModeBits(
        path.join(executableFolder, 'success', 'npm-binary-wrapper'),
        PosixModeBits.AllRead | PosixModeBits.AllWrite
      );
      FileSystem.changePosixModeBits(
        path.join(executableFolder, 'fail', 'npm-binary-wrapper'),
        PosixModeBits.AllRead | PosixModeBits.AllWrite
      );
    }
  });

  test('Executable.tryResolve() pathless', () => {
    const resolved: string | undefined = Executable.tryResolve('npm-binary-wrapper', options);
    expect(resolved).toBeDefined();
    const resolvedRelative: string = Text.replaceAll(path.relative(executableFolder, resolved!), '\\', '/');

    if (os.platform() === 'win32') {
      // On Windows, we should find npm-binary-wrapper.cmd instead of npm-binary-wrapper
      expect(resolvedRelative).toEqual('success/npm-binary-wrapper.cmd');
    } else {
      expect(resolvedRelative).toEqual('success/npm-binary-wrapper');
    }

    // We should not find the "missing-extension" at all, because its file extension
    // is not executable on Windows (and the execute bit is missing on Unix)
    expect(Executable.tryResolve('missing-extension', options)).toBeUndefined();
  });

  test('Executable.tryResolve() with path', () => {
    const resolved: string | undefined = Executable.tryResolve('./npm-binary-wrapper', options);
    expect(resolved).toBeUndefined();
  });

  function executeNpmBinaryWrapper(args: string[]): string[] {
    const result: child_process.SpawnSyncReturns<string> = Executable.spawnSync(
      'npm-binary-wrapper',
      args,
      options
    );
    expect(result.error).toBeUndefined();

    expect(result.stderr).toBeDefined();
    expect(result.stderr.toString()).toEqual('');

    expect(result.stdout).toBeDefined();
    const outputLines: string[] = result.stdout
      .toString()
      .split(/[\r\n]+/g)
      .map((x) => x.trim());

    let lineIndex: number = 0;
    if (os.platform() === 'win32') {
      expect(outputLines[lineIndex++]).toEqual('Executing npm-binary-wrapper.cmd with args:');
    } else {
      expect(outputLines[lineIndex++]).toEqual('Executing npm-binary-wrapper with args:');
    }
    // console.log('npm-binary-wrapper.cmd ARGS: ' + outputLines[lineIndex]);
    ++lineIndex; // skip npm-binary-wrapper's args

    expect(outputLines[lineIndex++]).toEqual('Executing javascript-file.js with args:');

    const stringifiedArgv: string = outputLines[lineIndex++];
    expect(stringifiedArgv.substr(0, 2)).toEqual('["');

    const argv: string[] = JSON.parse(stringifiedArgv);
    // Discard the first two array entries whose path is nondeterministic
    argv.shift(); // the path to node.exe
    argv.shift(); // the path to javascript-file.js

    return argv;
  }

  test('Executable.spawnSync("npm-binary-wrapper") simple', () => {
    const args: string[] = ['arg1', 'arg2', 'arg3'];
    expect(executeNpmBinaryWrapper(args)).toEqual(args);
  });

  test('Executable.spawnSync("npm-binary-wrapper") edge cases 1', () => {
    // Characters that confuse the CreateProcess() WIN32 API's encoding
    const args: string[] = ['', '/', ' \t ', '"a', 'b"', '"c"', '\\"\\d', '!', '!TEST_VAR!'];
    expect(executeNpmBinaryWrapper(args)).toEqual(args);
  });

  test('Executable.spawnSync("npm-binary-wrapper") edge cases 2', () => {
    // All ASCII punctuation
    const args: string[] = [
      // Characters that are impossible to escape for cmd.exe:
      // %^&|<>  newline
      '~!@#$*()_+`={}[]:";\'?,./',
      '~!@#$*()_+`={}[]:";\'?,./'
    ];
    expect(executeNpmBinaryWrapper(args)).toEqual(args);
  });

  test('Executable.spawnSync("npm-binary-wrapper") edge cases 2', () => {
    // All ASCII punctuation
    const args: string[] = [
      // Characters that are impossible to escape for cmd.exe:
      // %^&|<>  newline
      '~!@#$*()_+`={}[]:";\'?,./',
      '~!@#$*()_+`={}[]:";\'?,./'
    ];
    expect(executeNpmBinaryWrapper(args)).toEqual(args);
  });

  test('Executable.spawnSync("npm-binary-wrapper") bad characters', () => {
    if (os.platform() === 'win32') {
      expect(() => {
        executeNpmBinaryWrapper(['abc%123']);
      }).toThrowError(
        'The command line argument "abc%123" contains a special character "%"' +
          ' that cannot be escaped for the Windows shell'
      );
      expect(() => {
        executeNpmBinaryWrapper(['abc<>123']);
      }).toThrowError(
        'The command line argument "abc<>123" contains a special character "<"' +
          ' that cannot be escaped for the Windows shell'
      );
    }
  });

  test('Executable.spawn("npm-binary-wrapper")', async () => {
    const executablePath: string = path.join(executableFolder, 'success', 'npm-binary-wrapper');

    await expect(
      (() => {
        const childProcess: child_process.ChildProcess = Executable.spawn(executablePath, ['1', '2', '3'], {
          environment,
          currentWorkingDirectory: executableFolder
        });

        return new Promise<string>((resolve, reject) => {
          childProcess.on('exit', (code: number) => {
            resolve(`Exit with code=${code}`);
          });
          childProcess.on('error', (error: Error) => {
            reject(`Failed with error: ${error.message}`);
          });
        });
      })()
    ).resolves.toBe('Exit with code=0');
  });

  test('Executable.runToCompletion(Executable.spawn("npm-binary-wrapper")) without output', async () => {
    const executablePath: string = path.join(executableFolder, 'success', 'npm-binary-wrapper');
    const childProcess: child_process.ChildProcess = Executable.spawn(executablePath, ['1', '2', '3'], {
      environment,
      currentWorkingDirectory: executableFolder
    });
    const result: IWaitForExitResultWithoutOutput = await Executable.waitForExitAsync(childProcess);
    expect(result.exitCode).toEqual(0);
    expect(result.signal).toBeNull();
    expect('stdout' in result).toBe(false);
    expect('stderr' in result).toBe(false);
  });

  test('Executable.runToCompletion(Executable.spawn("npm-binary-wrapper")) with buffer output', async () => {
    const executablePath: string = path.join(executableFolder, 'success', 'npm-binary-wrapper');
    const childProcess: child_process.ChildProcess = Executable.spawn(executablePath, ['1', '2', '3'], {
      environment,
      currentWorkingDirectory: executableFolder
    });
    const result: IWaitForExitResult<Buffer> = await Executable.waitForExitAsync(childProcess, {
      encoding: 'buffer'
    });
    expect(result.exitCode).toEqual(0);
    expect(result.signal).toBeNull();
    expect(Buffer.isBuffer(result.stdout)).toEqual(true);
    expect(Buffer.isBuffer(result.stderr)).toEqual(true);
    expect(result.stdout.toString('utf8').includes('Executing javascript-file.js with args:')).toBe(true);
    expect(result.stderr.toString('utf8')).toEqual('');
  });

  test('Executable.runToCompletion(Executable.spawn("npm-binary-wrapper")) with string output', async () => {
    const executablePath: string = path.join(executableFolder, 'success', 'npm-binary-wrapper');
    const childProcess: child_process.ChildProcess = Executable.spawn(executablePath, ['1', '2', '3'], {
      environment,
      currentWorkingDirectory: executableFolder
    });
    const result: IWaitForExitResult<string> = await Executable.waitForExitAsync(childProcess, {
      encoding: 'utf8'
    });
    expect(result.exitCode).toEqual(0);
    expect(result.signal).toBeNull();
    expect(typeof result.stdout).toEqual('string');
    expect(typeof result.stderr).toEqual('string');
    expect(result.stdout.indexOf('Executing javascript-file.js with args:')).toBeGreaterThanOrEqual(0);
    expect(result.stderr).toEqual('');
  });

  test('Executable.runToCompletion(Executable.spawn("npm-binary-wrapper")) failure', async () => {
    const executablePath: string = path.join(executableFolder, 'fail', 'npm-binary-wrapper');
    const childProcess: child_process.ChildProcess = Executable.spawn(executablePath, ['1', '2', '3'], {
      environment,
      currentWorkingDirectory: executableFolder
    });
    const result: IWaitForExitResult<string> = await Executable.waitForExitAsync(childProcess, {
      encoding: 'utf8'
    });
    expect(result.exitCode).toEqual(1);
    expect(result.signal).toBeNull();
    expect(typeof result.stdout).toEqual('string');
    expect(typeof result.stderr).toEqual('string');
    expect(result.stdout).toMatch(/^Executing npm-binary-wrapper(\.cmd)? with args:/);
    expect(result.stderr.endsWith('This is a failure'));
  });

  test('Executable.runToCompletion(Executable.spawn("no-terminate")) killed', async () => {
    const executablePath: string = path.join(executableFolder, 'no-terminate', 'javascript-file.js');
    const childProcess: child_process.ChildProcess = Executable.spawn(
      process.argv0,
      [executablePath, '1', '2', '3'],
      {
        environment,
        currentWorkingDirectory: executableFolder
      }
    );

    // Wait for the process to print the error line
    expect(childProcess.stderr).toBeDefined();
    const [stderrPre] = await once(childProcess.stderr!, 'data');

    const killResult: boolean = childProcess.kill('SIGTERM');
    const result: IWaitForExitResult<string> = await Executable.waitForExitAsync(childProcess, {
      encoding: 'utf8'
    });

    expect(killResult).toBe(true);
    expect(result.signal).toBe('SIGTERM');
    expect(result.exitCode).toBeNull();
    expect(typeof result.stdout).toEqual('string');
    expect(typeof result.stderr).toEqual('string');
    expect(result.stdout).toMatch(/^Executing no-terminate with args:/);
    expect((stderrPre.toString('utf8') + result.stderr).includes('This process never terminates')).toBe(true);
  });

  test('Executable.runToCompletion(Executable.spawn("npm-binary-wrapper")) failure with throw on non-zero exit code', async () => {
    const executablePath: string = path.join(executableFolder, 'fail', 'npm-binary-wrapper');
    const childProcess: child_process.ChildProcess = Executable.spawn(executablePath, ['1', '2', '3'], {
      environment,
      currentWorkingDirectory: executableFolder
    });
    await expect(
      Executable.waitForExitAsync(childProcess, { encoding: 'utf8', throwOnNonZeroExitCode: true })
    ).rejects.toThrowError(/exited with code 1/);
  });

  test('Executable.runToCompletion(Executable.spawn("no-terminate")) failure with throw on signal', async () => {
    const executablePath: string = path.join(executableFolder, 'no-terminate', 'javascript-file.js');
    const childProcess: child_process.ChildProcess = Executable.spawn(
      process.argv0,
      [executablePath, '1', '2', '3'],
      {
        environment,
        currentWorkingDirectory: executableFolder
      }
    );
    childProcess.kill('SIGTERM');
    await expect(
      Executable.waitForExitAsync(childProcess, { encoding: 'utf8', throwOnSignal: true })
    ).rejects.toThrowError(/Process terminated by SIGTERM/);
  });

  test('Executable.waitForExitAsync() handles multi-byte UTF-8 characters correctly', async () => {
    // Test that multi-byte characters are properly decoded even when split across chunks
    const executablePath: string = path.join(executableFolder, 'multibyte', 'output-multibyte.js');
    const childProcess: child_process.ChildProcess = Executable.spawn(process.argv0, [executablePath], {
      environment,
      currentWorkingDirectory: executableFolder,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    const result: IWaitForExitResult<string> = await Executable.waitForExitAsync(childProcess, {
      encoding: 'utf8'
    });

    expect(result.exitCode).toEqual(0);
    expect(result.signal).toBeNull();
    expect(typeof result.stdout).toEqual('string');

    // The output should contain properly decoded multi-byte characters
    // Chinese characters (世界) and emoji (🎉)
    expect(result.stdout).toContain('Hello, 世界! 🎉');
    // Ensure no replacement characters (�) which would indicate improper decoding
    expect(result.stdout).not.toContain('�');
  });
});

describe('Executable process list', () => {
  const WIN32_PROCESS_LIST_OUTPUT: (string | null)[] = [
    'PPID PID NAME\r\n',
    // Test that the parser can handle referencing a parent that is the same as the current process
    // Test that the parser can handle multiple return characters
    '0 0 System Idle Process\r\n',
    '0 1 System\r\n',
    // Test that the parser can handle an entry referencing a parent that hasn't been seen yet
    '2 4 executable2.exe\r\n',
    '1 2 executable0.exe\r\n',
    // Test children handling when multiple entries reference the same parent
    '1 3 executable1.exe\r\n',
    // Test that the parser can handle empty strings
    '',
    // Test that the parser can handle referencing a parent that doesn't exist
    '6 5 executable3.exe\r\n'
  ];

  const UNIX_PROCESS_LIST_OUTPUT: (string | null)[] = [
    'PPID   PID   COMMAND\n',
    // Test that the parser can handle referencing a parent that doesn't exist
    '   0     1   init\n',
    // Test that the parser can handle a line that is truncated in the middle of a field
    // Test that the parser can handle an entry referencing a parent that hasn't been seen yet
    // Test that the parser can handle whitespace at the end of the process name.
    '   2     4',
    '   process2           \n',
    '   1     2   process0\n',
    // Test that the parser can handle empty strings
    '',
    // Test children handling when multiple entries reference the same parent
    '   1     3   process1\n'
  ];

  test('contains the current pid (sync)', () => {
    const results: ReadonlyMap<number, IProcessInfo> = Executable.getProcessInfoById();
    const currentProcessInfo: IProcessInfo | undefined = results.get(process.pid);
    expect(currentProcessInfo).toBeDefined();
    expect(currentProcessInfo?.parentProcessInfo?.processId).toEqual(process.ppid);
    expect(currentProcessInfo?.processName.startsWith('node')).toBe(true);
  });

  test('contains the current pid (async)', async () => {
    const results: ReadonlyMap<number, IProcessInfo> = await Executable.getProcessInfoByIdAsync();
    const currentProcessInfo: IProcessInfo | undefined = results.get(process.pid);
    expect(currentProcessInfo).toBeDefined();
    expect(currentProcessInfo?.parentProcessInfo?.processId).toEqual(process.ppid);
    expect(currentProcessInfo?.processName.startsWith('node')).toBe(true);
  });

  test('parses win32 output', () => {
    const processListMap: Map<number, IProcessInfo> = parseProcessListOutput(
      WIN32_PROCESS_LIST_OUTPUT,
      'win32'
    );
    const results: IProcessInfo[] = [...processListMap.values()].sort();

    // Expect 7 because we reference a parent that doesn't exist
    expect(results.length).toEqual(7);

    // Since snapshot validation of circular entries is difficult to parse by humans, manually validate
    // that the parent/child relationships are correct
    expect(processListMap.get(0)!.parentProcessInfo).toBeUndefined();
    expect(processListMap.get(1)!.parentProcessInfo).toBe(processListMap.get(0));
    expect(processListMap.get(2)!.parentProcessInfo).toBe(processListMap.get(1));
    expect(processListMap.get(3)!.parentProcessInfo).toBe(processListMap.get(1));
    expect(processListMap.get(4)!.parentProcessInfo).toBe(processListMap.get(2));
    expect(processListMap.get(5)!.parentProcessInfo).toBe(processListMap.get(6));
    expect(processListMap.get(6)!.parentProcessInfo).toBeUndefined();

    for (const processInfo of results) {
      expect(processInfo).toMatchSnapshot();
    }
  });

  test('parses win32 stream output', async () => {
    const processListMap: Map<number, IProcessInfo> = await parseProcessListOutputAsync(
      Readable.from(WIN32_PROCESS_LIST_OUTPUT),
      'win32'
    );
    const results: IProcessInfo[] = [...processListMap.values()].sort();

    // Expect 7 because we reference a parent that doesn't exist
    expect(results.length).toEqual(7);

    // Since snapshot validation of circular entries is difficult to parse by humans, manually validate
    // that the parent/child relationships are correct
    expect(processListMap.get(0)!.parentProcessInfo).toBeUndefined();
    expect(processListMap.get(1)!.parentProcessInfo).toBe(processListMap.get(0));
    expect(processListMap.get(2)!.parentProcessInfo).toBe(processListMap.get(1));
    expect(processListMap.get(3)!.parentProcessInfo).toBe(processListMap.get(1));
    expect(processListMap.get(4)!.parentProcessInfo).toBe(processListMap.get(2));
    expect(processListMap.get(5)!.parentProcessInfo).toBe(processListMap.get(6));
    expect(processListMap.get(6)!.parentProcessInfo).toBeUndefined();

    for (const processInfo of results) {
      expect(processInfo).toMatchSnapshot();
    }
  });

  test('parses unix output', () => {
    const processListMap: Map<number, IProcessInfo> = parseProcessListOutput(
      UNIX_PROCESS_LIST_OUTPUT,
      'linux'
    );
    const results: IProcessInfo[] = [...processListMap.values()].sort();

    // Expect 5 because we reference a parent that doesn't exist
    expect(results.length).toEqual(5);

    // Since snapshot validation of circular entries is difficult to parse by humans, manually validate
    // that the parent/child relationships are correct
    expect(processListMap.get(0)!.parentProcessInfo).toBeUndefined();
    expect(processListMap.get(1)!.parentProcessInfo).toBe(processListMap.get(0));
    expect(processListMap.get(2)!.parentProcessInfo).toBe(processListMap.get(1));
    expect(processListMap.get(3)!.parentProcessInfo).toBe(processListMap.get(1));
    expect(processListMap.get(4)!.parentProcessInfo).toBe(processListMap.get(2));

    for (const processInfo of results) {
      expect(processInfo).toMatchSnapshot();
    }
  });

  test('parses unix stream output', async () => {
    const processListMap: Map<number, IProcessInfo> = await parseProcessListOutputAsync(
      Readable.from(UNIX_PROCESS_LIST_OUTPUT),
      'linux'
    );
    const results: IProcessInfo[] = [...processListMap.values()].sort();

    // Expect 5 because we reference a parent that doesn't exist
    expect(results.length).toEqual(5);

    // Since snapshot validation of circular entries is difficult to parse by humans, manually validate
    // that the parent/child relationships are correct
    expect(processListMap.get(0)!.parentProcessInfo).toBeUndefined();
    expect(processListMap.get(1)!.parentProcessInfo).toBe(processListMap.get(0));
    expect(processListMap.get(2)!.parentProcessInfo).toBe(processListMap.get(1));
    expect(processListMap.get(3)!.parentProcessInfo).toBe(processListMap.get(1));
    expect(processListMap.get(4)!.parentProcessInfo).toBe(processListMap.get(2));

    for (const processInfo of results) {
      expect(processInfo).toMatchSnapshot();
    }
  });
});
