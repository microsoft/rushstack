// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import { JsonFile, JsonSchema, FileSystem } from '@rushstack/node-core-library';

import type { ProjectManifest } from '@pnpm/types';

/**
 * Pnpm config in package.json
 * @beta
 */
export type IPnpmProjectManifestConfigurationJson = Required<ProjectManifest>['pnpm'];

/**
 * Use this class to load "common/config/rush/pnpm-config.json" file.
 * The fields in the configuration will be patched into package.json under common temp folder.
 * @beta
 */
export class PnpmProjectManifestConfiguration {
  private static _jsonSchema: JsonSchema = JsonSchema.fromFile(
    path.resolve(__dirname, '../../schemas/pnpm-config.schema.json')
  );

  private _jsonFilename: string;

  /**
   * See https://pnpm.io/package_json#pnpmneverbuiltdependencies
   *
   * @remarks
   * This field allows to ignore the builds of specific dependencies. The "preinstall", "install", and
   * "postinstall" scripts of the listed packages will not be executed during installation.
   */
  public readonly neverBuiltDependencies: IPnpmProjectManifestConfigurationJson['neverBuiltDependencies'];

  /**
   * See https://pnpm.io/package_json#pnpmonlybuiltdependencies
   *
   * @remarks
   * A list of package names that are allowed to be executed during installation. If this field exists,
   * only the listed packages will be able to run install scripts.
   */
  public readonly onlyBuiltDependencies: IPnpmProjectManifestConfigurationJson['onlyBuiltDependencies'];

  /**
   * See
   * https://pnpm.io/package_json#pnpmpeerdependencyrulesignoremissing
   * https://pnpm.io/package_json#pnpmpeerdependencyrulesallowedversions
   *
   * @remarks
   * - peerDependencyRules.ignoreMissing: pnpm will not print warnings about missing peer dependencies
   *  from this list.
   * - peerDependencyRules.allowedVersions: Unmet peer dependency warnings will not be printed for peer
   *  dependencies of the specified range.
   */
  public readonly peerDependencyRules?: IPnpmProjectManifestConfigurationJson['peerDependencyRules'];

  /**
   * See https://pnpm.io/package_json#pnpmpackageextensions
   *
   * @remarks
   * The packageExtensions fields offer a way to extend the existing package definitions with additional
   * information.
   */
  public readonly packageExtensions: IPnpmProjectManifestConfigurationJson['packageExtensions'];

  /**
   * See https://pnpm.io/package_json#pnpmoverrides
   *
   * @remarks
   * This field allows you to instruct pnpm to override any dependency in the dependency graph. This is
   * useful to enforce all your packages to use a single version of a dependency, backport a fix, or
   * replace a dependency with a fork.
   */
  public readonly overrides: IPnpmProjectManifestConfigurationJson['overrides'];

  private constructor(
    pnpmProjectManifestConfigurationJson: IPnpmProjectManifestConfigurationJson | undefined,
    jsonFilename: string
  ) {
    this._jsonFilename = jsonFilename;

    if (pnpmProjectManifestConfigurationJson) {
      if ('neverBuiltDependencies' in pnpmProjectManifestConfigurationJson) {
        this.neverBuiltDependencies = pnpmProjectManifestConfigurationJson.neverBuiltDependencies;
      }
      if ('onlyBuiltDependencies' in pnpmProjectManifestConfigurationJson) {
        this.onlyBuiltDependencies = pnpmProjectManifestConfigurationJson.onlyBuiltDependencies;
      }
      if ('peerDependencyRules' in pnpmProjectManifestConfigurationJson) {
        this.peerDependencyRules = pnpmProjectManifestConfigurationJson.peerDependencyRules;
      }
      if ('packageExtensions' in pnpmProjectManifestConfigurationJson) {
        this.packageExtensions = pnpmProjectManifestConfigurationJson.packageExtensions;
      }
      if ('overrides' in pnpmProjectManifestConfigurationJson) {
        this.overrides = pnpmProjectManifestConfigurationJson.overrides;
      }
    }
  }

  /**
   * Loads pnpm-config.json data from the specified file path.
   */
  public static loadFromFile(jsonFilename: string): PnpmProjectManifestConfiguration {
    let pnpmProjectManifestConfigurationJson: IPnpmProjectManifestConfigurationJson | undefined;
    if (FileSystem.exists(jsonFilename)) {
      pnpmProjectManifestConfigurationJson = JsonFile.loadAndValidate(
        jsonFilename,
        PnpmProjectManifestConfiguration._jsonSchema
      );
    }
    return new PnpmProjectManifestConfiguration(pnpmProjectManifestConfigurationJson, jsonFilename);
  }

  /**
   * Get the absolute file path of the common-versions.json file.
   */
  public get filePath(): string {
    return this._jsonFilename;
  }
}
