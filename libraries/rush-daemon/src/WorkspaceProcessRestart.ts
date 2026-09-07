// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';

import { JsonFile, PackageJsonLookup } from '@rushstack/node-core-library';
import type { IDaemonStartCommand } from '@rushstack/rush-client-core';

/** Inputs for selecting a successor, before the old host gives up ownership. @beta */
export interface IWorkspaceProcessRestartContext {
  readonly repoRoot: string;
  readonly rushVersion: string;
  readonly environment: Readonly<Record<string, string>>;
  readonly reason: 'hard-input-change' | 'native-mutation';
}

/** An explicitly selected launch command consumed by the existing core startup contract. @beta */
export interface IWorkspaceSuccessorLaunch {
  readonly startCommand: IDaemonStartCommand;
  readonly daemonVersion: string;
}

/** Selects and validates an available successor without starting it. @beta */
export type GetWorkspaceSuccessorLaunchAsync = (
  context: IWorkspaceProcessRestartContext
) => Promise<IWorkspaceSuccessorLaunch>;

/** The successor attested by the existing hello/ping and ownership startup checks. @beta */
export interface IWorkspaceProcessRestartResult {
  readonly pid: number;
  readonly rushVersion: string;
}

/** A mutation may require shutdown even when its resulting version cannot be launched. */
export interface IWorkspaceProcessRestartPlan extends IWorkspaceProcessRestartContext {
  readonly launch: IWorkspaceSuccessorLaunch | undefined;
  readonly failure: Error | undefined;
}

/** Selects this installed daemon; a different unavailable Rush version is never impersonated. */
export async function getInstalledWorkspaceSuccessorLaunchAsync(
  context: IWorkspaceProcessRestartContext
): Promise<IWorkspaceSuccessorLaunch> {
  const rushPackage: { version: string } = await JsonFile.loadAsync(
    require.resolve('@microsoft/rush-lib/package.json')
  );
  const configured: { rushVersion: string } = await JsonFile.loadAsync(
    path.join(context.repoRoot, 'rush.json')
  );
  if (configured.rushVersion !== context.rushVersion) {
    throw new Error('This daemon entrypoint cannot select a Rush version different from rush.json.');
  }
  if (rushPackage.version !== context.rushVersion) {
    throw new Error(
      `Cannot launch selected Rush ${context.rushVersion}: this daemon installation contains Rush ${rushPackage.version}.`
    );
  }
  const packagePath: string | undefined = PackageJsonLookup.instance.tryGetPackageJsonFilePathFor(__dirname);
  if (!packagePath) throw new Error('Cannot locate the installed daemon launch command.');
  const daemonPackage: { version: string; bin: { rushd: string } } = await JsonFile.loadAsync(packagePath);
  return {
    daemonVersion: daemonPackage.version,
    startCommand: {
      command: process.execPath,
      args: [path.resolve(path.dirname(packagePath), daemonPackage.bin.rushd)],
      cwd: context.repoRoot,
      environment: Object.freeze({ ...context.environment })
    }
  };
}
