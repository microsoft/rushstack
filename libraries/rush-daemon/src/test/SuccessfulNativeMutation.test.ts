// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as path from 'node:path';

import { DaemonClient } from '@rushstack/rush-client-core';
import { readDaemonLockfile, type IDaemonLockfile } from '@rushstack/rush-daemon-transport';

import {
  MutationGate,
  SuccessfulMutationFixture,
  type IMutationRequestOutput,
  type ISuccessfulMutationOutput
} from './SuccessfulMutationFixture';

jest.setTimeout(120_000);

describe('successful native install/update', () => {
  it('runs the real update and install workers offline and installs actual workspace dependencies', async () => {
    const fixture: SuccessfulMutationFixture = await SuccessfulMutationFixture.createAsync();
    try {
      const updated: ISuccessfulMutationOutput = await fixture.runWorkerAsync('update');
      expect(updated).toMatchObject({ exitCode: 0 });
      const lockfile: string = path.join(fixture.repoRoot, 'common/config/rush/pnpm-lock.yaml');
      const committed: string = fs.readFileSync(lockfile, 'utf8');
      expect(committed).toContain('@mutation/provider-one');
      expect(committed).toContain('snapshots:');
      const installed: string = path.join(
        fixture.repoRoot,
        'projects/app/node_modules/@mutation/provider-one/package.json'
      );
      expect(fs.existsSync(installed)).toBe(true);
      fixture.removeInstalledAppDependency();
      expect(fs.existsSync(installed)).toBe(false);
      const result: ISuccessfulMutationOutput = await fixture.runWorkerAsync('install');
      expect(result).toMatchObject({ exitCode: 0 });
      expect(fs.existsSync(installed)).toBe(true);
      expect(fs.readFileSync(lockfile, 'utf8')).toBe(committed);
      expect(fs.existsSync(path.join(fixture.repoRoot, 'common/temp/last-install.flag'))).toBe(true);
      expect(fs.existsSync(path.join(fixture.repoRoot, 'common/temp/last-link.flag'))).toBe(true);
      expect(`${updated.stdout}\n${result.stdout}`).toContain(`Found pnpm version ${fixture.pnpmVersion}`);
      expect(`${updated.stdout}\n${result.stdout}`).not.toContain(
        `Installing pnpm version ${fixture.pnpmVersion}`
      );
    } finally {
      await fixture[Symbol.asyncDispose]();
    }
  });

  for (const commandName of ['install', 'update'] as const) {
    it(`drains successful ${commandName} output/result before old cleanup and successor, then rebuilds postmutation state`, async () => {
      const fixture: SuccessfulMutationFixture = await SuccessfulMutationFixture.createAsync();
      const postInstall: MutationGate = await MutationGate.createAsync();
      const disposal: MutationGate = await MutationGate.createAsync();
      let request: Promise<IMutationRequestOutput> | undefined;
      try {
        expect(await fixture.runWorkerAsync('update')).toMatchObject({ exitCode: 0 });
        const lockfile: string = path.join(fixture.repoRoot, 'common/config/rush/pnpm-lock.yaml');
        const previousLockfile: string = fs.readFileSync(lockfile, 'utf8');
        await fixture.startAsync();
        const initialPid: number = fixture.initialPid!;
        expect(initialPid).not.toBe(process.pid);
        expect(
          await fixture.requestAsync(['build', '--to', '@mutation/app', '--parallelism', '3'])
        ).toMatchObject({ exitCode: 0, outcome: { kind: 'result', result: { aborted: false } } });
        expect(fixture.readAppOutput()).toBe('provider-one-installed:before');

        if (commandName === 'update') fixture.selectSecondProvider();
        else fixture.removeInstalledAppDependency();
        const provider: string = commandName === 'update' ? 'provider-two' : 'provider-one';
        const dependency: string = path.join(
          fixture.repoRoot,
          `projects/app/node_modules/@mutation/${provider}/package.json`
        );
        expect(fs.existsSync(dependency)).toBe(false);
        fs.writeFileSync(
          path.join(fixture.controlFolder, 'mutation.json'),
          JSON.stringify({
            commandName,
            postInstallPort: postInstall.port,
            disposalPort: disposal.port
          })
        );

        let resultReceived: boolean = false;
        request = fixture.requestAsync([commandName, '--bypass-policy', '--offline']).then((result) => {
          resultReceived = true;
          fs.appendFileSync(path.join(fixture.controlFolder, 'events.txt'), 'result-received\n');
          return result;
        });
        await Promise.race([
          postInstall.entered,
          request.then((result) => {
            throw new Error(
              `Mutation ended before its successful post-install hook: ${JSON.stringify(result)}`
            );
          })
        ]);
        // The real package manager has finished, but the native command is still inside its final hook.
        expect(fs.existsSync(dependency)).toBe(true);
        expect(resultReceived).toBe(false);
        expect(readDaemonLockfile(fixture.paths!.lockfilePath)?.pid).toBe(initialPid);
        expect(fs.readFileSync(path.join(fixture.controlFolder, 'events.txt'), 'utf8')).toBe(
          `postinstall:${commandName}\n`
        );
        await postInstall[Symbol.asyncDispose]();

        const result: IMutationRequestOutput = await request;
        expect(result).toMatchObject({
          exitCode: 0,
          outcome: { kind: 'result', result: { exitCode: 0, outcome: 'success', aborted: false } }
        });
        expect(result.outcome).not.toHaveProperty('result.retryAfterRestart');
        expect(result.stdout).toContain(`FINAL_POST_INSTALL:${commandName}`);
        expect(result.stdout).toContain(`Found pnpm version ${fixture.pnpmVersion}`);
        await disposal.entered;
        expect(readDaemonLockfile(fixture.paths!.lockfilePath)?.pid).toBe(initialPid);
        expect(fs.readFileSync(path.join(fixture.controlFolder, 'events.txt'), 'utf8')).toBe(
          `postinstall:${commandName}\nresult-received\n`
        );
        await disposal[Symbol.asyncDispose]();

        const successor: IDaemonLockfile = await fixture.waitForSuccessorAsync();
        expect(successor.pid).not.toBe(initialPid);
        expect(successor.pid).not.toBe(process.pid);
        const ready: DaemonClient = await DaemonClient.connectAsync({
          socketPath: fixture.paths!.socketPath
        });
        try {
          expect((await ready.status).pid).toBe(successor.pid);
        } finally {
          await ready.closeAsync();
        }
        expect(await fixture.waitForInitialExitAsync()).toMatchObject({ exitCode: 0 });
        expect(fs.readFileSync(path.join(fixture.controlFolder, 'events.txt'), 'utf8')).toBe(
          `postinstall:${commandName}\nresult-received\nold-resources-disposed\nsuccessor-process-started\n`
        );
        expect(
          await fixture.requestAsync(['rebuild', '--to', '@mutation/app', '--parallelism', '3'])
        ).toMatchObject({ exitCode: 0 });
        expect(fixture.readAppOutput()).toBe(`${provider}-installed:after-${commandName}`);
        const currentLockfile: string = fs.readFileSync(lockfile, 'utf8');
        if (commandName === 'update') expect(currentLockfile).not.toBe(previousLockfile);
        else expect(currentLockfile).toBe(previousLockfile);
        // Starting a successor or rebuilding must not replay the administrative action.
        expect(fs.readFileSync(path.join(fixture.controlFolder, 'events.txt'), 'utf8')).toBe(
          `postinstall:${commandName}\nresult-received\nold-resources-disposed\nsuccessor-process-started\n`
        );
      } finally {
        fs.rmSync(path.join(fixture.controlFolder, 'mutation.json'), { force: true });
        await postInstall[Symbol.asyncDispose]();
        await disposal[Symbol.asyncDispose]();
        try {
          await request;
        } finally {
          await fixture[Symbol.asyncDispose]();
        }
      }
    });
  }
});
