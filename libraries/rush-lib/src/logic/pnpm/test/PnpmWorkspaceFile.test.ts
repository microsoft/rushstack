// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';
import { FileSystem } from '@rushstack/node-core-library';
import { PnpmWorkspaceFile } from '../PnpmWorkspaceFile.ts';

describe(PnpmWorkspaceFile.name, () => {
  const tempDir: string = path.join(__dirname, 'temp');
  const workspaceFilePath: string = path.join(tempDir, 'pnpm-workspace.yaml');
  const projectsDir: string = path.join(tempDir, 'projects');

  let mockWriteFile: jest.SpyInstance;
  let mockReadFile: jest.SpyInstance;
  let mockExists: jest.SpyInstance;
  let writtenContent: string | undefined;

  beforeEach(() => {
    writtenContent = undefined;

    // Mock FileSystem.writeFile to capture content instead of writing to disk
    mockWriteFile = jest
      .spyOn(FileSystem, 'writeFile')
      .mockImplementation((filePath: string, contents: string | Buffer) => {
        void filePath; // Unused parameter
        writtenContent = typeof contents === 'string' ? contents : contents.toString();
      });

    // Mock FileSystem.readFile to return the written content
    mockReadFile = jest.spyOn(FileSystem, 'readFile').mockImplementation(() => {
      if (writtenContent === undefined) {
        throw new Error('File not found');
      }
      return writtenContent;
    });

    // Mock FileSystem.exists to return true if content was written
    mockExists = jest.spyOn(FileSystem, 'exists').mockImplementation(() => {
      return writtenContent !== undefined;
    });
  });

  afterEach(() => {
    mockWriteFile.mockRestore();
    mockReadFile.mockRestore();
    mockExists.mockRestore();
  });

  describe('basic functionality', () => {
    it('generates workspace file with packages only', () => {
      const workspaceFile: PnpmWorkspaceFile = new PnpmWorkspaceFile(workspaceFilePath);
      workspaceFile.addPackage(path.join(projectsDir, 'app1'));
      workspaceFile.addPackage(path.join(projectsDir, 'app2'));

      workspaceFile.save(workspaceFilePath, { onlyIfChanged: true });

      const content: string = FileSystem.readFile(workspaceFilePath);
      expect(content).toMatchSnapshot();
    });

    it('escapes special characters in package paths', () => {
      const workspaceFile: PnpmWorkspaceFile = new PnpmWorkspaceFile(workspaceFilePath);
      workspaceFile.addPackage(path.join(projectsDir, '[app-with-brackets]'));

      workspaceFile.save(workspaceFilePath, { onlyIfChanged: true });

      const content: string = FileSystem.readFile(workspaceFilePath);
      expect(content).toContain('\\[app-with-brackets\\]');
    });
  });

  describe('catalog functionality', () => {
    it('generates workspace file with default catalog only', () => {
      const workspaceFile: PnpmWorkspaceFile = new PnpmWorkspaceFile(workspaceFilePath);
      workspaceFile.addPackage(path.join(projectsDir, 'app1'));

      workspaceFile.setCatalogs({
        default: {
          react: '^18.0.0',
          'react-dom': '^18.0.0',
          typescript: '~5.3.0'
        }
      });

      workspaceFile.save(workspaceFilePath, { onlyIfChanged: true });

      const content: string = FileSystem.readFile(workspaceFilePath);
      expect(content).toMatchSnapshot();
    });

    it('generates workspace file with named catalogs', () => {
      const workspaceFile: PnpmWorkspaceFile = new PnpmWorkspaceFile(workspaceFilePath);
      workspaceFile.addPackage(path.join(projectsDir, 'app1'));

      workspaceFile.setCatalogs({
        default: {
          typescript: '~5.3.0'
        },
        frontend: {
          vue: '^3.4.0',
          'vue-router': '^4.2.0'
        },
        backend: {
          express: '^4.18.0',
          fastify: '^4.26.0'
        }
      });

      workspaceFile.save(workspaceFilePath, { onlyIfChanged: true });

      const content: string = FileSystem.readFile(workspaceFilePath);
      expect(content).toMatchSnapshot();
    });

    it('handles empty catalog object', () => {
      const workspaceFile: PnpmWorkspaceFile = new PnpmWorkspaceFile(workspaceFilePath);
      workspaceFile.addPackage(path.join(projectsDir, 'app1'));

      workspaceFile.setCatalogs({});

      workspaceFile.save(workspaceFilePath, { onlyIfChanged: true });

      const content: string = FileSystem.readFile(workspaceFilePath);
      expect(content).toMatchSnapshot();
    });

    it('handles undefined catalog', () => {
      const workspaceFile: PnpmWorkspaceFile = new PnpmWorkspaceFile(workspaceFilePath);
      workspaceFile.addPackage(path.join(projectsDir, 'app1'));

      workspaceFile.setCatalogs(undefined);

      workspaceFile.save(workspaceFilePath, { onlyIfChanged: true });

      const content: string = FileSystem.readFile(workspaceFilePath);
      expect(content).toMatchSnapshot();
    });

    it('handles scoped packages in catalogs', () => {
      const workspaceFile: PnpmWorkspaceFile = new PnpmWorkspaceFile(workspaceFilePath);
      workspaceFile.addPackage(path.join(projectsDir, 'app1'));

      workspaceFile.setCatalogs({
        default: {
          '@types/node': '~22.9.4',
          '@types/cookies': '^0.7.7',
          '@rushstack/node-core-library': '~5.0.0'
        }
      });

      workspaceFile.save(workspaceFilePath, { onlyIfChanged: true });

      const content: string = FileSystem.readFile(workspaceFilePath);
      expect(content).toMatchSnapshot();
    });

    it('can update catalogs after initial creation', () => {
      const workspaceFile: PnpmWorkspaceFile = new PnpmWorkspaceFile(workspaceFilePath);
      workspaceFile.addPackage(path.join(projectsDir, 'app1'));

      workspaceFile.setCatalogs({
        default: {
          react: '^18.0.0'
        }
      });

      workspaceFile.save(workspaceFilePath, { onlyIfChanged: true });

      // Update catalogs
      workspaceFile.setCatalogs({
        default: {
          react: '^18.2.0',
          'react-dom': '^18.2.0'
        }
      });

      workspaceFile.save(workspaceFilePath, { onlyIfChanged: true });

      const content: string = FileSystem.readFile(workspaceFilePath);
      expect(content).toMatchSnapshot();
    });
  });
});
