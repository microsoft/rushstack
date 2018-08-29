// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as os from 'os';
import * as path from 'path';
import * as child_process from 'child_process';

import { Executable, IExecutableSpawnSyncOptions } from '../Executable';
import { FileSystem } from '../FileSystem';
import { PosixModeBits } from '../PosixModeBits';
import { Text } from '../Text';

// The PosixModeBits are intended to be used with bitwise operations.
// tslint:disable:no-bitwise

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
    FileSystem.changePosixModeBits(path.join(executableFolder, 'success', 'npm-binary-wrapper'),
      PosixModeBits.AllRead | PosixModeBits.AllWrite | PosixModeBits.AllExecute);
    FileSystem.changePosixModeBits(path.join(executableFolder, 'success', 'bash-script.sh'),
      PosixModeBits.AllRead | PosixModeBits.AllWrite | PosixModeBits.AllExecute);
  }
});

afterAll(() => {
  // Revert the permissions to the defaults
  if (os.platform() !== 'win32') {
    FileSystem.changePosixModeBits(path.join(executableFolder, 'success', 'npm-binary-wrapper'),
      PosixModeBits.AllRead | PosixModeBits.AllWrite);
    FileSystem.changePosixModeBits(path.join(executableFolder, 'success', 'bash-script.sh'),
      PosixModeBits.AllRead | PosixModeBits.AllWrite);
  }
});

test('Executable.tryResolve() pathless', () => {
  const resolved: string | undefined = Executable.tryResolve('npm-binary-wrapper', options);
  expect(resolved).toBeDefined();
  const resolvedRelative: string = Text.replaceAll(path.relative(executableFolder, resolved!),
    '\\', '/');

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
  const result: child_process.SpawnSyncReturns<string>
    = Executable.spawnSync('npm-binary-wrapper', args, options);
  expect(result.error).toBeUndefined();

  expect(result.stderr).toBeDefined();
  expect(result.stderr.toString()).toEqual('');

  expect(result.stdout).toBeDefined();
  const outputLines: string[] = result.stdout.toString().split(/[\r\n]+/g).map(x => x.trim());

  let lineIndex: number = 0;
  if (os.platform() === 'win32') {
    expect(outputLines[lineIndex++]).toEqual('Executing npm-binary-wrapper.cmd with args:');
  } else {
    expect(outputLines[lineIndex++]).toEqual('Executing npm-binary-wrapper with args:');
  }
  // console.log('npm-binary-wrapper.cmd ARGS: ' + outputLines[lineIndex]);
  ++lineIndex;  // skip npm-binary-wrapper's args

  expect(outputLines[lineIndex++]).toEqual('Executing javascript-file.js with args:');

  const stringifiedArgv: string = outputLines[lineIndex++];
  expect(stringifiedArgv.substr(0, 2)).toEqual('[\"');

  const argv: string[] = JSON.parse(stringifiedArgv);
  // Discard the first two array entries whose path is nondeterministic
  argv.shift();  // the path to node.exe
  argv.shift();  // the path to javascript-file.js

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
    '~!@#$*()_+`={}[]\:";\'?,./',
    '~!@#$*()_+`={}[]\:";\'?,./'
  ];
  expect(executeNpmBinaryWrapper(args)).toEqual(args);
});

test('Executable.spawnSync("npm-binary-wrapper") edge cases 2', () => {
  // All ASCII punctuation
  const args: string[] = [
    // Characters that are impossible to escape for cmd.exe:
    // %^&|<>  newline
    '~!@#$*()_+`={}[]\:";\'?,./',
    '~!@#$*()_+`={}[]\:";\'?,./'
  ];
  expect(executeNpmBinaryWrapper(args)).toEqual(args);
});

test('Executable.spawnSync("npm-binary-wrapper") bad characters', () => {
  if (os.platform() === 'win32') {
    expect(() => { executeNpmBinaryWrapper(['abc%123']); })
      .toThrowError('The command line argument "abc%123" contains a special character "%"'
        + ' that cannot be escaped for the Windows shell');
    expect(() => { executeNpmBinaryWrapper(['abc<>123']); })
      .toThrowError('The command line argument "abc<>123" contains a special character "<"'
        + ' that cannot be escaped for the Windows shell');
  }
});
