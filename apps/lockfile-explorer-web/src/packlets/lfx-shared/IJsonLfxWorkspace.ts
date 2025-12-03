// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

export interface IJsonLfxWorkspaceRushConfig {
  /**
   * The `rushVersion` field from rush.json.
   */
  readonly rushVersion: string;

  /**
   * If the subspaces feature is enabled and a subspace was loaded, the name of the subspace.
   * Otherwise this will be an empty string.
   */
  readonly subspaceName: string;

  /**
   * The path to Rush's input file `.pnpmfile.cjs`, relative to `workspaceRootFullPath`
   * and normalized to use forward slashes without a leading slash.  In a Rush workspace,
   * {@link IJsonLfxWorkspace.pnpmfilePath} is a temporary file that is generated from `rushPnpmfilePath`.
   *
   * @example `"common/config/my-subspace/pnpm-lock.yaml"`
   */
  readonly rushPnpmfilePath: string;
}

export interface IJsonLfxWorkspace {
  /**
   * Absolute path to the workspace folder that is opened by the app,  normalized to use forward slashes
   * without a trailing slash.
   *
   * @example `"C:/path/to/MyRepo"`
   */
  readonly workspaceRootFullPath: string;

  /**
   * The path to the "pnpm-lock.yaml" file, relative to `workspaceRootFullPath`
   * and normalized to use forward slashes without a leading slash.
   *
   * @example `"common/temp/my-subspace/pnpm-lock.yaml"`
   * @example `"pnpm-lock.yaml"`
   */
  readonly pnpmLockfilePath: string;

  /**
   * The path to the folder of "pnpm-lock.yaml" file, relative to `workspaceRootFullPath`
   * and normalized to use forward slashes without a leading slash.
   *
   * If `pnpm-lack.yaml` is in the `workspaceRootFullPath` folder, then pnpmLockfileFolder
   * is the empty string.
   *
   * @example `"common/temp/my-subspace"`
   * @example `""`
   */
  readonly pnpmLockfileFolder: string;

  /**
   * The path to the `.pnpmfile.cjs` file that is loaded by PNPM.  In a Rush workspace,
   * this is a temporary file that is generated from `rushPnpmfilePath`.
   *
   * @example `"common/temp/my-subspace/.pnpmfile.cjs"`
   */
  readonly pnpmfilePath: string;

  /**
   * This section will be defined only if this is a Rush workspace (versus a plain PNPM workspace).
   */
  readonly rushConfig: IJsonLfxWorkspaceRushConfig | undefined;
}
