// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import {
  createInstallRunRushBootstrap,
  type IInstallRunRushBootstrap,
  type IInstallRunRushBootstrapOptions
} from '../InstallRunRushBootstrap';
import {
  BOOTSTRAP_BUFFER_TRUNCATED_EXTENSION_NAME,
  RUSH_REPORTER_BOOTSTRAP_HANDOFF_ENV_VAR,
  RUSH_REPORTER_BOOTSTRAP_NONCE_ENV_VAR
} from '../generated/BootstrapProtocol';

async function withTempDir(action: (directory: string) => Promise<void>): Promise<void> {
  const directory: string = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'install-run-rush-test-'));
  try {
    await action(directory);
  } finally {
    await fs.promises.rm(directory, { recursive: true, force: true });
  }
}

function makeOptions(
  directory: string,
  overrides: Partial<IInstallRunRushBootstrapOptions> = {}
): {
  readonly options: IInstallRunRushBootstrapOptions;
  readonly env: Record<string, string | undefined>;
  readonly stdout: string[];
  readonly stderr: string[];
} {
  const env: Record<string, string | undefined> = {};
  const stdout: string[] = [];
  const stderr: string[] = [];
  return {
    env,
    stdout,
    stderr,
    options: {
      argv: ['build'],
      env,
      rushJsonFolder: directory,
      rushVersion: '5.178.1',
      bootstrapVersion: '5.178.1',
      commandName: 'rush',
      quiet: false,
      stdout: (text: string) => stdout.push(text),
      stderr: (text: string) => stderr.push(text),
      handoffDirectory: directory,
      now: () => '2026-08-28T00:00:00.000Z',
      randomUUID: (() => {
        let index: number = 0;
        return () => `00000000-0000-4000-8000-${String(++index).padStart(12, '0')}`;
      })(),
      ...overrides
    }
  };
}

function readHandoff(env: Record<string, string | undefined>): {
  readonly path: string;
  readonly records: Record<string, unknown>[];
} {
  const handoffPath: string | undefined = env[RUSH_REPORTER_BOOTSTRAP_HANDOFF_ENV_VAR];
  if (!handoffPath) {
    throw new Error('Expected a bootstrap handoff path.');
  }
  const records: Record<string, unknown>[] = fs
    .readFileSync(handoffPath, 'utf8')
    .trim()
    .split('\n')
    .map((line: string) => JSON.parse(line) as Record<string, unknown>);
  return { path: handoffPath, records };
}

describe(createInstallRunRushBootstrap.name, () => {
  it('preserves direct legacy bootstrap output without an opt-in', async () => {
    await withTempDir(async (directory: string) => {
      const { options, env, stdout } = makeOptions(directory);
      env.RUSH_REPORTER = 'unsupported-automatic-value';
      const bootstrap: IInstallRunRushBootstrap = createInstallRunRushBootstrap(options);

      bootstrap.logger.info('legacy startup');
      bootstrap.prepareToRun?.();

      expect(bootstrap.enabled).toBe(false);
      expect(stdout).toEqual(['legacy startup\n']);
      expect(env[RUSH_REPORTER_BOOTSTRAP_HANDOFF_ENV_VAR]).toBeUndefined();
      expect(env[RUSH_REPORTER_BOOTSTRAP_NONCE_ENV_VAR]).toBeUndefined();
    });
  });

  it('writes an ordered nonce-protected handoff for an explicit reporter', async () => {
    await withTempDir(async (directory: string) => {
      const { options, env, stdout } = makeOptions(directory, {
        argv: ['build', '--reporter=json', '--log-level=debug']
      });
      const bootstrap: IInstallRunRushBootstrap = createInstallRunRushBootstrap(options);

      bootstrap.logger.info('resolving Rush');
      bootstrap.externalOutputHandler?.('stdout', 'npm line 1\nnpm line 2\n');
      bootstrap.logger.info('invoking Rush');
      bootstrap.prepareToRun?.();

      const handoff = readHandoff(env);
      expect(bootstrap.enabled).toBe(true);
      expect(stdout).toEqual([]);
      expect(env[RUSH_REPORTER_BOOTSTRAP_NONCE_ENV_VAR]).toBe(
        (handoff.records[0] as { nonce?: string }).nonce
      );
      expect(handoff.records.slice(1).map((record: Record<string, unknown>) => record.type)).toEqual([
        'sessionStarted',
        'commandStarted',
        'activityChanged',
        'externalOutput',
        'activityChanged'
      ]);
      expect((handoff.records[4].payload as { text: string }).text).toBe('npm line 1\nnpm line 2\n');
      if (process.platform !== 'win32') {
        expect(fs.statSync(handoff.path).mode % 0o1000).toBe(0o600);
      }
    });
  });

  it('uses repository opt-in but safely falls back for an old frontend', async () => {
    await withTempDir(async (directory: string) => {
      const experimentsFolder: string = path.join(directory, 'common', 'config', 'rush');
      await fs.promises.mkdir(experimentsFolder, { recursive: true });
      await fs.promises.writeFile(
        path.join(experimentsFolder, 'experiments.json'),
        '{ "useRushReporter": true }\n'
      );
      const { options, stdout } = makeOptions(directory, { rushVersion: '5.177.0' });
      const bootstrap: IInstallRunRushBootstrap = createInstallRunRushBootstrap(options);
      bootstrap.logger.info('old frontend startup');

      expect(bootstrap.enabled).toBe(false);
      expect(stdout).toEqual(['old frontend startup\n']);
    });
  });

  it('ignores a commented hypothetical repository opt-in', async () => {
    await withTempDir(async (directory: string) => {
      const experimentsFolder: string = path.join(directory, 'common', 'config', 'rush');
      await fs.promises.mkdir(experimentsFolder, { recursive: true });
      await fs.promises.writeFile(
        path.join(experimentsFolder, 'experiments.json'),
        [
          '{',
          '  // "useRushReporter": true,',
          '  "exampleUrl": "https://example.test/*not-a-comment*/"',
          '}'
        ].join('\n')
      );
      const bootstrap: IInstallRunRushBootstrap = createInstallRunRushBootstrap(
        makeOptions(directory).options
      );

      expect(bootstrap.enabled).toBe(false);
    });
  });

  it('does not treat an older prerelease of the bootstrap version as compatible', async () => {
    await withTempDir(async (directory: string) => {
      expect(() =>
        createInstallRunRushBootstrap(
          makeOptions(directory, {
            argv: ['build', '--reporter=json'],
            rushVersion: '5.178.1-dev.1',
            bootstrapVersion: '5.178.1-dev.10'
          }).options
        )
      ).toThrow(/does not support the reporter bootstrap/);
    });
  });

  it('fails unsupported explicit requests and explicit requests for an old frontend', async () => {
    await withTempDir(async (directory: string) => {
      expect(() =>
        createInstallRunRushBootstrap(
          makeOptions(directory, { argv: ['build', '--reporter=unknown'] }).options
        )
      ).toThrow(/Unsupported reporter/);
      expect(() =>
        createInstallRunRushBootstrap(
          makeOptions(directory, {
            argv: ['build', '--reporter=json'],
            rushVersion: '5.177.0'
          }).options
        )
      ).toThrow(/does not support the reporter bootstrap/);
    });
  });

  it('honors the legacy emergency override before validating reporter controls', async () => {
    await withTempDir(async (directory: string) => {
      const { options, env } = makeOptions(directory, {
        argv: ['build', '--reporter=unknown', '--log-level=invalid']
      });
      env.RUSH_REPORTER = ' LEGACY ';

      expect(createInstallRunRushBootstrap(options).enabled).toBe(false);
    });
  });

  it('truncates replaceable startup status with a required marker', async () => {
    await withTempDir(async (directory: string) => {
      const { options, env } = makeOptions(directory, {
        argv: ['build', '--reporter=json'],
        maxBytes: 1800
      });
      const bootstrap: IInstallRunRushBootstrap = createInstallRunRushBootstrap(options);
      for (let index: number = 0; index < 50; index++) {
        bootstrap.logger.info(`status ${index} ${'x'.repeat(80)}`);
      }
      bootstrap.prepareToRun?.();

      const handoff = readHandoff(env);
      const eventRecords: Record<string, unknown>[] = handoff.records.slice(1);
      const marker: Record<string, unknown> = eventRecords[eventRecords.length - 1];
      expect(marker.type).toBe('extension');
      expect((marker.payload as { name: string }).name).toBe(BOOTSTRAP_BUFFER_TRUNCATED_EXTENSION_NAME);
      expect((marker.payload as { droppedReplaceable: number }).droppedReplaceable).toBeGreaterThan(0);
      expect(
        Buffer.byteLength(fs.readFileSync(handoff.path, 'utf8').split('\n').slice(1).join('\n'), 'utf8')
      ).toBeLessThanOrEqual(1800);
    });
  });

  it('fails instead of dropping required external output', async () => {
    await withTempDir(async (directory: string) => {
      const { options, env, stderr } = makeOptions(directory, {
        argv: ['build', '--reporter=json'],
        maxBytes: 800
      });
      const bootstrap: IInstallRunRushBootstrap = createInstallRunRushBootstrap(options);
      bootstrap.externalOutputHandler?.('stdout', 'x'.repeat(2000));

      expect(() => bootstrap.prepareToRun?.()).toThrow(/could not preserve/);
      bootstrap.logger.error('bootstrap failed');

      expect(env[RUSH_REPORTER_BOOTSTRAP_HANDOFF_ENV_VAR]).toBeUndefined();
      expect(stderr.join('')).toContain('bootstrap failed');
    });
  });

  it('fails when the npm capture reports overflow before replay', async () => {
    await withTempDir(async (directory: string) => {
      const { options } = makeOptions(directory, { argv: ['build', '--reporter=json'] });
      const bootstrap: IInstallRunRushBootstrap = createInstallRunRushBootstrap(options);
      bootstrap.externalOutputOverflowHandler?.();

      expect(() => bootstrap.prepareToRun?.()).toThrow(/could not preserve/);
    });
  });
});
