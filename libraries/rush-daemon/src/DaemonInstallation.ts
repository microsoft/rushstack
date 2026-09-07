// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import { createRequire } from 'node:module';
import * as path from 'node:path';

import { JsonFile } from '@rushstack/node-core-library';
import type { IDaemonProtocolVersion } from '@rushstack/rush-daemon-protocol';

export interface IDaemonInstallationMetadata {
  readonly daemonPackageJsonPath: string;
  readonly daemonVersion: string;
  readonly launcherPath: string;
  readonly rushVersion: string;
}

export interface IInstalledDaemonLauncher extends IDaemonInstallationMetadata {
  readonly rushLibEntryPoint: string;
  readonly protocolVersion: IDaemonProtocolVersion;
  readonly canLaunchRequests: boolean;
}

/** Resolves declared files without loading foreign engine code into the caller. */
export function readDaemonInstallationMetadata(packageJsonPath: string): IDaemonInstallationMetadata {
  const daemonPackageJsonPath: string = fs.realpathSync(packageJsonPath);
  const root: string = path.dirname(daemonPackageJsonPath);
  const metadata: {
    name?: string;
    version?: string;
    bin?: Record<string, string>;
  } = JsonFile.load(daemonPackageJsonPath);
  if (
    metadata?.name !== '@rushstack/rush-daemon' ||
    typeof metadata.version !== 'string' ||
    typeof metadata.bin?.rushd !== 'string'
  ) {
    throw new Error(`No declared @rushstack/rush-daemon launcher in ${daemonPackageJsonPath}.`);
  }
  const declaredPath: string = path.resolve(root, metadata.bin.rushd);
  assertPackageFile(root, declaredPath);
  const launcherPath: string = fs.realpathSync(declaredPath);
  assertPackageFile(root, launcherPath);
  if (!fs.statSync(launcherPath).isFile()) throw new Error(`Daemon launcher is not a file: ${launcherPath}`);
  const selectedRequire: NodeRequire = createRequire(launcherPath);
  const rushPackage: { name?: string; version?: string } = JsonFile.load(
    selectedRequire.resolve('@microsoft/rush-lib/package.json')
  );
  if (rushPackage?.name !== '@microsoft/rush-lib' || typeof rushPackage.version !== 'string') {
    throw new Error(`Daemon launcher has no valid Rush engine dependency: ${launcherPath}`);
  }
  return {
    daemonPackageJsonPath,
    daemonVersion: metadata.version,
    launcherPath,
    rushVersion: rushPackage.version
  };
}

function assertPackageFile(root: string, file: string): void {
  const relative: string = path.relative(root, file);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`Daemon launcher must be inside its declared package: ${file}`);
  }
}
