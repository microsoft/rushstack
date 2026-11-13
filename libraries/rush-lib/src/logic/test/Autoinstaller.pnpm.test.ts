// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';
import { createHash } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import { createRequire } from 'node:module';

import { FileSystem, JsonFile, PackageJsonLookup, type IPackageJson } from '@rushstack/node-core-library';
import * as yaml from 'js-yaml';
import * as tar from 'tar';

import { Autoinstaller } from '../Autoinstaller';
import { InstallHelpers } from '../installManager/InstallHelpers';
import { RushConfiguration } from '../../api/RushConfiguration';
import type { RushGlobalFolder } from '../../api/RushGlobalFolder';
import { Utilities } from '../../utilities/Utilities';

interface ILockfile {
  packages: Record<string, { resolution: { integrity: string }; dependencies?: Record<string, string> }>;
  snapshots?: Record<string, { dependencies?: Record<string, string> }>;
  dependencies?: Record<string, { specifier: string; version: string }>;
  importers?: Record<string, { dependencies: NonNullable<ILockfile['dependencies']> }>;
}

interface IRegistryPackage {
  manifest: IPackageJson;
  tarball: Buffer;
  integrity: string;
}

interface IPnpmFixturePackageJson extends IPackageJson {
  pnpm: {
    overrides: Record<string, string>;
  };
}

const PROJECT_FOLDER: string = PackageJsonLookup.instance.tryGetPackageFolderFor(__dirname)!;
const TEST_FOLDER: string = path.join(PROJECT_FOLDER, 'temp/test/autoinstaller-pnpm');
const LIFECYCLE_SCRIPT: string =
  "node -e \"require('fs').writeFileSync(process.env.AUTOINSTALLER_LIFECYCLE_SENTINEL, 'ran')\"";

describe('Autoinstaller with real PNPM', () => {
  it('reconciles an existing lockfile without opting into a full update', async () => {
    // By default, use the tool installed by Rush. An explicit path also permits testing older
    // PNPM releases and native executables without changing this repository's package-manager pin.
    const pnpmPath: string =
      process.env.PNPM_TEST_EXECUTABLE ??
      path.resolve(PROJECT_FOLDER, '../../common/temp/pnpm-local/node_modules/.bin/pnpm');
    const originalEnvironment: NodeJS.ProcessEnv = process.env;
    let server: Server | undefined;
    let newerVersionsAvailable: boolean = false;
    let tarballRequests: number = 0;
    const unexpectedRequests: string[] = [];
    const metadataRequests: Set<string> = new Set();
    const requestedTarballs: string[] = [];

    await FileSystem.ensureEmptyFolderAsync(TEST_FOLDER);
    await FileSystem.ensureFolderAsync(`${TEST_FOLDER}/home`);
    await FileSystem.writeFileAsync(`${TEST_FOLDER}/empty.npmrc`, '');
    await FileSystem.writeFileAsync(`${TEST_FOLDER}/empty-global.npmrc`, '');
    const fixtureEnvironment: NodeJS.ProcessEnv = {
      CI: 'true',
      HOME: `${TEST_FOLDER}/home`,
      USERPROFILE: `${TEST_FOLDER}/home`,
      APPDATA: `${TEST_FOLDER}/home/appdata`,
      LOCALAPPDATA: `${TEST_FOLDER}/home/localappdata`,
      XDG_CONFIG_HOME: `${TEST_FOLDER}/home/config`,
      XDG_CACHE_HOME: `${TEST_FOLDER}/home/cache`,
      XDG_DATA_HOME: `${TEST_FOLDER}/home/data`,
      XDG_STATE_HOME: `${TEST_FOLDER}/home/state`,
      TMPDIR: TEST_FOLDER,
      TMP: TEST_FOLDER,
      TEMP: TEST_FOLDER,
      AUTOINSTALLER_LIFECYCLE_SENTINEL: `${TEST_FOLDER}/lifecycle-ran`
    };
    // Inherit only executable lookup and OS variables, not CI registry settings, proxies or credentials.
    const inheritedVariableNames: Set<string> = new Set([
      'PATH',
      'PATHEXT',
      'SYSTEMROOT',
      'SYSTEMDRIVE',
      'WINDIR',
      'COMSPEC'
    ]);
    for (const name of Object.keys(originalEnvironment)) {
      const normalizedName: string = name.toUpperCase();
      if (inheritedVariableNames.has(normalizedName)) {
        fixtureEnvironment[normalizedName] = originalEnvironment[name];
      }
    }
    function setPackageManagerSetting(name: string, value: string): void {
      for (const prefix of ['npm_config_', 'pnpm_config_']) {
        fixtureEnvironment[`${prefix}${name}`] = value;
      }
    }
    setPackageManagerSetting('userconfig', `${TEST_FOLDER}/empty.npmrc`);
    setPackageManagerSetting('globalconfig', `${TEST_FOLDER}/empty-global.npmrc`);
    setPackageManagerSetting('cache', `${TEST_FOLDER}/cache`);
    setPackageManagerSetting('store_dir', `${TEST_FOLDER}/store`);
    setPackageManagerSetting('ignore_scripts', 'true');
    setPackageManagerSetting('prefer_online', 'true');

    try {
      const version: string = (
        await Utilities.executeCommandAndCaptureOutputAsync({
          command: pnpmPath,
          args: ['--version'],
          workingDirectory: TEST_FOLDER,
          environment: fixtureEnvironment,
          keepEnvironment: true
        })
      ).trim();
      const registryPackages: IRegistryPackage[] = [];
      async function addPackageAsync(
        name: string,
        packageVersion: string,
        dependencies: Record<string, string> = {}
      ): Promise<void> {
        const manifest: IPackageJson = {
          name,
          version: packageVersion,
          dependencies,
          scripts: { postinstall: LIFECYCLE_SCRIPT }
        };
        const folder: string = `${TEST_FOLDER}/tarballs/${name}-${packageVersion}`;
        await JsonFile.saveAsync(manifest, `${folder}/package/package.json`, { ensureFolderExists: true });
        const tarballPath: string = `${folder}/package.tgz`;
        await tar.create({ cwd: folder, file: tarballPath, gzip: true, portable: true }, ['package']);
        const tarball: Buffer = await FileSystem.readFileToBufferAsync(tarballPath);
        registryPackages.push({
          manifest,
          tarball,
          integrity: `sha512-${createHash('sha512').update(tarball).digest('base64')}`
        });
      }

      for (const name of ['child', 'leaf', 'unrelated-child', 'overridden']) {
        for (const packageVersion of ['1.0.0', '1.9.0']) {
          await addPackageAsync(`fixture-${name}`, packageVersion);
        }
      }
      for (const packageVersion of ['1.0.0', '1.9.0']) {
        await addPackageAsync('fixture-grandchild', packageVersion, { 'fixture-leaf': '^1.0.0' });
        await addPackageAsync('fixture-unrelated', packageVersion, { 'fixture-unrelated-child': '^1.0.0' });
      }
      for (const packageVersion of ['1.0.0', '2.0.0']) {
        await addPackageAsync('fixture-parent', packageVersion, { 'fixture-grandchild': '^1.0.0' });
        await addPackageAsync('fixture-incompatible', packageVersion);
        await addPackageAsync('fixture-root', packageVersion, {
          'fixture-child': '^1.0.0',
          'fixture-parent': `^${packageVersion}`,
          'fixture-incompatible': `^${packageVersion}`,
          'fixture-overridden': '^1.0.0'
        });
      }

      server = createServer();
      await new Promise<void>((resolve, reject) => {
        server!.once('error', reject);
        server!.listen(0, '127.0.0.1', resolve);
      });
      const address = server.address();
      if (!address || typeof address === 'string') {
        throw new Error('Expected a loopback TCP server');
      }
      const registryUrl: string = `http://127.0.0.1:${address.port}`;
      const expectedMetadataPaths: Set<string> = new Set(
        registryPackages.map(({ manifest }) => `/${manifest.name}`)
      );
      const expectedTarballPaths: Set<string> = new Set(
        registryPackages.map(({ manifest }) => `/${manifest.name}/-/${manifest.version}.tgz`)
      );
      server.on('request', (request, response) => {
        const requestPath: string = request.url ?? '';
        if (
          request.method !== 'GET' ||
          request.headers.host !== `127.0.0.1:${address.port}` ||
          (!expectedMetadataPaths.has(requestPath) && !expectedTarballPaths.has(requestPath))
        ) {
          unexpectedRequests.push(`${request.method} ${request.headers.host}${requestPath}`);
          response.writeHead(404);
          response.end();
          return;
        }
        const tarball: IRegistryPackage | undefined = registryPackages.find(
          ({ manifest }) => requestPath === `/${manifest.name}/-/${manifest.version}.tgz`
        );
        if (tarball) {
          tarballRequests++;
          requestedTarballs.push(requestPath);
          response.end(tarball.tarball);
          return;
        }
        const packages: IRegistryPackage[] = registryPackages.filter(
          ({ manifest }) =>
            requestPath === `/${manifest.name}` && (newerVersionsAvailable || manifest.version === '1.0.0')
        );
        if (packages.length === 0) {
          response.writeHead(404);
          response.end();
          return;
        }
        metadataRequests.add(requestPath);
        response.setHeader('Content-Type', 'application/json');
        // The available versions change between installs, so a metadata cache must revalidate them.
        response.setHeader('Cache-Control', 'no-store');
        response.end(
          JSON.stringify({
            name: packages[0].manifest.name,
            'dist-tags': { latest: packages[packages.length - 1].manifest.version },
            versions: Object.fromEntries(
              packages.map(({ manifest, integrity }) => [
                manifest.version,
                {
                  ...manifest,
                  dist: { integrity, tarball: `${registryUrl}/${manifest.name}/-/${manifest.version}.tgz` }
                }
              ])
            ),
            time: Object.fromEntries(
              packages.map(({ manifest }) => [manifest.version, '2020-01-01T00:00:00Z'])
            )
          })
        );
      });
      setPackageManagerSetting('registry', registryUrl);

      await JsonFile.saveAsync(
        { rushVersion: '5.0.0', pnpmVersion: version, projects: [] },
        `${TEST_FOLDER}/rush.json`
      );
      const rushConfiguration: RushConfiguration = RushConfiguration.loadFromConfigurationFile(
        `${TEST_FOLDER}/rush.json`
      );
      Object.defineProperty(rushConfiguration, 'packageManagerToolFilename', { value: pnpmPath });
      jest.spyOn(InstallHelpers, 'ensureLocalPackageManagerAsync').mockResolvedValue(undefined);
      // Without an explicit environment, child_process inherits the CI host's environment.
      // Keep real execution and all command options, supplying only the fixture's isolated environment.
      const executeCommandAsync: typeof Utilities.executeCommandAsync = Utilities.executeCommandAsync;
      jest.spyOn(Utilities, 'executeCommandAsync').mockImplementation(async (options) => {
        expect(options.command).toBe(pnpmPath);
        await executeCommandAsync({ ...options, environment: fixtureEnvironment });
      });
      await FileSystem.writeFileAsync(
        `${rushConfiguration.commonRushConfigFolder}/.npmrc`,
        `registry=${registryUrl}\n`,
        { ensureFolderExists: true }
      );

      function packageJson(rootVersion: string): IPnpmFixturePackageJson {
        return {
          name: 'fixture-autoinstaller',
          version: '1.0.0',
          private: true,
          dependencies: { 'fixture-root': rootVersion, 'fixture-unrelated': '^1.0.0' },
          scripts: { postinstall: LIFECYCLE_SCRIPT },
          pnpm: { overrides: { 'fixture-overridden': '1.0.0' } }
        };
      }

      async function readLockfileAsync(folder: string): Promise<ILockfile> {
        return yaml.load(await FileSystem.readFileAsync(`${folder}/pnpm-lock.yaml`)) as ILockfile;
      }

      function lockedPackage(
        lockfile: ILockfile,
        name: string,
        packageVersion: string,
        phase: string,
        baseline?: ILockfile
      ): unknown {
        const key: string = `${name}@${packageVersion}`;
        const packageEntry = lockfile.packages[key] ?? lockfile.packages[`/${key}`];
        if (packageEntry === undefined) {
          const diagnostic: string = JSON.stringify(
            { pnpmVersion: version, phase, expectedPackage: key, baseline, lockfile },
            undefined,
            2
          );
          const summary: string = `PNPM ${version}: missing ${key} during ${phase}.`;
          if (Buffer.byteLength(diagnostic, 'utf8') > 64 * 1024) {
            throw new Error(`${summary} Fixture lockfile diagnostics exceed the 64 KiB limit.`);
          }
          throw new Error(`${summary}\n${diagnostic}`);
        }
        expect(packageEntry).toBeDefined();
        const published: IRegistryPackage = registryPackages.find(
          ({ manifest }) => manifest.name === name && manifest.version === packageVersion
        )!;
        expect(packageEntry.resolution.integrity).toBe(published.integrity);
        return { packageEntry, snapshot: lockfile.snapshots?.[key] };
      }

      const autoinstallers: Autoinstaller[] = [];
      const initialLockfiles: ILockfile[] = [];
      for (const name of ['preserve', 'full-update']) {
        const autoinstaller: Autoinstaller = new Autoinstaller({
          autoinstallerName: name,
          rushConfiguration,
          rushGlobalFolder: {} as RushGlobalFolder,
          restrictConsoleOutput: true
        });
        await JsonFile.saveAsync(packageJson('1.0.0'), autoinstaller.packageJsonPath, {
          ensureFolderExists: true
        });
        // PNPM 11+ reads overrides from pnpm-workspace.yaml, while older versions use package.json.
        await FileSystem.writeFileAsync(
          `${autoinstaller.folderFullPath}/pnpm-workspace.yaml`,
          'packages: []\noverrides:\n  fixture-overridden: 1.0.0\n'
        );
        await autoinstaller.updateAsync();
        autoinstallers.push(autoinstaller);
        initialLockfiles.push(await readLockfileAsync(autoinstaller.folderFullPath));
      }

      newerVersionsAvailable = true;
      for (const [index, autoinstaller] of autoinstallers.entries()) {
        const preserveLockfile: boolean = index === 0;
        await JsonFile.saveAsync(packageJson('2.0.0'), autoinstaller.packageJsonPath);
        await autoinstaller.updateAsync(preserveLockfile ? { preserveLockfile: true } : undefined);
        const reconciled: ILockfile = await readLockfileAsync(autoinstaller.folderFullPath);
        const retainedVersion: string = preserveLockfile ? '1.0.0' : '1.9.0';
        for (const name of ['child', 'grandchild', 'leaf', 'unrelated', 'unrelated-child', 'overridden']) {
          const expectedVersion: string = name === 'overridden' ? '1.0.0' : retainedVersion;
          const entry: unknown = lockedPackage(
            reconciled,
            `fixture-${name}`,
            expectedVersion,
            `${autoinstaller.name}:updated`,
            initialLockfiles[index]
          );
          if (preserveLockfile || name === 'overridden') {
            expect(entry).toEqual(
              lockedPackage(
                initialLockfiles[index],
                `fixture-${name}`,
                '1.0.0',
                `${autoinstaller.name}:initial`
              )
            );
          }
        }
        for (const name of ['root', 'parent', 'incompatible']) {
          lockedPackage(
            reconciled,
            `fixture-${name}`,
            '2.0.0',
            `${autoinstaller.name}:updated`,
            initialLockfiles[index]
          );
        }
        expect(reconciled.importers?.['.'].dependencies ?? reconciled.dependencies).toMatchObject({
          'fixture-root': { specifier: '2.0.0', version: '2.0.0' },
          'fixture-unrelated': { specifier: '^1.0.0', version: retainedVersion }
        });
        expect(
          await FileSystem.existsAsync(`${autoinstaller.folderFullPath}/node_modules/rush-autoinstaller.flag`)
        ).toBe(false);
      }

      const freshFolder: string = `${TEST_FOLDER}/fresh`;
      await FileSystem.ensureFolderAsync(freshFolder);
      for (const filename of ['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', '.npmrc']) {
        await FileSystem.copyFileAsync({
          sourcePath: `${autoinstallers[0].folderFullPath}/${filename}`,
          destinationPath: `${freshFolder}/${filename}`
        });
      }
      const beforeFrozen: string = await FileSystem.readFileAsync(`${freshFolder}/pnpm-lock.yaml`);
      const frozenLockfile: ILockfile = await readLockfileAsync(freshFolder);
      const expectedFrozenTarballs: Set<string> = new Set(
        registryPackages
          .filter(({ manifest }) => {
            const key: string = `${manifest.name}@${manifest.version}`;
            return !!(frozenLockfile.packages[key] ?? frozenLockfile.packages[`/${key}`]);
          })
          .map(({ manifest }) => `/${manifest.name}/-/${manifest.version}.tgz`)
      );
      const requestsBeforeFrozen: number = tarballRequests;
      expect(await FileSystem.existsAsync(`${freshFolder}/node_modules`)).toBe(false);
      expect(await FileSystem.existsAsync(`${TEST_FOLDER}/fresh-store`)).toBe(false);
      setPackageManagerSetting('store_dir', `${TEST_FOLDER}/fresh-store`);
      await Utilities.executeCommandAsync({
        command: pnpmPath,
        args: ['install', '--frozen-lockfile'],
        workingDirectory: freshFolder,
        environment: fixtureEnvironment,
        keepEnvironment: true
      });
      expect(tarballRequests).toBeGreaterThan(requestsBeforeFrozen);
      expect(new Set(requestedTarballs.slice(requestsBeforeFrozen))).toEqual(expectedFrozenTarballs);
      expect(metadataRequests).toEqual(expectedMetadataPaths);
      expect(unexpectedRequests).toEqual([]);
      expect(await FileSystem.readFileAsync(`${freshFolder}/pnpm-lock.yaml`)).toBe(beforeFrozen);
      let manifestPath: string = `${freshFolder}/package.json`;
      for (const [name, expectedVersion] of [
        ['root', '2.0.0'],
        ['parent', '2.0.0'],
        ['grandchild', '1.0.0'],
        ['leaf', '1.0.0']
      ]) {
        manifestPath = createRequire(manifestPath).resolve(`fixture-${name}/package.json`);
        expect((await JsonFile.loadAsync(manifestPath)).version).toBe(expectedVersion);
      }
      expect(await FileSystem.existsAsync(`${TEST_FOLDER}/lifecycle-ran`)).toBe(false);
    } finally {
      jest.restoreAllMocks();
      if (server) {
        await new Promise<void>((resolve, reject) => {
          server!.close((error) => (error ? reject(error) : resolve()));
        });
      }
      await FileSystem.deleteFolderAsync(TEST_FOLDER);
    }
  }, 120_000);
});
