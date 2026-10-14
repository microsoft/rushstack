// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { Colorize, type ITerminal } from '@rushstack/terminal';

import type { RushConfiguration } from '../../api/RushConfiguration';
import type { Subspace } from '../../api/Subspace';
import {
  getEffectivePnpmCatalogs,
  getEffectivePnpmOptions,
  mergePnpmCatalogs,
  type PnpmCatalogs
} from './EffectivePnpmOptions';
import type { PnpmOptionsConfiguration } from './PnpmOptionsConfiguration';
import { formatPnpmCatalogSpecifier, tryGetPnpmCatalogVersion } from './PnpmCatalogReference';

/**
 * A change to the version of a PNPM catalog entry.
 */
export interface IPnpmCatalogEntryUpdate {
  readonly catalogName: string;
  readonly packageName: string;
  readonly oldVersion: string | undefined;
  readonly newVersion: string;
}

interface IPendingPnpmConfigCatalogs {
  readonly pnpmOptions: PnpmOptionsConfiguration;
  readonly pnpmConfigFilePath: string;
  /**
   * The catalogs after the pending updates are applied. This is a plain copy of the loaded catalogs.
   */
  readonly catalogs: PnpmCatalogs;
  /**
   * Keyed by `${catalogName}\0${packageName}`
   */
  readonly updates: Map<string, IPnpmCatalogEntryUpdate>;
}

/**
 * Collects changes to the PNPM catalogs in pnpm-config.json files, so that every change can be planned
 * (and validated) before any file is written.
 *
 * @remarks
 * Changes are tracked per effective pnpm-config.json file (see {@link getEffectivePnpmOptions}), because several
 * subspaces can share the same file. Catalog entries are only added or updated, never removed.
 */
export class PendingPnpmCatalogUpdates {
  readonly #rushConfiguration: RushConfiguration;
  readonly #pendingByPnpmConfigFilePath: Map<string, IPendingPnpmConfigCatalogs>;

  public constructor(rushConfiguration: RushConfiguration) {
    this.#rushConfiguration = rushConfiguration;
    this.#pendingByPnpmConfigFilePath = new Map();
  }

  /**
   * True if any catalog entry will be changed by {@link PendingPnpmCatalogUpdates.saveAsync}.
   */
  public get hasUpdates(): boolean {
    for (const { updates } of this.#pendingByPnpmConfigFilePath.values()) {
      if (updates.size > 0) {
        return true;
      }
    }

    return false;
  }

  /**
   * Returns the catalogs that are in effect for the subspace, including the pending updates.
   */
  public getCatalogs(subspace: Subspace): PnpmCatalogs | undefined {
    if (!this.#rushConfiguration.isPnpm) {
      return undefined;
    }

    const { pnpmConfigFilePath } = getEffectivePnpmOptions(subspace, this.#rushConfiguration);
    const pending: IPendingPnpmConfigCatalogs | undefined =
      this.#pendingByPnpmConfigFilePath.get(pnpmConfigFilePath);
    return pending ? pending.catalogs : getEffectivePnpmCatalogs(subspace, this.#rushConfiguration);
  }

  /**
   * Returns the pnpm-config.json file that stores the catalogs for the subspace.
   */
  public getPnpmConfigFilePath(subspace: Subspace): string {
    return getEffectivePnpmOptions(subspace, this.#rushConfiguration).pnpmConfigFilePath;
  }

  /**
   * Schedules setting the version of a catalog entry in the catalogs that are in effect for the subspace.
   *
   * @remarks
   * Throws if a different version was already scheduled for the same catalog entry.
   */
  public setVersion(subspace: Subspace, catalogName: string, packageName: string, version: string): void {
    const pending: IPendingPnpmConfigCatalogs = this.#getOrCreatePending(subspace);
    const key: string = `${catalogName}\0${packageName}`;
    const existingUpdate: IPnpmCatalogEntryUpdate | undefined = pending.updates.get(key);
    if (existingUpdate) {
      if (existingUpdate.newVersion !== version) {
        throw new Error(
          `Unable to set the version of "${packageName}" in the PNPM catalog ` +
            `"${formatPnpmCatalogSpecifier(catalogName)}" of ${pending.pnpmConfigFilePath} to "${version}", ` +
            `because it is also being set to "${existingUpdate.newVersion}".`
        );
      }

      return;
    }

    const oldVersion: string | undefined = tryGetPnpmCatalogVersion(
      pending.catalogs,
      catalogName,
      packageName
    );
    if (oldVersion === version) {
      return;
    }

    if (!Object.prototype.hasOwnProperty.call(pending.catalogs, catalogName)) {
      pending.catalogs[catalogName] = {};
    }

    pending.catalogs[catalogName][packageName] = version;
    pending.updates.set(key, { catalogName, packageName, oldVersion, newVersion: version });
  }

  /**
   * Writes the pending catalog changes to the pnpm-config.json files.
   *
   * @param subspacesToUpdate - the subspaces that the caller will run "rush update" for. Other subspaces
   * that use a changed pnpm-config.json are reported, because their shrinkwrap files must be updated too.
   */
  public async saveAsync(terminal: ITerminal, subspacesToUpdate: ReadonlySet<Subspace>): Promise<void> {
    for (const pending of this.#pendingByPnpmConfigFilePath.values()) {
      const { pnpmOptions, pnpmConfigFilePath, catalogs, updates } = pending;
      if (updates.size === 0) {
        continue;
      }

      await pnpmOptions.updateGlobalCatalogsAsync(catalogs);

      terminal.writeLine(Colorize.green('Updated PNPM catalogs in ') + pnpmConfigFilePath);
      for (const { catalogName, packageName, oldVersion, newVersion } of updates.values()) {
        terminal.writeLine(
          `  ${formatPnpmCatalogSpecifier(catalogName)} ${packageName}: ` +
            `${oldVersion ?? '(new entry)'} -> ${Colorize.cyan(newVersion)}`
        );
      }

      const subspacesNotUpdated: Subspace[] = this.#getSubspacesUsingPnpmConfig(pnpmConfigFilePath).filter(
        (subspace: Subspace) => !subspacesToUpdate.has(subspace)
      );
      if (subspacesNotUpdated.length > 0) {
        // The shrinkwrap files and repo-state.json files of these subspaces still reflect the old catalogs.
        // Their next "rush install" would fail the PNPM lockfile catalog check, so they must be updated too.
        const updateCommands: string[] = subspacesNotUpdated.map(
          (subspace: Subspace) => `    rush update --subspace ${subspace.subspaceName}`
        );
        terminal.writeWarningLine(
          `The catalogs were updated in ${pnpmConfigFilePath}, which is also used by subspaces that this ` +
            'command does not update.\n' +
            '  Run these commands to update their shrinkwrap files, then commit those changes to Git:\n' +
            updateCommands.join('\n')
        );
      }
    }
  }

  #getSubspacesUsingPnpmConfig(pnpmConfigFilePath: string): Subspace[] {
    if (!this.#rushConfiguration.subspacesFeatureEnabled) {
      return [];
    }

    return this.#rushConfiguration.subspaces.filter(
      (subspace: Subspace) =>
        getEffectivePnpmOptions(subspace, this.#rushConfiguration).pnpmConfigFilePath === pnpmConfigFilePath
    );
  }

  #getOrCreatePending(subspace: Subspace): IPendingPnpmConfigCatalogs {
    if (!this.#rushConfiguration.isPnpm) {
      throw new Error('PNPM catalogs can only be updated when the package manager is PNPM.');
    }

    const { pnpmOptions, pnpmConfigFilePath } = getEffectivePnpmOptions(subspace, this.#rushConfiguration);
    let pending: IPendingPnpmConfigCatalogs | undefined =
      this.#pendingByPnpmConfigFilePath.get(pnpmConfigFilePath);
    if (!pending) {
      if (pnpmOptions.jsonFilename === undefined) {
        throw new Error(
          'Unable to update the PNPM catalogs because the PNPM options are defined by the "pnpmOptions" ' +
            `field in rush.json. Move them to ${pnpmConfigFilePath}.`
        );
      }

      // Copy the catalogs, because the loaded object must not change until the file is written.
      // mergePnpmCatalogs() returns its input only if there are no catalogs.
      const { globalCatalogs } = pnpmOptions;
      const catalogsCopy: PnpmCatalogs | undefined = mergePnpmCatalogs(globalCatalogs, undefined);
      pending = {
        pnpmOptions,
        pnpmConfigFilePath,
        catalogs: catalogsCopy && catalogsCopy !== globalCatalogs ? catalogsCopy : {},
        updates: new Map()
      };
      this.#pendingByPnpmConfigFilePath.set(pnpmConfigFilePath, pending);
    }

    return pending;
  }
}
