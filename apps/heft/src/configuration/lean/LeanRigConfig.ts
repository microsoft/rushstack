// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as path from 'node:path';

import type { IRigConfig } from '@rushstack/rig-package';

import { tryParseJsonLean } from './LeanJson';

// The validation rules of RigConfig in @rushstack/rig-package
const PACKAGE_NAME_REGEXP: RegExp = /^(@[A-Za-z0-9\-_\.]+\/)?[A-Za-z0-9\-_\.]+$/;
const RIG_NAME_REGEXP: RegExp = /-rig(-test)?$/;
const PROFILE_NAME_REGEXP: RegExp = /^[a-z0-9_\.]+(\-[a-z0-9_\.]+)*$/;

/**
 * The data members of `IRigConfig`.
 */
export interface ILeanRigConfigData {
  readonly projectFolderOriginalPath: string;
  readonly projectFolderPath: string;
  readonly rigFound: boolean;
  readonly filePath: string;
  readonly rigPackageName: string;
  readonly rigProfile: string;
  readonly relativeProfileFolderPath: string;
}

/**
 * Reads `config/rig.json` with the same result as `RigConfig.loadForProjectFolderAsync()` from
 * `@rushstack/rig-package`, without loading that package (and `jju`). Returns `undefined` if an identical result
 * can't be guaranteed, including for every condition in which `RigConfig` throws.
 */
export function tryLoadRigConfigDataLean(projectFolderPath: string): ILeanRigConfigData | undefined {
  const rigConfigFilePath: string = path.join(projectFolderPath, 'config/rig.json');
  let text: string;
  try {
    text = fs.readFileSync(rigConfigFilePath).toString();
  } catch (e) {
    const code: unknown = (e as NodeJS.ErrnoException).code;
    if (code === 'ENOENT' || code === 'ENOTDIR') {
      // No rig config
      return {
        projectFolderOriginalPath: projectFolderPath,
        projectFolderPath: path.resolve(projectFolderPath),
        rigFound: false,
        filePath: '',
        rigPackageName: '',
        rigProfile: '',
        relativeProfileFolderPath: ''
      };
    }

    return undefined;
  }

  const parsed: { value: unknown } | undefined = tryParseJsonLean(text);
  const json: unknown = parsed?.value;
  if (typeof json !== 'object' || json === null || Array.isArray(json)) {
    return undefined;
  }

  // RigConfig parses with jju's defaults, which silently drop keys like "constructor" or "__proto__", so any
  // unexpected key could make the results differ.
  for (const key of Object.getOwnPropertyNames(json)) {
    if (key !== '$schema' && key !== 'rigPackageName' && key !== 'rigProfile') {
      return undefined;
    }
  }

  const { rigPackageName, rigProfile } = json as { rigPackageName?: unknown; rigProfile?: unknown };
  if (
    typeof rigPackageName !== 'string' ||
    !PACKAGE_NAME_REGEXP.test(rigPackageName) ||
    !RIG_NAME_REGEXP.test(rigPackageName)
  ) {
    return undefined;
  }

  if (rigProfile !== undefined && (typeof rigProfile !== 'string' || !PROFILE_NAME_REGEXP.test(rigProfile))) {
    return undefined;
  }

  const effectiveRigProfile: string = rigProfile === undefined ? 'default' : rigProfile;
  return {
    projectFolderOriginalPath: projectFolderPath,
    projectFolderPath: path.resolve(projectFolderPath),
    rigFound: true,
    filePath: rigConfigFilePath,
    rigPackageName,
    rigProfile: effectiveRigProfile,
    relativeProfileFolderPath: 'profiles/' + effectiveRigProfile
  };
}

/**
 * An `IRigConfig` with the data that `RigConfig` would have for the project, whose methods delegate to the
 * genuine `RigConfig` object (which is only created when it is needed). Heft uses it to load its own configuration
 * files without loading `@rushstack/rig-package` on the startup path; `HeftConfiguration.rigConfig` still returns
 * the genuine `RigConfig`.
 */
export class LeanRigConfig implements IRigConfig {
  public readonly projectFolderOriginalPath: string;
  public readonly projectFolderPath: string;
  public readonly rigFound: boolean;
  public readonly filePath: string;
  public readonly rigPackageName: string;
  public readonly rigProfile: string;
  public readonly relativeProfileFolderPath: string;

  readonly #getRigConfig: () => IRigConfig;

  public constructor(data: ILeanRigConfigData, getRigConfig: () => IRigConfig) {
    this.projectFolderOriginalPath = data.projectFolderOriginalPath;
    this.projectFolderPath = data.projectFolderPath;
    this.rigFound = data.rigFound;
    this.filePath = data.filePath;
    this.rigPackageName = data.rigPackageName;
    this.rigProfile = data.rigProfile;
    this.relativeProfileFolderPath = data.relativeProfileFolderPath;
    this.#getRigConfig = getRigConfig;
  }

  public getResolvedProfileFolder(): string {
    return this.#getRigConfig().getResolvedProfileFolder();
  }

  public async getResolvedProfileFolderAsync(): Promise<string> {
    return await this.#getRigConfig().getResolvedProfileFolderAsync();
  }

  public tryResolveConfigFilePath(configFileRelativePath: string): string | undefined {
    return this.#getRigConfig().tryResolveConfigFilePath(configFileRelativePath);
  }

  public async tryResolveConfigFilePathAsync(configFileRelativePath: string): Promise<string | undefined> {
    return await this.#getRigConfig().tryResolveConfigFilePathAsync(configFileRelativePath);
  }
}
