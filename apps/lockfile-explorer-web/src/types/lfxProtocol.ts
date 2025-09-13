// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

export interface ILfxWorkspaceRushConfig {
  /**
   * The rushVersion from rush.json.
   */
  rushVersion: string;

  /**
   * If the subspaces feature is enabled and a subspace was loaded, the name of the subspace.
   * Otherwise this will be an empty string.
   */
  subspaceName: string;
}

export interface ILfxWorkspace {
  /**
   * Absolute path to the workspace folder that is opened by the app.
   * Relative paths are generally relative to this path.
   */
  workspaceRootFolder: string;

  /**
   * The path to the pnpm-lock.yaml file.
   */
  pnpmLockfilePath: string;

  /**
   * If this is a Rush workspace (versus a plain PNPM workspace), then
   * this section will be defined.
   */
  rushConfig: ILfxWorkspaceRushConfig | undefined;
}
