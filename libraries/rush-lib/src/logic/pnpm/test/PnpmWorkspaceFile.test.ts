// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { FileSystem } from '@rushstack/node-core-library';
import { PnpmWorkspaceFile } from '../PnpmWorkspaceFile';

describe(PnpmWorkspaceFile.name, () => {
  const tempDir: string = `${__dirname}/temp`;
  const workspaceFilePath: string = `${tempDir}/pnpm-workspace.yaml`;
  const projectsDir: string = `${tempDir}/projects`;

  let writtenContent: string | undefined;

  beforeEach(() => {
    writtenContent = undefined;

    // Mock FileSystem.writeFile to capture content instead of writing to disk
    jest
      .spyOn(FileSystem, 'writeFileAsync')
      .mockImplementation(async (filePath: string, contents: string | Buffer) => {
        writtenContent = String(contents);
      });
  });

  describe('basic functionality', () => {
    it('generates workspace file with packages only', async () => {
      const workspaceFile: PnpmWorkspaceFile = new PnpmWorkspaceFile(workspaceFilePath);
      workspaceFile.addPackage(`${projectsDir}/app2`);
      workspaceFile.addPackage(`${projectsDir}/app1`);

      await workspaceFile.saveAsync(workspaceFilePath, { onlyIfChanged: true });

      expect(writtenContent).toMatchSnapshot();
    });

    it('escapes special characters in package paths', async () => {
      const workspaceFile: PnpmWorkspaceFile = new PnpmWorkspaceFile(workspaceFilePath);
      workspaceFile.addPackage(`${projectsDir}/[app-with-brackets]`);

      await workspaceFile.saveAsync(workspaceFilePath, { onlyIfChanged: true });

      expect(writtenContent).toContain('\\[app-with-brackets\\]');
    });
  });

  describe('catalog functionality', () => {
    it('generates workspace file with default catalog only', async () => {
      const workspaceFile: PnpmWorkspaceFile = new PnpmWorkspaceFile(workspaceFilePath);
      workspaceFile.addPackage(`${projectsDir}/app1`);

      workspaceFile.catalogs = {
        default: {
          react: '^18.0.0',
          'react-dom': '^18.0.0',
          typescript: '~5.3.0'
        }
      };

      await workspaceFile.saveAsync(workspaceFilePath, { onlyIfChanged: true });

      expect(writtenContent).toMatchSnapshot();
    });

    it('generates workspace file with named catalogs', async () => {
      const workspaceFile: PnpmWorkspaceFile = new PnpmWorkspaceFile(workspaceFilePath);
      workspaceFile.addPackage(`${projectsDir}/app1`);

      workspaceFile.catalogs = {
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
      };

      await workspaceFile.saveAsync(workspaceFilePath, { onlyIfChanged: true });

      expect(writtenContent).toMatchSnapshot();
    });

    it('handles empty catalog object', async () => {
      const workspaceFile: PnpmWorkspaceFile = new PnpmWorkspaceFile(workspaceFilePath);
      workspaceFile.addPackage(`${projectsDir}/app1`);

      workspaceFile.catalogs = {};

      await workspaceFile.saveAsync(workspaceFilePath, { onlyIfChanged: true });

      expect(writtenContent).toMatchSnapshot();
    });

    it('handles undefined catalog', async () => {
      const workspaceFile: PnpmWorkspaceFile = new PnpmWorkspaceFile(workspaceFilePath);
      workspaceFile.addPackage(`${projectsDir}/app1`);

      workspaceFile.catalogs = undefined;

      await workspaceFile.saveAsync(workspaceFilePath, { onlyIfChanged: true });

      expect(writtenContent).toMatchSnapshot();
    });

    it('handles scoped packages in catalogs', async () => {
      const workspaceFile: PnpmWorkspaceFile = new PnpmWorkspaceFile(workspaceFilePath);
      workspaceFile.addPackage(`${projectsDir}/app1`);

      workspaceFile.catalogs = {
        default: {
          '@types/node': '~22.9.4',
          '@types/cookies': '^0.7.7',
          '@rushstack/node-core-library': '~5.0.0'
        }
      };

      await workspaceFile.saveAsync(workspaceFilePath, { onlyIfChanged: true });

      expect(writtenContent).toMatchSnapshot();
    });

    it('can update catalogs after initial creation', async () => {
      const workspaceFile: PnpmWorkspaceFile = new PnpmWorkspaceFile(workspaceFilePath);
      workspaceFile.addPackage(`${projectsDir}/app1`);

      workspaceFile.catalogs = {
        default: {
          react: '^18.0.0'
        }
      };

      await workspaceFile.saveAsync(workspaceFilePath, { onlyIfChanged: true });

      // Update catalogs
      workspaceFile.catalogs = {
        default: {
          react: '^18.2.0',
          'react-dom': '^18.2.0'
        }
      };

      await workspaceFile.saveAsync(workspaceFilePath, { onlyIfChanged: true });

      expect(writtenContent).toMatchSnapshot();
    });
  });

  describe('allowBuilds functionality', () => {
    it('generates workspace file with allowBuilds', async () => {
      const workspaceFile: PnpmWorkspaceFile = new PnpmWorkspaceFile(workspaceFilePath);
      workspaceFile.addPackage(`${projectsDir}/app1`);

      workspaceFile.allowBuilds = {
        esbuild: true,
        '@parcel/watcher': true,
        fsevents: false
      };

      await workspaceFile.saveAsync(workspaceFilePath, { onlyIfChanged: true });

      expect(writtenContent).toMatchSnapshot();
    });

    it('generates workspace file with allowBuilds and catalogs', async () => {
      const workspaceFile: PnpmWorkspaceFile = new PnpmWorkspaceFile(workspaceFilePath);
      workspaceFile.addPackage(`${projectsDir}/app1`);

      workspaceFile.catalogs = {
        default: {
          react: '^18.0.0'
        }
      };

      workspaceFile.allowBuilds = {
        esbuild: true
      };

      await workspaceFile.saveAsync(workspaceFilePath, { onlyIfChanged: true });

      expect(writtenContent).toMatchSnapshot();
    });

    it('handles empty allowBuilds object', async () => {
      const workspaceFile: PnpmWorkspaceFile = new PnpmWorkspaceFile(workspaceFilePath);
      workspaceFile.addPackage(`${projectsDir}/app1`);

      workspaceFile.allowBuilds = {};

      await workspaceFile.saveAsync(workspaceFilePath, { onlyIfChanged: true });

      expect(writtenContent).toContain('allowBuilds: {}');
    });

    it('handles undefined allowBuilds', async () => {
      const workspaceFile: PnpmWorkspaceFile = new PnpmWorkspaceFile(workspaceFilePath);
      workspaceFile.addPackage(`${projectsDir}/app1`);

      workspaceFile.allowBuilds = undefined;

      await workspaceFile.saveAsync(workspaceFilePath, { onlyIfChanged: true });

      expect(writtenContent).not.toContain('allowBuilds');
    });
  });

  describe('minimumReleaseAge functionality', () => {
    it('generates workspace file with minimumReleaseAge', async () => {
      const workspaceFile: PnpmWorkspaceFile = new PnpmWorkspaceFile(workspaceFilePath);
      workspaceFile.addPackage(`${projectsDir}/app1`);

      workspaceFile.minimumReleaseAge = 20160;

      await workspaceFile.saveAsync(workspaceFilePath, { onlyIfChanged: true });

      expect(writtenContent).toMatchSnapshot();
    });

    it('generates workspace file with minimumReleaseAge and minimumReleaseAgeExclude', async () => {
      const workspaceFile: PnpmWorkspaceFile = new PnpmWorkspaceFile(workspaceFilePath);
      workspaceFile.addPackage(`${projectsDir}/app1`);

      workspaceFile.minimumReleaseAge = 1440;
      workspaceFile.minimumReleaseAgeExclude = ['webpack', '@myorg/*'];

      await workspaceFile.saveAsync(workspaceFilePath, { onlyIfChanged: true });

      expect(writtenContent).toMatchSnapshot();
    });

    it('generates workspace file with minimumReleaseAgeExclude only', async () => {
      const workspaceFile: PnpmWorkspaceFile = new PnpmWorkspaceFile(workspaceFilePath);
      workspaceFile.addPackage(`${projectsDir}/app1`);

      workspaceFile.minimumReleaseAgeExclude = ['webpack'];

      await workspaceFile.saveAsync(workspaceFilePath, { onlyIfChanged: true });

      expect(writtenContent).toMatchSnapshot();
    });

    it('handles zero value for minimumReleaseAge', async () => {
      const workspaceFile: PnpmWorkspaceFile = new PnpmWorkspaceFile(workspaceFilePath);
      workspaceFile.addPackage(`${projectsDir}/app1`);

      workspaceFile.minimumReleaseAge = 0;

      await workspaceFile.saveAsync(workspaceFilePath, { onlyIfChanged: true });

      expect(writtenContent).toContain('minimumReleaseAge: 0');
    });

    it('handles undefined minimumReleaseAge', async () => {
      const workspaceFile: PnpmWorkspaceFile = new PnpmWorkspaceFile(workspaceFilePath);
      workspaceFile.addPackage(`${projectsDir}/app1`);

      workspaceFile.minimumReleaseAge = undefined;
      workspaceFile.minimumReleaseAgeExclude = undefined;

      await workspaceFile.saveAsync(workspaceFilePath, { onlyIfChanged: true });

      expect(writtenContent).not.toContain('minimumReleaseAge');
    });

    it('passes through an explicitly-set empty minimumReleaseAgeExclude', async () => {
      const workspaceFile: PnpmWorkspaceFile = new PnpmWorkspaceFile(workspaceFilePath);
      workspaceFile.addPackage(`${projectsDir}/app1`);

      workspaceFile.minimumReleaseAgeExclude = [];

      await workspaceFile.saveAsync(workspaceFilePath, { onlyIfChanged: true });

      expect(writtenContent).toContain('minimumReleaseAgeExclude: []');
    });

    it('omits an undefined minimumReleaseAgeExclude', async () => {
      const workspaceFile: PnpmWorkspaceFile = new PnpmWorkspaceFile(workspaceFilePath);
      workspaceFile.addPackage(`${projectsDir}/app1`);

      workspaceFile.minimumReleaseAgeExclude = undefined;

      await workspaceFile.saveAsync(workspaceFilePath, { onlyIfChanged: true });

      expect(writtenContent).not.toContain('minimumReleaseAgeExclude');
    });
  });
});
