// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as childProcess from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import {
  findNodeModulesPackageFolder,
  getRushLibPathHandoff,
  type IRushLibPathHandoff
} from '../RushLibPathHandoff';

const ENTRY_POINT_SUBPATH: string = path.join('lib-commonjs', 'index.js');

describe(getRushLibPathHandoff.name, () => {
  let folder: string;
  let localRushLib: string;
  let hostScript: string;
  let hostLink: string;

  function writePackage(packageFolder: string, name: string): void {
    fs.mkdirSync(path.join(packageFolder, 'lib-commonjs'), { recursive: true });
    fs.writeFileSync(
      path.join(packageFolder, 'package.json'),
      JSON.stringify({ name, version: '1.0.0', main: './lib-commonjs/index.js' })
    );
    fs.writeFileSync(path.join(packageFolder, ENTRY_POINT_SUBPATH), 'module.exports = {};');
  }

  function link(target: string, newLinkPath: string): void {
    fs.mkdirSync(path.dirname(newLinkPath), { recursive: true });
    fs.symlinkSync(target, newLinkPath, 'junction');
  }

  // Resolves the way plugins do, from a process outside of any rush-lib package scope.
  function resolveByName(request: string, fromPath: string): string {
    return childProcess
      .execFileSync(
        process.execPath,
        ['-e', 'process.stdout.write(require.resolve(process.argv[1], { paths: [process.argv[2]] }))'].concat(
          request,
          fromPath
        ),
        { cwd: folder, encoding: 'utf8' }
      )
      .toString();
  }

  beforeEach(() => {
    folder = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'rush-lib-path-handoff-')));
    // A "rush deploy" layout: rush-lib is a local project folder, and each host links it.
    localRushLib = path.join(folder, 'deploy', 'libraries', 'rush-lib');
    writePackage(localRushLib, '@microsoft/rush-lib');
    writePackage(path.join(folder, 'deploy', 'libraries', 'node-core-library'), '@rushstack/node-core-library');
    link(
      path.join(folder, 'deploy', 'libraries', 'node-core-library'),
      path.join(localRushLib, 'node_modules', '@rushstack', 'node-core-library')
    );
    hostScript = path.join(folder, 'deploy', 'apps', 'host', 'bin', 'host');
    fs.mkdirSync(path.dirname(hostScript), { recursive: true });
    fs.writeFileSync(hostScript, '');
    hostLink = path.join(folder, 'deploy', 'apps', 'host', 'node_modules', '@microsoft', 'rush-lib');
    link(localRushLib, hostLink);
  });

  afterEach(() => {
    fs.rmSync(folder, { recursive: true, force: true });
  });

  it('keeps the real path of an installed rush-lib', () => {
    const installedRushLib: string = path.join(folder, 'install', 'node_modules', '@microsoft', 'rush-lib');
    writePackage(installedRushLib, '@microsoft/rush-lib');
    const entryPoint: string = path.join(installedRushLib, ENTRY_POINT_SUBPATH);

    expect(
      getRushLibPathHandoff({
        packageFolder: installedRushLib,
        entryPoint,
        hostScriptPaths: [hostScript],
        inheritedEntryPoint: path.join(hostLink, ENTRY_POINT_SUBPATH)
      })
    ).toEqual({ entryPoint, packageFolder: installedRushLib });
  });

  it('spells a local rush-lib through the node_modules link of the host script', () => {
    const handoff: IRushLibPathHandoff = getRushLibPathHandoff({
      packageFolder: localRushLib,
      entryPoint: path.join(localRushLib, ENTRY_POINT_SUBPATH),
      hostScriptPaths: [undefined, hostScript],
      inheritedEntryPoint: undefined
    });

    expect(handoff).toEqual({ entryPoint: path.join(hostLink, ENTRY_POINT_SUBPATH), packageFolder: hostLink });
    // This is how plugins find rush-lib and its dependencies from _RUSH_LIB_PATH.
    expect(fs.realpathSync.native(resolveByName('@microsoft/rush-lib/package.json', handoff.entryPoint))).toBe(
      path.join(localRushLib, 'package.json')
    );
    expect(
      fs.realpathSync.native(resolveByName('@rushstack/node-core-library/package.json', handoff.packageFolder))
    ).toBe(path.join(folder, 'deploy', 'libraries', 'node-core-library', 'package.json'));
  });

  it('follows a symbolic link to the host script before looking for its node_modules folder', () => {
    const scriptAlias: string = path.join(folder, 'bin', 'host');
    fs.mkdirSync(path.dirname(scriptAlias), { recursive: true });
    fs.symlinkSync(hostScript, scriptAlias);

    expect(
      getRushLibPathHandoff({
        packageFolder: localRushLib,
        entryPoint: path.join(localRushLib, ENTRY_POINT_SUBPATH),
        hostScriptPaths: [scriptAlias],
        inheritedEntryPoint: undefined
      }).packageFolder
    ).toBe(hostLink);
  });

  it('ignores a host whose own rush-lib is a different package', () => {
    const otherHostScript: string = path.join(folder, 'other', 'bin', 'host');
    fs.mkdirSync(path.dirname(otherHostScript), { recursive: true });
    fs.writeFileSync(otherHostScript, '');
    writePackage(path.join(folder, 'other', 'node_modules', '@microsoft', 'rush-lib'), '@microsoft/rush-lib');
    // A link further up would be shadowed by the host's own rush-lib, so it must not be used either.
    link(localRushLib, path.join(folder, 'node_modules', '@microsoft', 'rush-lib'));
    const entryPoint: string = path.join(localRushLib, ENTRY_POINT_SUBPATH);

    expect(
      getRushLibPathHandoff({
        packageFolder: localRushLib,
        entryPoint,
        hostScriptPaths: [otherHostScript, path.join(folder, 'missing', 'script')],
        inheritedEntryPoint: undefined
      })
    ).toEqual({ entryPoint, packageFolder: localRushLib });
  });

  it('keeps an inherited spelling of the same entry point', () => {
    const inheritedEntryPoint: string = path.join(hostLink, ENTRY_POINT_SUBPATH);

    expect(
      getRushLibPathHandoff({
        packageFolder: localRushLib,
        entryPoint: path.join(localRushLib, ENTRY_POINT_SUBPATH),
        hostScriptPaths: [path.join(folder, 'missing', 'script')],
        inheritedEntryPoint
      })
    ).toEqual({ entryPoint: inheritedEntryPoint, packageFolder: hostLink });
  });

  it('replaces an inherited path that names a different engine', () => {
    const otherRushLib: string = path.join(folder, 'other', 'node_modules', '@microsoft', 'rush-lib');
    writePackage(otherRushLib, '@microsoft/rush-lib');
    const entryPoint: string = path.join(localRushLib, ENTRY_POINT_SUBPATH);

    expect(
      getRushLibPathHandoff({
        packageFolder: localRushLib,
        entryPoint,
        hostScriptPaths: [],
        inheritedEntryPoint: path.join(otherRushLib, ENTRY_POINT_SUBPATH)
      })
    ).toEqual({ entryPoint, packageFolder: localRushLib });
  });
});

describe(findNodeModulesPackageFolder.name, () => {
  let folder: string;

  beforeEach(() => {
    folder = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'rush-node-modules-lookup-')));
  });

  afterEach(() => {
    fs.rmSync(folder, { recursive: true, force: true });
  });

  it('finds a package next to a linked package without following the link', () => {
    const target: string = path.join(folder, 'target');
    fs.mkdirSync(target, { recursive: true });
    fs.writeFileSync(path.join(target, 'package.json'), '{}');
    const plugin: string = path.join(folder, 'host', 'node_modules', '@scope', 'plugin');
    fs.mkdirSync(plugin, { recursive: true });
    fs.writeFileSync(path.join(plugin, 'package.json'), '{}');
    const linkedPackage: string = path.join(folder, 'host', 'node_modules', '@scope', 'linked');
    fs.symlinkSync(target, linkedPackage, 'junction');

    expect(findNodeModulesPackageFolder(linkedPackage, '@scope/plugin')).toBe(plugin);
    expect(findNodeModulesPackageFolder(target, '@scope/plugin')).toBeUndefined();
  });

  it('does not look for node_modules inside a node_modules folder', () => {
    const nested: string = path.join(folder, 'node_modules', 'node_modules', 'pkg');
    fs.mkdirSync(nested, { recursive: true });
    fs.writeFileSync(path.join(nested, 'package.json'), '{}');

    expect(findNodeModulesPackageFolder(path.join(folder, 'node_modules', 'a'), 'pkg')).toBeUndefined();
  });
});
