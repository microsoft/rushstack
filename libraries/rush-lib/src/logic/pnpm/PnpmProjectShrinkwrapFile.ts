// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as crypto from 'node:crypto';

import { InternalError, JsonFile } from '@rushstack/node-core-library';

import { BaseProjectShrinkwrapFile } from '../base/BaseProjectShrinkwrapFile';
import type {
  PnpmShrinkwrapFile,
  IPnpmShrinkwrapDependencyYaml,
  IPnpmVersionSpecifier
} from './PnpmShrinkwrapFile';
import type { DependencySpecifier } from '../DependencySpecifier';
import { RushConstants } from '../RushConstants';
import type { Subspace } from '../../api/Subspace';

/**
 *
 */
export class PnpmProjectShrinkwrapFile extends BaseProjectShrinkwrapFile<PnpmShrinkwrapFile> {
  /**
   * Generate and write the project shrinkwrap file to <project>/.rush/temp/shrinkwrap-deps.json.
   * @returns True if the project shrinkwrap was created or updated, false otherwise.
   */
  public async updateProjectShrinkwrapAsync(): Promise<void> {
    const projectShrinkwrapMap: Map<string, string> | undefined =
      await this.generateProjectShrinkwrapMapAsync();

    return projectShrinkwrapMap ? this.saveAsync(projectShrinkwrapMap) : this.deleteIfExistsAsync();
  }

  public async hasChangesAsync(otherShrinkwrap: PnpmProjectShrinkwrapFile): Promise<boolean> {
    if (
      !otherShrinkwrap.shrinkwrapFile.isWorkspaceCompatible &&
      !otherShrinkwrap.shrinkwrapFile.getTempProjectDependencyKey(this.project.tempProjectName)
    ) {
      // The project is new to the shrinkwrap file.
      return true;
    }

    const otherMap: Map<string, string> | undefined =
      await otherShrinkwrap.generateProjectShrinkwrapMapAsync();
    const thisMap: Map<string, string> | undefined = await this.generateProjectShrinkwrapMapAsync();

    if (!thisMap || !otherMap) {
      // Handle one or both being undefined.
      return !!(thisMap || otherMap);
    }

    if (thisMap.size !== otherMap.size) {
      // Entries added or removed
      return true;
    }

    for (const [key, value] of thisMap) {
      if (otherMap.get(key) !== value) {
        // A dependency changed or was added/removed
        return true;
      }
    }

    return false;
  }

  /**
   * Generate the project shrinkwrap file content
   */
  protected async generateProjectShrinkwrapMapAsync(): Promise<Map<string, string> | undefined> {
    const projectShrinkwrapMap: Map<string, string> | undefined = this.shrinkwrapFile.isWorkspaceCompatible
      ? await this.generateWorkspaceProjectShrinkwrapMapAsync()
      : await this.generateLegacyProjectShrinkwrapMapAsync();

    return projectShrinkwrapMap;
  }

  protected async generateWorkspaceProjectShrinkwrapMapAsync(): Promise<Map<string, string> | undefined> {
    // Obtain the workspace importer from the shrinkwrap, which lists resolved dependencies
    const subspace: Subspace = this.project.subspace;

    const importerKey: string = this.shrinkwrapFile.getImporterKeyByPath(
      subspace.getSubspaceTempFolderPath(),
      this.project.projectFolder
    );

    const projectShrinkwrapMap: Map<string, string> | undefined =
      await this.shrinkwrapFile.getIntegrityForImporterAsync(importerKey);

    return projectShrinkwrapMap;
  }

  protected async generateLegacyProjectShrinkwrapMapAsync(): Promise<Map<string, string>> {
    const tempProjectDependencyKey: string | undefined = this.shrinkwrapFile.getTempProjectDependencyKey(
      this.project.tempProjectName
    );
    if (!tempProjectDependencyKey) {
      throw new Error(`Cannot get dependency key for temp project: ${this.project.tempProjectName}`);
    }
    const parentShrinkwrapEntry: IPnpmShrinkwrapDependencyYaml =
      this.shrinkwrapFile.getShrinkwrapEntryFromTempProjectDependencyKey(tempProjectDependencyKey)!;

    const allDependencies: [string, IPnpmVersionSpecifier][] = [
      ...Object.entries(parentShrinkwrapEntry.dependencies || {}),
      ...Object.entries(parentShrinkwrapEntry.optionalDependencies || {})
    ];

    const projectShrinkwrapMap: Map<string, string> = new Map();
    for (const [name, version] of allDependencies) {
      if (name.indexOf(`${RushConstants.rushTempNpmScope}/`) < 0) {
        // Only select the shrinkwrap dependencies that are non-local since we already handle local
        // project changes
        await this._addDependencyRecursiveAsync(projectShrinkwrapMap, name, version, parentShrinkwrapEntry);
      }
    }

    // Since peer dependencies within on external packages may be hoisted up to the top-level package,
    // we need to resolve and add these dependencies directly
    await this._resolveAndAddPeerDependenciesAsync(projectShrinkwrapMap, parentShrinkwrapEntry);

    return projectShrinkwrapMap;
  }

  private async _addDependencyRecursiveAsync(
    projectShrinkwrapMap: Map<string, string>,
    name: string,
    version: IPnpmVersionSpecifier,
    parentShrinkwrapEntry: IPnpmShrinkwrapDependencyYaml,
    throwIfShrinkwrapEntryMissing: boolean = true
  ): Promise<void> {
    const specifier: string = `${name}@${version}`;
    if (projectShrinkwrapMap.has(specifier)) {
      // getShrinkwrapEntry is idempotent with respect to name and version
      return;
    }

    const shrinkwrapEntry: IPnpmShrinkwrapDependencyYaml | undefined =
      await this.shrinkwrapFile.getShrinkwrapEntryAsync(name, version);

    if (!shrinkwrapEntry) {
      if (throwIfShrinkwrapEntryMissing) {
        throw new InternalError(`Unable to find dependency ${name} with version ${version} in shrinkwrap.`);
      }
      return;
    }

    // Hash the full shrinkwrap entry instead of using just resolution.integrity.
    // This ensures that changes to sub-dependency resolutions are detected.
    // For example, if package A depends on B@1.0 and B@1.0's resolution of C changes
    // from C@1.3 to C@1.2, the hash of A's shrinkwrap entry will change because
    // the dependencies field in the entry reflects the resolved versions.
    const sha256Digest: string = crypto
      .createHash('sha256')
      .update(JSON.stringify(shrinkwrapEntry))
      .digest('hex');
    const integrity: string = `${name}@${version}:${sha256Digest}:`;

    // Add the current dependency
    projectShrinkwrapMap.set(specifier, integrity);

    // Add the dependencies of the dependency
    for (const [dependencyName, dependencyVersion] of Object.entries(shrinkwrapEntry.dependencies || {})) {
      await this._addDependencyRecursiveAsync(
        projectShrinkwrapMap,
        dependencyName,
        dependencyVersion,
        shrinkwrapEntry
      );
    }

    // Add the optional dependencies of the dependency, and don't blow up if they don't exist
    for (const [dependencyName, dependencyVersion] of Object.entries(
      shrinkwrapEntry.optionalDependencies || {}
    )) {
      await this._addDependencyRecursiveAsync(
        projectShrinkwrapMap,
        dependencyName,
        dependencyVersion,
        shrinkwrapEntry,
        /* throwIfShrinkwrapEntryMissing */ false
      );
    }

    // When using workspaces, hoisting of peer dependencies to a singular top-level project is not possible.
    // Therefore, all packages that are consumed should be specified in the dependency tree. Given this, there
    // is no need to look for peer dependencies, since it is simply a constraint to be validated by the
    // package manager.
    if (!this.shrinkwrapFile.isWorkspaceCompatible) {
      await this._resolveAndAddPeerDependenciesAsync(
        projectShrinkwrapMap,
        shrinkwrapEntry,
        parentShrinkwrapEntry
      );
    }
  }

  private async _resolveAndAddPeerDependenciesAsync(
    projectShrinkwrapMap: Map<string, string>,
    shrinkwrapEntry: IPnpmShrinkwrapDependencyYaml,
    parentShrinkwrapEntry?: IPnpmShrinkwrapDependencyYaml
  ): Promise<void> {
    for (const peerDependencyName of Object.keys(shrinkwrapEntry.peerDependencies || {})) {
      // Skip peer dependency resolution of local package peer dependencies
      if (peerDependencyName.indexOf(RushConstants.rushTempNpmScope) !== -1) {
        continue;
      }

      // Check to see if the peer dependency is satisfied with the current shrinkwrap
      // entry. If not, check the parent shrinkwrap entry. Finally, if neither have
      // the specified dependency, check that the parent mentions the dependency in
      // it's own peer dependencies. If it is, we can rely on the package manager and
      // make the assumption that we've already found it further up the stack.
      if (
        shrinkwrapEntry.dependencies?.hasOwnProperty(peerDependencyName) ||
        parentShrinkwrapEntry?.dependencies?.hasOwnProperty(peerDependencyName) ||
        parentShrinkwrapEntry?.peerDependencies?.hasOwnProperty(peerDependencyName)
      ) {
        continue;
      }

      // As a last attempt, check if it's been hoisted up as a top-level dependency. If
      // we can't find it, we can assume that it's already been provided somewhere up the
      // dependency tree.
      const topLevelDependencySpecifier: DependencySpecifier | undefined =
        await this.shrinkwrapFile.getTopLevelDependencyVersionAsync(peerDependencyName);

      if (topLevelDependencySpecifier) {
        await this._addDependencyRecursiveAsync(
          projectShrinkwrapMap,
          peerDependencyName,
          this.shrinkwrapFile.getTopLevelDependencyKey(peerDependencyName)!,
          shrinkwrapEntry
        );
      }
    }
  }

  /**
   * Save the current state of the object to project/.rush/temp/shrinkwrap-deps.json
   */
  protected async saveAsync(projectShrinkwrapMap: Map<string, string>): Promise<void> {
    const file: { [specifier: string]: string } = {};
    const keys: string[] = Array.from(projectShrinkwrapMap.keys()).sort();
    for (const key of keys) {
      file[key] = projectShrinkwrapMap.get(key)!;
    }
    await JsonFile.saveAsync(file, this.projectShrinkwrapFilePath, { ensureFolderExists: true });
  }
}
