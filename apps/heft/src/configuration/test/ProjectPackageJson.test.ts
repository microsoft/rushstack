// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { PackageJsonLookup, type IPackageJson } from '@rushstack/node-core-library';
import { StringBufferTerminalProvider } from '@rushstack/terminal';

import { HeftConfiguration } from '../HeftConfiguration';
import { replaceAll, writeFiles } from './ConfigTestUtilities';

type Outcome = { value: IPackageJson; frozen: boolean } | { error: string };

function getOutcome(getPackageJson: () => IPackageJson): Outcome {
  try {
    const value: IPackageJson = getPackageJson();
    return { value, frozen: Object.isFrozen(value) };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

/**
 * Heft 1.3.1: HeftConfiguration.initialize() looked up the project with PackageJsonLookup.instance (which parses and
 * caches the package.json), and the projectPackageJson getter returned PackageJsonLookup.instance's cached object.
 */
function simulateOriginal(projectFolder: string, editAfterStartup: () => void): Outcome[] {
  const lookup: PackageJsonLookup = new PackageJsonLookup({ loadExtraFields: true });
  const packageJsonPath: string = lookup.tryGetPackageJsonFilePathFor(projectFolder)!;
  const buildFolderPath: string = path.dirname(packageJsonPath);
  editAfterStartup();
  return [
    getOutcome(() => lookup.tryLoadPackageJsonFor(buildFolderPath)!),
    getOutcome(() => lookup.tryLoadPackageJsonFor(buildFolderPath)!)
  ];
}

function runHeft(projectFolder: string, editAfterStartup: () => void): Outcome[] {
  const heftConfiguration: HeftConfiguration = HeftConfiguration.initialize({
    cwd: projectFolder,
    terminalProvider: new StringBufferTerminalProvider(),
    numberOfCores: 1
  });
  editAfterStartup();
  return [
    getOutcome(() => heftConfiguration.projectPackageJson),
    getOutcome(() => heftConfiguration.projectPackageJson)
  ];
}

describe('HeftConfiguration.projectPackageJson', () => {
  let tempFolder: string;
  let counter: number = 0;

  beforeAll(() => {
    tempFolder = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'heft-project-package-json-')));
  });

  afterAll(() => {
    fs.rmSync(tempFolder, { recursive: true, force: true });
  });

  function expectSameAsOriginal(packageJson: object | string, edit?: object | string): Outcome[] {
    const folders: string[] = ['original', 'heft'].map((kind: string) => {
      const projectFolder: string = path.join(tempFolder, `project-${counter}-${kind}`);
      writeFiles(projectFolder, { 'package.json': packageJson, 'src/.keep': '' });
      return projectFolder;
    });
    counter++;

    const editFor: (folder: string) => () => void = (folder: string) => () => {
      if (edit !== undefined) {
        // e.g. an edit in watch mode, after Heft started
        writeFiles(folder, { 'package.json': edit });
      }
    };
    const original: Outcome[] = simulateOriginal(path.join(folders[0], 'src'), editFor(folders[0]));
    const heft: Outcome[] = runHeft(path.join(folders[1], 'src'), editFor(folders[1]));
    expect(replaceAll(heft, folders[1], folders[0])).toEqual(original);
    return heft;
  }

  it('returns the frozen contents read at startup, like Heft 1.3.1', () => {
    const outcomes: Outcome[] = expectSameAsOriginal({ name: 'project', version: '1.0.0', extra: { a: 1 } });
    expect(outcomes[0]).toMatchObject({ frozen: true, value: { name: 'project', extra: { a: 1 } } });
  });

  it('ignores edits made after startup (e.g. in watch mode), like Heft 1.3.1', () => {
    const outcomes: Outcome[] = expectSameAsOriginal(
      { name: 'project', version: '1.0.0' },
      { name: 'project', version: '2.0.0', added: true }
    );
    expect(outcomes[0]).toMatchObject({ value: { version: '1.0.0' } });
    // An edit that makes the file invalid doesn't matter either
    expectSameAsOriginal({ name: 'project', version: '1.0.0' }, '{ invalid');
  });

  it('reports a missing "version" field with the original error, every time', () => {
    const outcomes: Outcome[] = expectSameAsOriginal({ name: 'project' });
    expect(outcomes[0]).toMatchObject({ error: expect.stringContaining('The required field "version"') });
  });

  it('returns the same object from every call', () => {
    const projectFolder: string = path.join(tempFolder, `project-${counter++}-identity`);
    writeFiles(projectFolder, { 'package.json': { name: 'project', version: '1.0.0' } });
    const heftConfiguration: HeftConfiguration = HeftConfiguration.initialize({
      cwd: projectFolder,
      terminalProvider: new StringBufferTerminalProvider(),
      numberOfCores: 1
    });
    expect(heftConfiguration.projectPackageJson).toBe(heftConfiguration.projectPackageJson);
  });
});
