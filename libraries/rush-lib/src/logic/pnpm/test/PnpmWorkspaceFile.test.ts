// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';
import * as os from 'node:os';
import * as fs from 'node:fs';
import { FileSystem } from '@rushstack/node-core-library';
import { PnpmWorkspaceFile } from '../PnpmWorkspaceFile';

describe(PnpmWorkspaceFile.name, () => {
  let tempDir: string;

  beforeEach(() => {
    // Create a temporary directory for test files
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pnpm-workspace-test-'));
  });

  afterEach(() => {
    // Clean up the temporary directory
    FileSystem.deleteFolder(tempDir);
  });

  it('serializes workspace without catalogs', () => {
    const workspaceFile: PnpmWorkspaceFile = new PnpmWorkspaceFile(
      path.join(tempDir, 'pnpm-workspace.yaml')
    );
    workspaceFile.addPackage('packages/project-a');
    workspaceFile.addPackage('packages/project-b');

    workspaceFile.save(workspaceFile.workspaceFilename, { ensureFolderExists: true });

    const content: string = FileSystem.readFile(workspaceFile.workspaceFilename);
    expect(content).toContain('packages:');
    expect(content).toContain('packages/project-a');
    expect(content).toContain('packages/project-b');
    expect(content).not.toContain('catalogs:');
  });

  it('serializes workspace with named catalogs', () => {
    const workspaceFile: PnpmWorkspaceFile = new PnpmWorkspaceFile(
      path.join(tempDir, 'pnpm-workspace.yaml')
    );
    workspaceFile.addPackage('packages/project-a');
    workspaceFile.setCatalogs({
      default: {
        lodash: '^4.17.21',
        typescript: '~5.0.0'
      },
      react18: {
        react: '^18.2.0',
        'react-dom': '^18.2.0'
      },
      testing: {
        jest: '^29.0.0',
        mocha: '^10.0.0'
      }
    });

    workspaceFile.save(workspaceFile.workspaceFilename, { ensureFolderExists: true });

    const content: string = FileSystem.readFile(workspaceFile.workspaceFilename);
    expect(content).toContain('packages:');
    expect(content).toContain('catalogs:');
    expect(content).toContain('default:');
    expect(content).toContain('lodash:');
    expect(content).toContain('^4.17.21');
    expect(content).toContain('react18:');
    expect(content).toContain('react:');
    expect(content).toContain('^18.2.0');
    expect(content).toContain('testing:');
    expect(content).toContain('jest:');
    expect(content).toContain('^29.0.0');
  });

  it('does not include empty catalogs', () => {
    const workspaceFile: PnpmWorkspaceFile = new PnpmWorkspaceFile(
      path.join(tempDir, 'pnpm-workspace.yaml')
    );
    workspaceFile.addPackage('packages/project-a');
    workspaceFile.setCatalogs({});

    workspaceFile.save(workspaceFile.workspaceFilename, { ensureFolderExists: true });

    const content: string = FileSystem.readFile(workspaceFile.workspaceFilename);
    expect(content).toContain('packages:');
    expect(content).not.toContain('catalogs:');
  });

  it('sorts catalog entries alphabetically', () => {
    const workspaceFile: PnpmWorkspaceFile = new PnpmWorkspaceFile(
      path.join(tempDir, 'pnpm-workspace.yaml')
    );
    workspaceFile.addPackage('packages/project-a');
    workspaceFile.setCatalogs({
      default: {
        zod: '^3.0.0',
        axios: '^1.0.0',
        lodash: '^4.17.21'
      }
    });

    workspaceFile.save(workspaceFile.workspaceFilename, { ensureFolderExists: true });

    const content: string = FileSystem.readFile(workspaceFile.workspaceFilename);
    const axiosIndex: number = content.indexOf('axios:');
    const lodashIndex: number = content.indexOf('lodash:');
    const zodIndex: number = content.indexOf('zod:');

    expect(axiosIndex).toBeLessThan(lodashIndex);
    expect(lodashIndex).toBeLessThan(zodIndex);
  });

  it('clears catalogs when set to undefined', () => {
    const workspaceFile: PnpmWorkspaceFile = new PnpmWorkspaceFile(
      path.join(tempDir, 'pnpm-workspace.yaml')
    );
    workspaceFile.addPackage('packages/project-a');
    workspaceFile.setCatalogs({
      default: {
        lodash: '^4.17.21'
      }
    });
    workspaceFile.setCatalogs(undefined);

    workspaceFile.save(workspaceFile.workspaceFilename, { ensureFolderExists: true });

    const content: string = FileSystem.readFile(workspaceFile.workspaceFilename);
    expect(content).not.toContain('catalogs:');
    expect(content).not.toContain('lodash:');
  });
});
