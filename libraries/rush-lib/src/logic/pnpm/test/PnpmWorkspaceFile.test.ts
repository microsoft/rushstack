// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';
import { FileSystem } from '@rushstack/node-core-library';
import { PnpmWorkspaceFile } from '../PnpmWorkspaceFile';

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

  describe('allowBuilds functionality', () => {
    it('generates workspace file with allowBuilds', () => {
      const workspaceFile: PnpmWorkspaceFile = new PnpmWorkspaceFile(workspaceFilePath);
      workspaceFile.addPackage(path.join(projectsDir, 'app1'));

      workspaceFile.setAllowBuilds({
        esbuild: true,
        '@parcel/watcher': true,
        fsevents: false
      });

      workspaceFile.save(workspaceFilePath, { onlyIfChanged: true });

      const content: string = FileSystem.readFile(workspaceFilePath);
      expect(content).toMatchSnapshot();
    });

    it('generates workspace file with allowBuilds and catalogs', () => {
      const workspaceFile: PnpmWorkspaceFile = new PnpmWorkspaceFile(workspaceFilePath);
      workspaceFile.addPackage(path.join(projectsDir, 'app1'));

      workspaceFile.setCatalogs({
        default: {
          react: '^18.0.0'
        }
      });

      workspaceFile.setAllowBuilds({
        esbuild: true
      });

      workspaceFile.save(workspaceFilePath, { onlyIfChanged: true });

      const content: string = FileSystem.readFile(workspaceFilePath);
      expect(content).toMatchSnapshot();
    });

    it('handles empty allowBuilds object', () => {
      const workspaceFile: PnpmWorkspaceFile = new PnpmWorkspaceFile(workspaceFilePath);
      workspaceFile.addPackage(path.join(projectsDir, 'app1'));

      workspaceFile.setAllowBuilds({});

      workspaceFile.save(workspaceFilePath, { onlyIfChanged: true });

      const content: string = FileSystem.readFile(workspaceFilePath);
      expect(content).not.toContain('allowBuilds');
    });

    it('handles undefined allowBuilds', () => {
      const workspaceFile: PnpmWorkspaceFile = new PnpmWorkspaceFile(workspaceFilePath);
      workspaceFile.addPackage(path.join(projectsDir, 'app1'));

      workspaceFile.setAllowBuilds(undefined);

      workspaceFile.save(workspaceFilePath, { onlyIfChanged: true });

      const content: string = FileSystem.readFile(workspaceFilePath);
      expect(content).not.toContain('allowBuilds');
    });
  });

  describe('overrides functionality', () => {
    it('generates workspace file with overrides', () => {
      const workspaceFile: PnpmWorkspaceFile = new PnpmWorkspaceFile(workspaceFilePath);
      workspaceFile.addPackage(path.join(projectsDir, 'app1'));

      workspaceFile.setOverrides({
        'foo@1.0.0': '1.0.1',
        bar: '^2.0.0'
      });

      workspaceFile.save(workspaceFilePath, { onlyIfChanged: true });

      const content: string = FileSystem.readFile(workspaceFilePath);
      expect(content).toContain('overrides:');
      expect(content).toMatchSnapshot();
    });

    it('handles undefined overrides', () => {
      const workspaceFile: PnpmWorkspaceFile = new PnpmWorkspaceFile(workspaceFilePath);
      workspaceFile.addPackage(path.join(projectsDir, 'app1'));

      workspaceFile.setOverrides(undefined);

      workspaceFile.save(workspaceFilePath, { onlyIfChanged: true });

      const content: string = FileSystem.readFile(workspaceFilePath);
      expect(content).not.toContain('overrides');
    });
  });

  describe('packageExtensions functionality', () => {
    it('generates workspace file with packageExtensions', () => {
      const workspaceFile: PnpmWorkspaceFile = new PnpmWorkspaceFile(workspaceFilePath);
      workspaceFile.addPackage(path.join(projectsDir, 'app1'));

      workspaceFile.setPackageExtensions({
        'react@*': {
          dependencies: {
            foo: '1.0.0'
          }
        }
      });

      workspaceFile.save(workspaceFilePath, { onlyIfChanged: true });

      const content: string = FileSystem.readFile(workspaceFilePath);
      expect(content).toContain('packageExtensions:');
      expect(content).toMatchSnapshot();
    });

    it('handles undefined packageExtensions', () => {
      const workspaceFile: PnpmWorkspaceFile = new PnpmWorkspaceFile(workspaceFilePath);
      workspaceFile.addPackage(path.join(projectsDir, 'app1'));

      workspaceFile.setPackageExtensions(undefined);

      workspaceFile.save(workspaceFilePath, { onlyIfChanged: true });

      const content: string = FileSystem.readFile(workspaceFilePath);
      expect(content).not.toContain('packageExtensions');
    });
  });

  describe('peerDependencyRules functionality', () => {
    it('generates workspace file with peerDependencyRules', () => {
      const workspaceFile: PnpmWorkspaceFile = new PnpmWorkspaceFile(workspaceFilePath);
      workspaceFile.addPackage(path.join(projectsDir, 'app1'));

      workspaceFile.setPeerDependencyRules({
        ignoreMissing: ['baz'],
        allowedVersions: {
          react: '18'
        }
      });

      workspaceFile.save(workspaceFilePath, { onlyIfChanged: true });

      const content: string = FileSystem.readFile(workspaceFilePath);
      expect(content).toContain('peerDependencyRules:');
      expect(content).toMatchSnapshot();
    });

    it('handles undefined peerDependencyRules', () => {
      const workspaceFile: PnpmWorkspaceFile = new PnpmWorkspaceFile(workspaceFilePath);
      workspaceFile.addPackage(path.join(projectsDir, 'app1'));

      workspaceFile.setPeerDependencyRules(undefined);

      workspaceFile.save(workspaceFilePath, { onlyIfChanged: true });

      const content: string = FileSystem.readFile(workspaceFilePath);
      expect(content).not.toContain('peerDependencyRules');
    });
  });

  describe('allowedDeprecatedVersions functionality', () => {
    it('generates workspace file with allowedDeprecatedVersions', () => {
      const workspaceFile: PnpmWorkspaceFile = new PnpmWorkspaceFile(workspaceFilePath);
      workspaceFile.addPackage(path.join(projectsDir, 'app1'));

      workspaceFile.setAllowedDeprecatedVersions({
        querystring: '*'
      });

      workspaceFile.save(workspaceFilePath, { onlyIfChanged: true });

      const content: string = FileSystem.readFile(workspaceFilePath);
      expect(content).toContain('allowedDeprecatedVersions:');
      expect(content).toMatchSnapshot();
    });

    it('handles undefined allowedDeprecatedVersions', () => {
      const workspaceFile: PnpmWorkspaceFile = new PnpmWorkspaceFile(workspaceFilePath);
      workspaceFile.addPackage(path.join(projectsDir, 'app1'));

      workspaceFile.setAllowedDeprecatedVersions(undefined);

      workspaceFile.save(workspaceFilePath, { onlyIfChanged: true });

      const content: string = FileSystem.readFile(workspaceFilePath);
      expect(content).not.toContain('allowedDeprecatedVersions');
    });
  });

  describe('patchedDependencies functionality', () => {
    it('generates workspace file with patchedDependencies', () => {
      const workspaceFile: PnpmWorkspaceFile = new PnpmWorkspaceFile(workspaceFilePath);
      workspaceFile.addPackage(path.join(projectsDir, 'app1'));

      workspaceFile.setPatchedDependencies({
        'lodash@4.17.21': 'patches/lodash@4.17.21.patch'
      });

      workspaceFile.save(workspaceFilePath, { onlyIfChanged: true });

      const content: string = FileSystem.readFile(workspaceFilePath);
      expect(content).toContain('patchedDependencies:');
      expect(content).toMatchSnapshot();
    });

    it('handles undefined patchedDependencies', () => {
      const workspaceFile: PnpmWorkspaceFile = new PnpmWorkspaceFile(workspaceFilePath);
      workspaceFile.addPackage(path.join(projectsDir, 'app1'));

      workspaceFile.setPatchedDependencies(undefined);

      workspaceFile.save(workspaceFilePath, { onlyIfChanged: true });

      const content: string = FileSystem.readFile(workspaceFilePath);
      expect(content).not.toContain('patchedDependencies');
    });
  });

  describe('combined pnpm 11 settings', () => {
    it('generates workspace file with all relocated settings together', () => {
      const workspaceFile: PnpmWorkspaceFile = new PnpmWorkspaceFile(workspaceFilePath);
      workspaceFile.addPackage(path.join(projectsDir, 'app1'));

      workspaceFile.setCatalogs({
        default: {
          react: '^18.0.0'
        }
      });
      workspaceFile.setAllowBuilds({
        esbuild: true
      });
      workspaceFile.setOverrides({
        'foo@1.0.0': '1.0.1'
      });
      workspaceFile.setPackageExtensions({
        'react@*': {
          dependencies: {
            foo: '1.0.0'
          }
        }
      });
      workspaceFile.setPeerDependencyRules({
        allowedVersions: {
          react: '18'
        }
      });
      workspaceFile.setAllowedDeprecatedVersions({
        querystring: '*'
      });
      workspaceFile.setPatchedDependencies({
        'lodash@4.17.21': 'patches/lodash@4.17.21.patch'
      });

      workspaceFile.save(workspaceFilePath, { onlyIfChanged: true });

      const content: string = FileSystem.readFile(workspaceFilePath);
      expect(content).toMatchSnapshot();
    });
  });

  describe('minimumReleaseAge functionality', () => {
    it('generates workspace file with minimumReleaseAge', () => {
      const workspaceFile: PnpmWorkspaceFile = new PnpmWorkspaceFile(workspaceFilePath);
      workspaceFile.addPackage(path.join(projectsDir, 'app1'));

      workspaceFile.setMinimumReleaseAge(20160);

      workspaceFile.save(workspaceFilePath, { onlyIfChanged: true });

      const content: string = FileSystem.readFile(workspaceFilePath);
      expect(content).toMatchSnapshot();
    });

    it('generates workspace file with minimumReleaseAge and minimumReleaseAgeExclude', () => {
      const workspaceFile: PnpmWorkspaceFile = new PnpmWorkspaceFile(workspaceFilePath);
      workspaceFile.addPackage(path.join(projectsDir, 'app1'));

      workspaceFile.setMinimumReleaseAge(1440);
      workspaceFile.setMinimumReleaseAgeExclude(['webpack', '@myorg/*']);

      workspaceFile.save(workspaceFilePath, { onlyIfChanged: true });

      const content: string = FileSystem.readFile(workspaceFilePath);
      expect(content).toMatchSnapshot();
    });

    it('generates workspace file with minimumReleaseAgeExclude only', () => {
      const workspaceFile: PnpmWorkspaceFile = new PnpmWorkspaceFile(workspaceFilePath);
      workspaceFile.addPackage(path.join(projectsDir, 'app1'));

      workspaceFile.setMinimumReleaseAgeExclude(['webpack']);

      workspaceFile.save(workspaceFilePath, { onlyIfChanged: true });

      const content: string = FileSystem.readFile(workspaceFilePath);
      expect(content).toMatchSnapshot();
    });

    it('handles zero value for minimumReleaseAge', () => {
      const workspaceFile: PnpmWorkspaceFile = new PnpmWorkspaceFile(workspaceFilePath);
      workspaceFile.addPackage(path.join(projectsDir, 'app1'));

      workspaceFile.setMinimumReleaseAge(0);

      workspaceFile.save(workspaceFilePath, { onlyIfChanged: true });

      const content: string = FileSystem.readFile(workspaceFilePath);
      expect(content).toContain('minimumReleaseAge: 0');
    });

    it('handles undefined minimumReleaseAge', () => {
      const workspaceFile: PnpmWorkspaceFile = new PnpmWorkspaceFile(workspaceFilePath);
      workspaceFile.addPackage(path.join(projectsDir, 'app1'));

      workspaceFile.setMinimumReleaseAge(undefined);
      workspaceFile.setMinimumReleaseAgeExclude(undefined);

      workspaceFile.save(workspaceFilePath, { onlyIfChanged: true });

      const content: string = FileSystem.readFile(workspaceFilePath);
      expect(content).not.toContain('minimumReleaseAge');
    });

    it('passes through an explicitly-set empty minimumReleaseAgeExclude', () => {
      const workspaceFile: PnpmWorkspaceFile = new PnpmWorkspaceFile(workspaceFilePath);
      workspaceFile.addPackage(path.join(projectsDir, 'app1'));

      workspaceFile.setMinimumReleaseAgeExclude([]);

      workspaceFile.save(workspaceFilePath, { onlyIfChanged: true });

      const content: string = FileSystem.readFile(workspaceFilePath);
      expect(content).toContain('minimumReleaseAgeExclude: []');
    });

    it('omits an undefined minimumReleaseAgeExclude', () => {
      const workspaceFile: PnpmWorkspaceFile = new PnpmWorkspaceFile(workspaceFilePath);
      workspaceFile.addPackage(path.join(projectsDir, 'app1'));

      workspaceFile.setMinimumReleaseAgeExclude(undefined);

      workspaceFile.save(workspaceFilePath, { onlyIfChanged: true });

      const content: string = FileSystem.readFile(workspaceFilePath);
      expect(content).not.toContain('minimumReleaseAgeExclude');
    });
  });
});
