// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { Rush } from '../../api/Rush';

// These tests spawn the Rush CLI, which runs real operations.
jest.setTimeout(60000);

const START_PATH: string = path.resolve(__dirname, '../../../lib-commonjs/start.js');

function writeFile(folder: string, name: string, text: string): void {
  const filename: string = path.join(folder, name);
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  fs.writeFileSync(filename, text);
}

/**
 * A repo with projects `a` and `b`, where `b` depends on `a`. Operation `a` prints `tick-<n>` every 50 ms for about
 * 2 s. Each operation appends its progress to `runs.txt` in the repo folder.
 */
function createRepo(): string {
  const folder: string = fs.mkdtempSync(path.join(os.tmpdir(), 'rush-closed-output-'));
  writeFile(
    folder,
    'rush.json',
    JSON.stringify({
      rushVersion: Rush.version,
      npmVersion: '10.0.0',
      projectFolderMinDepth: 1,
      projects: ['a', 'b'].map((name) => ({ packageName: name, projectFolder: name }))
    })
  );
  writeFile(folder, '.gitignore', 'common/temp/\n**/.rush/\n**/rush-logs/\nruns.txt\n');
  writeFile(folder, 'common/temp/last-link.flag', '{}');
  writeFile(folder, 'common/config/rush/npm-shrinkwrap.json', '{"lockfileVersion":3,"packages":{}}');
  writeFile(
    folder,
    'common/config/rush/command-line.json',
    JSON.stringify({
      phases: [{ name: '_phase:compile', dependencies: { upstream: ['_phase:compile'] } }],
      commands: [
        {
          commandKind: 'phased',
          name: 'build',
          phases: ['_phase:compile'],
          enableParallelism: true,
          incremental: true
        }
      ]
    })
  );
  for (const name of ['a', 'b']) {
    writeFile(
      folder,
      `${name}/package.json`,
      JSON.stringify({
        name,
        version: '1.0.0',
        scripts: { '_phase:compile': 'node build.cjs' },
        dependencies: name === 'b' ? { a: '1.0.0' } : {}
      })
    );
  }
  writeFile(
    folder,
    'a/build.cjs',
    "const fs=require('node:fs');fs.appendFileSync('../runs.txt','a:start\\n');let n=0;" +
      "const t=setInterval(()=>{console.log('tick-'+ ++n);if(n===40){clearInterval(t);" +
      "fs.appendFileSync('../runs.txt','a:done\\n');}},50);"
  );
  writeFile(folder, 'b/build.cjs', "require('node:fs').appendFileSync('../runs.txt','b:start\\n');");
  execFileSync('git', ['init', '--quiet'], { cwd: folder, stdio: 'pipe' });
  execFileSync('git', ['add', '.'], { cwd: folder, stdio: 'pipe' });
  execFileSync(
    'git',
    [
      '-c',
      'user.name=Rush test',
      '-c',
      'user.email=rush-test@example.com',
      '-c',
      'commit.gpgSign=false',
      'commit',
      '--quiet',
      '-m',
      'Initialize closed output fixture'
    ],
    { cwd: folder, stdio: 'pipe' }
  );
  return folder;
}

interface IRushProcess {
  readonly child: ChildProcess;
  readonly closed: Promise<unknown[]>;
  /** Lines of stderr that mention a cancellation, a closed stream or a crash. */
  readonly getReportLines: () => string[];
  readonly getRuns: () => string | undefined;
}

function startRush(folder: string, closedStreams: 'none' | 'stdout' | 'both'): IRushProcess {
  const environment: NodeJS.ProcessEnv = { ...process.env, RUSH_REPORTER: 'legacy' };
  for (const name of ['CI', 'TF_BUILD', 'GITHUB_ACTIONS', 'RUSH_PARALLELISM', 'RUSH_DAEMON']) {
    delete environment[name];
  }
  const child: ChildProcess = spawn(process.execPath, [START_PATH, 'build', '--to', 'b', '--verbose'], {
    cwd: folder,
    env: environment,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  const closed: Promise<unknown[]> = once(child, 'close');
  let errors: string = '';
  if (closedStreams === 'both') {
    // The readers exit before Rush writes anything, as when `rush build 2>&1 | true` runs.
    child.stdout!.destroy();
    child.stderr!.destroy();
  } else {
    child.stderr!.on('data', (bytes: Buffer) => {
      errors += bytes.toString();
    });
    if (closedStreams === 'stdout') {
      child.stdout!.destroy();
    } else {
      child.stdout!.resume();
    }
  }
  return {
    child,
    closed,
    getReportLines: () =>
      errors.split('\n').filter((line) => /cancel|EPIPE|ECONNRESET|Unhandled|Error/i.test(line)),
    getRuns: () => {
      const filename: string = path.join(folder, 'runs.txt');
      return fs.existsSync(filename) ? fs.readFileSync(filename, 'utf8') : undefined;
    }
  };
}

describe('The Rush CLI with a stdout reader that exits', () => {
  const folders: string[] = [];
  const children: ChildProcess[] = [];

  function track(rush: IRushProcess): IRushProcess {
    children.push(rush.child);
    return rush;
  }

  function createTrackedRepo(): string {
    const folder: string = createRepo();
    folders.push(folder);
    return folder;
  }

  afterEach(async () => {
    for (const child of children.splice(0)) {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill('SIGTERM');
        await once(child, 'close');
      }
    }
    for (const folder of folders.splice(0)) {
      fs.rmSync(folder, { recursive: true, force: true });
    }
  });

  it('stops starting operations, lets the running one finish, and exits with 141', async () => {
    const folder: string = createTrackedRepo();
    const rush: IRushProcess = track(startRush(folder, 'none'));
    const { child } = rush;
    // Stops reading at the operation's first line, as `grep -m1 tick-` would.
    let output: string = '';
    await new Promise<void>((resolve, reject) => {
      child.stdout!.on('data', (bytes: Buffer) => {
        output += bytes.toString();
        if (output.includes('tick-')) {
          child.stdout!.destroy();
          resolve();
        }
      });
      rush.closed.then(
        () => reject(new Error(`The build ended before its output arrived: ${output}`)),
        reject
      );
    });

    expect(await rush.closed).toEqual([141, null]);
    // A socket (here) may report ECONNRESET where a shell's pipe reports EPIPE.
    expect(rush.getReportLines()).toEqual([
      expect.stringMatching(
        /^rush: build cancelled, because the process reading its stdout exited \((EPIPE|ECONNRESET)\)\. Operations that already started will finish first\.$/
      )
    ]);
    // "a" finished before Rush exited, and "b" never started.
    expect(rush.getRuns()).toBe('a:start\na:done\n');

    // The cancelled build left nothing behind that stops the next one from building "b".
    fs.rmSync(path.join(folder, 'runs.txt'));
    const next: IRushProcess = track(startRush(folder, 'none'));
    expect(await next.closed).toEqual([0, null]);
    expect(next.getReportLines()).toEqual([]);
    expect(next.getRuns()).toMatch(/(^|\n)b:start\n$/);
  });

  it('runs no operation when the reader exits before the build starts, and exits with 141', async () => {
    const folder: string = createTrackedRepo();
    const rush: IRushProcess = track(startRush(folder, 'stdout'));

    expect(await rush.closed).toEqual([141, null]);
    expect(rush.getReportLines()).toEqual([
      expect.stringMatching(
        /^rush: build cancelled, because the process reading its stdout exited \((EPIPE|ECONNRESET)\)\.$/
      )
    ]);
    expect(rush.getRuns()).toBeUndefined();
  });

  it('exits with 141 when the readers of both stdout and stderr exit', async () => {
    const folder: string = createTrackedRepo();
    const rush: IRushProcess = track(startRush(folder, 'both'));

    expect(await rush.closed).toEqual([141, null]);
    expect(rush.getRuns()).toBeUndefined();
  });

  it('runs the whole build when the reader keeps reading, as `| cat` does', async () => {
    const folder: string = createTrackedRepo();
    const rush: IRushProcess = track(startRush(folder, 'none'));

    expect(await rush.closed).toEqual([0, null]);
    expect(rush.getReportLines()).toEqual([]);
    expect(rush.getRuns()).toBe('a:start\na:done\nb:start\n');
  });
});
