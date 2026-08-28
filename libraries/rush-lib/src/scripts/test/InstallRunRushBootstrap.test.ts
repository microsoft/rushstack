// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { syncNpmrc } from '../../utilities/npmrcUtilities';
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
      bootstrap.externalOutputHandler?.('stdout', 'npm line 1\nnpm line 2\n', false);
      bootstrap.logger.info('invoking Rush');
      bootstrap.prepareToRun?.();

      const handoff = readHandoff(env);
      expect(bootstrap.enabled).toBe(true);
      expect(bootstrap.externalOutputLiveStreams).toEqual({ stdout: false, stderr: true });
      expect(stdout).toEqual([]);
      expect(env[RUSH_REPORTER_BOOTSTRAP_NONCE_ENV_VAR]).toBe(
        (handoff.records[0] as { nonce?: string }).nonce
      );
      expect(handoff.records.slice(1).map((record: Record<string, unknown>) => record.type)).toEqual([
        'sessionStarted',
        'activityChanged',
        'externalOutput',
        'activityChanged'
      ]);
      expect((handoff.records[3].payload as { text: string }).text).toBe('npm line 1\nnpm line 2\n');
      expect((handoff.records[3].payload as { wasRendered?: boolean }).wasRendered).toBeUndefined();
      if (process.platform !== 'win32') {
        expect(fs.statSync(handoff.path).mode % 0o1000).toBe(0o600);
      }
    });
  });

  it('does not publish the working directory or full argv as public bootstrap data', async () => {
    await withTempDir(async (directory: string) => {
      const secretArgument: string = '--token=bootstrap-secret-value';
      const secretCwd: string = path.join(directory, 'secret-worktree-name');
      const cwdSpy: jest.SpyInstance = jest.spyOn(process, 'cwd').mockReturnValue(secretCwd);
      try {
        const { options, env } = makeOptions(directory, {
          argv: ['build', '--reporter=json', secretArgument]
        });
        const bootstrap: IInstallRunRushBootstrap = createInstallRunRushBootstrap(options);
        bootstrap.prepareToRun?.();

        const handoff = readHandoff(env);
        const serialized: string = fs.readFileSync(handoff.path, 'utf8');
        expect(serialized).not.toContain(secretArgument);
        expect(serialized).not.toContain(secretCwd);
        expect(handoff.records[1]).toMatchObject({
          privacy: 'public',
          type: 'sessionStarted',
          payload: { rushVersion: '5.178.1' }
        });
        expect(handoff.records).toHaveLength(2);
      } finally {
        cwdSpy.mockRestore();
      }
    });
  });

  it('classifies path-bearing installation activity as local-sensitive', async () => {
    await withTempDir(async (directory: string) => {
      const sourceFolder: string = path.join(directory, 'sentinel-source-npmrc');
      const targetFolder: string = path.join(directory, 'sentinel-target-npmrc');
      const lockFilePath: string = path.join(directory, 'sentinel-lockfile', 'package-lock.json');
      await fs.promises.mkdir(sourceFolder, { recursive: true });
      await fs.promises.writeFile(path.join(sourceFolder, '.npmrc'), 'registry=https://example.test\n');

      const { options, env } = makeOptions(directory, {
        argv: ['build', '--reporter=json']
      });
      const bootstrap: IInstallRunRushBootstrap = createInstallRunRushBootstrap(options);
      bootstrap.logger.info('Installing @microsoft/rush...');
      syncNpmrc({
        sourceNpmrcFolder: sourceFolder,
        targetNpmrcFolder: targetFolder,
        logger: bootstrap.logger,
        supportEnvVarFallbackSyntax: false
      });
      bootstrap.logger.info(
        `Found INSTALL_RUN_RUSH_LOCKFILE_PATH="${lockFilePath}", installing with lockfile.`,
        'local-sensitive'
      );
      await fs.promises.rm(path.join(sourceFolder, '.npmrc'));
      syncNpmrc({
        sourceNpmrcFolder: sourceFolder,
        targetNpmrcFolder: targetFolder,
        logger: bootstrap.logger,
        supportEnvVarFallbackSyntax: false
      });
      bootstrap.prepareToRun?.();

      const events: Record<string, unknown>[] = readHandoff(env).records.slice(1);
      const activityEvents: Record<string, unknown>[] = events.filter(
        (event: Record<string, unknown>) => event.type === 'activityChanged'
      );
      expect(
        activityEvents.find(
          (event: Record<string, unknown>) =>
            (event.payload as { text?: string }).text === 'Installing @microsoft/rush...'
        )
      ).toMatchObject({ privacy: 'public' });

      for (const sentinelPath of [sourceFolder, targetFolder, lockFilePath]) {
        const matchingEvents: Record<string, unknown>[] = activityEvents.filter(
          (event: Record<string, unknown>) =>
            (event.payload as { text?: string }).text?.includes(sentinelPath) === true
        );
        expect(matchingEvents.length).toBeGreaterThan(0);
        expect(
          matchingEvents.every((event: Record<string, unknown>) => event.privacy === 'local-sensitive')
        ).toBe(true);
      }
      expect(
        activityEvents
          .filter((event: Record<string, unknown>) => event.privacy === 'public')
          .map((event: Record<string, unknown>) => (event.payload as { text?: string }).text)
          .join('\n')
      ).not.toContain(directory);
    });
  });

  it('stops parsing reporter controls at the pass-through separator', async () => {
    await withTempDir(async (directory: string) => {
      expect(
        createInstallRunRushBootstrap(
          makeOptions(directory, {
            argv: ['build', '--', '--reporter=unknown', '--log-level=invalid']
          }).options
        ).enabled
      ).toBe(false);

      expect(
        createInstallRunRushBootstrap(
          makeOptions(directory, {
            argv: ['build', '--reporter=json', '--', '--reporter=unknown', '--log-level=invalid']
          }).options
        ).enabled
      ).toBe(true);
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
      bootstrap.externalOutputHandler?.('stdout', 'x'.repeat(2000), true);

      expect(() => bootstrap.prepareToRun?.()).toThrow(/could not preserve/);
      bootstrap.logger.error('bootstrap failed');

      expect(env[RUSH_REPORTER_BOOTSTRAP_HANDOFF_ENV_VAR]).toBeUndefined();
      expect(stderr.join('')).toContain('bootstrap failed');
      expect(stderr.join('')).not.toContain('xxx');
    });
  });

  it('keeps machine-reporter failure fallback off stdout', async () => {
    await withTempDir(async (directory: string) => {
      const { options, stdout, stderr } = makeOptions(directory, {
        argv: ['build', '--reporter=json']
      });
      const bootstrap: IInstallRunRushBootstrap = createInstallRunRushBootstrap(options);
      bootstrap.logger.info('installing Rush');
      bootstrap.externalOutputHandler?.('stdout', 'npm stdout\n', false);
      bootstrap.logger.error('bootstrap failed');

      expect(stdout).toEqual([]);
      expect(stderr.join('')).toBe('installing Rush\nnpm stdout\nbootstrap failed\n');
    });
  });

  it('keeps capture-damage warnings outside required handoff accounting', async () => {
    await withTempDir(async (directory: string) => {
      const { options, env, stderr } = makeOptions(directory, {
        argv: ['build', '--reporter=json'],
        maxBytes: 1200
      });
      const bootstrap: IInstallRunRushBootstrap = createInstallRunRushBootstrap(options);
      for (let index: number = 0; index < 20; index++) {
        bootstrap.logger.warning?.(
          `Warning: npm output capture "${path.join(directory, `capture-${index}.ndjson`)}" was corrupt.`,
          'local-sensitive'
        );
      }

      expect(() => bootstrap.prepareToRun?.()).not.toThrow();
      expect(readHandoff(env).records).toHaveLength(2);
      expect(stderr).toHaveLength(20);
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
