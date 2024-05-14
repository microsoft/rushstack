// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { Path } from '@lifaon/path';
import { type ILockfileNode, LockfileDependency } from './LockfileDependency';

export enum LockfileEntryFilter {
  Project,
  Package,
  SideBySide,
  Doppelganger
}

interface IProps {
  rawEntryId: string;
  kind: LockfileEntryFilter;
  rawYamlData: ILockfileNode;
  duplicates?: Set<string>;
  subspaceName?: string;
}

/**
 * Represents a project or package listed in the pnpm lockfile.
 *
 * @remarks
 * Each project or package will have its own LockfileEntry, which is created when the lockfile is first parsed.
 * The fields for the LockfileEntry are outlined below:
 *
 * @class LockfileEntry
 * @property entryId {string} a unique (human-readable) identifier for this lockfile entry. For projects, this is just
 *    "Project:" + the package json path for this project.
 * @property rawEntryId {string} the unique identifier assigned to this project/package in the lockfile.
 *    e.g. /@emotion/core/10.3.1_qjwx5m6wssz3lnb35xwkc3pz6q:
 * @property kind {LockfileEntryFilter} Whether this entry is a project or a package (specified by importers or packages in the lockfile).
 * @property packageJsonFolderPath {string} Where the package.json is for this project or package.
 * @property entryPackageName {string} Just the name of the package with no specifiers.
 * @property displayText {string} A human friendly name for the project or package.
 * @property dependencies {LockfileDependency[]} A list of all the dependencies for this entry.
 *    Note that dependencies, dev dependencies, as well as peer dependencies are all included.
 * @property transitivePeerDependencies {Set<string>} A list of dependencies that are listed under the
 *    "transitivePeerDependencies" in the pnpm lockfile.
 * @property referrers {LockfileEntry[]} a list of entries that specify this entry as a dependency.
 *
 */
export class LockfileEntry {
  public entryId: string = '';
  public kind: LockfileEntryFilter;
  public rawEntryId: string;
  public packageJsonFolderPath: string = '';

  public entryPackageName: string = '';
  public displayText: string = '';

  public dependencies: LockfileDependency[] = [];
  public transitivePeerDependencies: Set<string> = new Set();
  public referrers: LockfileEntry[] = [];

  private static _packageEntryIdRegex: RegExp = new RegExp('/(.*)/([^/]+)$');

  public entryPackageVersion: string = '';
  public entrySuffix: string = '';

  public constructor(data: IProps) {
    const { rawEntryId, kind, rawYamlData, duplicates, subspaceName } = data;
    this.rawEntryId = rawEntryId;
    this.kind = kind;

    if (rawEntryId === '.') {
      // Project Root
      return;
    }

    if (kind === LockfileEntryFilter.Project) {
      const rootPackageJsonFolderPath = new Path(`common/temp/${subspaceName}/package.json`).dirname() || '';
      const packageJsonFolderPath = new Path('.').relative(
        new Path(rootPackageJsonFolderPath).concat(rawEntryId)
      );
      const packageName = new Path(rawEntryId).basename();

      if (!packageJsonFolderPath || !packageName) {
        // eslint-disable-next-line no-console
        console.error('Could not construct path for entry: ', rawEntryId);
        return;
      }

      this.packageJsonFolderPath = packageJsonFolderPath.toString();
      this.entryId = 'project:' + this.packageJsonFolderPath;
      this.entryPackageName = packageName.toString();
      if (duplicates?.has(this.entryPackageName)) {
        const fullPath = new Path(rawEntryId).makeAbsolute('/').toString().substring(1);
        this.displayText = `Project: ${this.entryPackageName} (${fullPath})`;
        this.entryPackageName = `${this.entryPackageName} (${fullPath})`;
      } else {
        this.displayText = 'Project: ' + this.entryPackageName;
      }
    } else {
      this.displayText = rawEntryId;

      const match = LockfileEntry._packageEntryIdRegex.exec(rawEntryId);

      if (match) {
        const [, packageName, versionPart] = match;
        this.entryPackageName = packageName;

        const underscoreIndex = versionPart.indexOf('_');
        if (underscoreIndex >= 0) {
          const version = versionPart.substring(0, underscoreIndex);
          const suffix = versionPart.substring(underscoreIndex + 1);

          this.entryPackageVersion = version;
          this.entrySuffix = suffix;

          //       /@rushstack/eslint-config/3.0.1_eslint@8.21.0+typescript@4.7.4
          // -->   @rushstack/eslint-config 3.0.1 (eslint@8.21.0+typescript@4.7.4)
          this.displayText = packageName + ' ' + version + ' (' + suffix + ')';
        } else {
          this.entryPackageVersion = versionPart;

          //       /@rushstack/eslint-config/3.0.1
          // -->   @rushstack/eslint-config 3.0.1
          this.displayText = packageName + ' ' + versionPart;
        }
      }

      // Example:
      //   common/temp/default/node_modules/.pnpm
      //     /@babel+register@7.17.7_@babel+core@7.17.12
      //     /node_modules/@babel/register
      this.packageJsonFolderPath =
        `common/temp/${subspaceName}/node_modules/.pnpm/` +
        this.entryPackageName.replace('/', '+') +
        '@' +
        this.entryPackageVersion +
        (this.entrySuffix ? `_${this.entrySuffix}` : '') +
        '/node_modules/' +
        this.entryPackageName;
    }

    LockfileDependency.parseDependencies(this.dependencies, this, rawYamlData);
  }
}
