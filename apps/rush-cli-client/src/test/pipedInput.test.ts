// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { spawn } from 'node:child_process';
import { once } from 'node:events';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { Rush } from '@microsoft/rush-lib';
import { captureDaemonRequest, DaemonClient } from '@rushstack/rush-client-core';
import {
  DaemonRequestDispatchError,
  RushDaemonHost,
  type GlobalCommandExecutor,
  type IDaemonRequestResolver
} from '@rushstack/rush-daemon';

const SCRIPT: string =
  "const chunks=[];process.stdin.on('data',c=>{chunks.push(c);process.stdin.pause();" +
  "setTimeout(()=>process.stdin.resume(),1);});" +
  "process.stdin.on('end',()=>{process.stdout.write(Buffer.concat(chunks));" +
  "process.stderr.write('pipe-ended');process.exitCode=7;});";

interface IPipedResult {
  readonly code: number | undefined;
  readonly stdout: Buffer;
  readonly stderr: Buffer;
}

describe('standalone client piped input', () => {
  let folder: string;
  let project: string;
  let host: RushDaemonHost | undefined;

  beforeEach(() => {
    folder = fs.mkdtempSync(path.join(os.tmpdir(), 'rush-cli-input-'));
    project = path.join(folder, 'project');
    fs.mkdirSync(project);
    fs.mkdirSync(path.join(folder, 'common/config/rush'), { recursive: true });
    fs.writeFileSync(path.join(folder, 'rush.json'), JSON.stringify({
      rushVersion: Rush.version,
      pnpmVersion: '10.27.0',
      daemon: { enabled: false, autoStart: false },
      projects: [{ packageName: 'sample', projectFolder: 'project' }],
      projectFolderMinDepth: 1
    }));
    fs.writeFileSync(path.join(project, 'package.json'), JSON.stringify({
      name: 'sample',
      version: '1.0.0',
      scripts: { sample: `node -e "${SCRIPT}"` }
    }));
  });

  afterEach(async () => {
    const closingHost: RushDaemonHost | undefined = host;
    host = undefined;
    await closingHost?.closeAsync();
    fs.rmSync(folder, { recursive: true });
  });

  async function startHostAsync(requestResolver: IDaemonRequestResolver): Promise<void> {
    const daemonPackage: { version: string } = require('@rushstack/rush-daemon/package.json');
    host = await RushDaemonHost.startAsync({
      repoRoot: folder,
      rushVersion: Rush.version,
      daemonVersion: daemonPackage.version,
      requestResolver
    });
  }

  async function invokeAsync(
    input: Buffer,
    useClient: boolean = true,
    admissionArgs: ReadonlyArray<string> = []
  ): Promise<IPipedResult> {
    const entry: string = useClient
      ? path.resolve(__dirname, '../../bin/rushx-client')
      : path.join(path.dirname(require.resolve('@microsoft/rush/package.json')), 'bin/rushx');
    const child = spawn(process.execPath, [entry, 'sample', ...admissionArgs], {
      cwd: project,
      env: {
        ...process.env, RUSH_DAEMON: '1', RUSH_REPORTER: 'legacy',
        CI: 'false', TF_BUILD: 'false', GITHUB_ACTIONS: 'false'
      },
      stdio: 'pipe'
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout.on('data', (bytes: Buffer) => stdout.push(bytes));
    child.stderr.on('data', (bytes: Buffer) => stderr.push(bytes));
    child.stdin.end(input);
    const [code] = await once(child, 'close');
    return {
      code: typeof code === 'number' ? code : undefined,
      stdout: Buffer.concat(stdout),
      stderr: Buffer.concat(stderr)
    };
  }

  it.each([Buffer.from([0, 3, 255, 13]), Buffer.alloc(0), Buffer.alloc(2 * 1024 * 1024, 3)])(
    'delivers pipe bytes and EOF through the real host without treating Ctrl+C bytes as signals',
    async (input) => {
      const executorAsync: GlobalCommandExecutor = async (context) => {
        const child = context.spawnChild(process.execPath, ['-e', SCRIPT], { forwardInput: true });
        const [code] = await once(child, 'close');
        return { exitCode: typeof code === 'number' ? code : 1 };
      };
      await startHostAsync({
        resolveRequestAsync: async () => ({
          kind: 'global',
          executor: executorAsync
        })
      });
      const result: IPipedResult = await invokeAsync(input);
      expect(result.code).toBe(7);
      expect(result.stdout.equals(input)).toBe(true);
      expect(result.stderr.toString()).toBe('pipe-ended');
    },
    15000
  );

  it.each([
    { args: ['--no-wait'], admission: { noWait: true }, reason: 'no-wait' },
    { args: ['--wait-timeout=0.01'], admission: { waitTimeoutMs: 10 }, reason: 'wait-timeout' }
  ])('forwards $args without leaking queue flags to scripts', async ({ args, admission, reason }) => {
    let started: () => void = () => {};
    let release: () => void = () => {};
    const running: Promise<void> = new Promise((resolve) => { started = resolve; });
    const released: Promise<void> = new Promise((resolve) => { release = resolve; });
    const runScriptAsync = jest.fn(async () => ({ exitCode: 0 }));
    const holdAsync: GlobalCommandExecutor = async () => {
      started();
      await released;
      return { exitCode: 0 };
    };
    await startHostAsync({
      resolveRequestAsync: async ({ envelope }) => {
        if (envelope.commandName === 'hold') return { kind: 'global', executor: holdAsync };
        expect(envelope.argv).toEqual(['sample']);
        expect(envelope.admission).toEqual(admission);
        return { kind: 'global', executor: runScriptAsync };
      }
    });
    const client: DaemonClient = await DaemonClient.connectAsync({ socketPath: host!.paths.socketPath });
    const holding = client.executeAsync({
      request: captureDaemonRequest({
        argv: ['hold'], commandName: 'hold', commandOrigin: 'custom', cwd: project,
        environment: {}, terminal: { isTTY: false, supportsColor: false }
      })
    });
    try {
      await Promise.race([
        running,
        holding.then(() => { throw new Error('The holding request finished before acquiring admission.'); })
      ]);
      const result: IPipedResult = await invokeAsync(Buffer.alloc(0), true, args);
      expect(result.code).toBe(1);
      expect(result.stderr.toString()).toContain(`daemon admission failed (${reason})`);
      expect(runScriptAsync).not.toHaveBeenCalled();
    } finally {
      release();
      await holding;
      await client.closeAsync();
    }
  }, 15000);

  it('preserves every byte for native fallback when the host rejects before execution', async () => {
    await startHostAsync({
      resolveRequestAsync: async () => {
        throw new DaemonRequestDispatchError('unsupported', 'No command integration in this test.');
      }
    });
    const input: Buffer = Buffer.from('untouched stdin\n');
    const native: IPipedResult = await invokeAsync(input, false);
    const client: IPipedResult = await invokeAsync(input);
    expect(client.code).toBe(native.code);
    expect(client.stdout).toEqual(native.stdout);
    expect(client.stderr.toString()).toContain('using in-process Rush');
    expect(client.stderr.toString()).toContain('pipe-ended');
  }, 15000);
});
