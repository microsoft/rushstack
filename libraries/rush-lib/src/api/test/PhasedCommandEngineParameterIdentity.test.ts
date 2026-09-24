// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { NoOpTerminalProvider } from '@rushstack/terminal';

import { PhasedCommandEngine } from '../PhasedCommandEngine';
import { RushConfiguration } from '../RushConfiguration';
import { Rush } from '../Rush';
import { parseParallelism } from '../../logic/operations/ParseParallelism';

describe(`${PhasedCommandEngine.name} parameter identity`, () => {
  let folder: string;
  let rushConfiguration: RushConfiguration;

  function write(name: string, value: unknown): void {
    const filename: string = path.join(folder, name);
    fs.mkdirSync(path.dirname(filename), { recursive: true });
    fs.writeFileSync(filename, JSON.stringify(value));
  }

  async function parseAsync(...argv: string[]): Promise<PhasedCommandEngine> {
    return await PhasedCommandEngine.parseAsync({
      argv,
      cwd: folder,
      rushConfiguration,
      terminalProvider: new NoOpTerminalProvider()
    });
  }

  beforeAll(() => {
    folder = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'rush-engine-identity-')));
    write('rush.json', {
      rushVersion: Rush.version,
      npmVersion: '10.0.0',
      projectFolderMinDepth: 1,
      projects: [{ packageName: 'a', projectFolder: 'a' }]
    });
    write('a/package.json', { name: 'a', version: '1.0.0', scripts: { '_phase:compile': 'node -v' } });
    write('common/config/rush/command-line.json', {
      phases: [{ name: '_phase:compile', dependencies: { upstream: ['_phase:compile'] } }],
      commands: [
        {
          commandKind: 'phased',
          name: 'build',
          summary: 'Build',
          phases: ['_phase:compile'],
          incremental: true,
          enableParallelism: true
        }
      ],
      parameters: [
        {
          parameterKind: 'flag',
          longName: '--production',
          description: 'A graph-affecting custom parameter',
          associatedCommands: ['build'],
          associatedPhases: ['_phase:compile']
        }
      ]
    });
    rushConfiguration = RushConfiguration.loadFromConfigurationFile(path.join(folder, 'rush.json'));
  });

  afterAll(() => {
    fs.rmSync(folder, { recursive: true, force: true });
  });

  it('excludes presentation and scheduling parameters from the identity', async () => {
    const baseline: string = (await parseAsync('build')).parameterIdentity;
    for (const argv of [
      ['build', '--verbose'],
      ['build', '-v'],
      ['build', '--parallelism', '2'],
      ['build', '-p', 'max'],
      ['build', '--timeline'],
      ['build', '--to', 'a'],
      ['build', '--verbose', '-p', '1', '--timeline', '--only', 'a']
    ]) {
      expect((await parseAsync(...argv)).parameterIdentity).toBe(baseline);
    }
  });

  it('includes graph-affecting parameters and the command name in the identity', async () => {
    const baseline: string = (await parseAsync('build')).parameterIdentity;
    expect((await parseAsync('build', '--production')).parameterIdentity).not.toBe(baseline);
    expect((await parseAsync('build', '--production', '--verbose')).parameterIdentity).toBe(
      (await parseAsync('build', '--production')).parameterIdentity
    );
    expect((await parseAsync('rebuild')).parameterIdentity).not.toBe(baseline);
  });

  it('reports the excluded settings per request', async () => {
    expect((await parseAsync('build')).requestSettings).toEqual({
      quietMode: true,
      parallelism: parseParallelism(undefined)
    });
    expect((await parseAsync('build', '--verbose', '-p', '2')).requestSettings).toEqual({
      quietMode: false,
      parallelism: 2
    });
    expect((await parseAsync('build', '-p', '50%')).requestSettings).toEqual({
      quietMode: true,
      parallelism: { scalar: 0.5 }
    });
  });
});
