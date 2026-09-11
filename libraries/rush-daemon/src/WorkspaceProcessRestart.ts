// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IDaemonStartCommand } from '@rushstack/rush-client-core';

import { selectDaemonLauncherAsync } from './VersionSelectedDaemonLauncher';

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

/** Selects a verified bundled or cached daemon; installation belongs to client startup preparation. */
export async function getInstalledWorkspaceSuccessorLaunchAsync(
  context: IWorkspaceProcessRestartContext
): Promise<IWorkspaceSuccessorLaunch> {
  return await selectDaemonLauncherAsync(context, { allowInstall: false });
}
