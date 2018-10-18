// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { AstSymbol } from './AstSymbol';

/**
 * Constructor parameters for DtsEntry
 */
export interface IDtsEntryParameters {
  readonly astSymbol: AstSymbol;
  readonly originalName: string;
  readonly exported: boolean;
}

/**
 * This is a data structure used by DtsRollupGenerator to track an AstSymbol that may be
 * emitted in the *.d.ts file.
 * @remarks
 * The additional contextual state beyond AstSymbol is:
 * - Whether it's an export of this entry point or not
 * - The calculated ReleaseTag, which we use for trimming
 * - The nameForEmit, which may get renamed by DtsRollupGenerator._makeUniqueNames()
 */
export class DtsEntry {
  /**
   * The AstSymbol that this entry represents.
   */
  public readonly astSymbol: AstSymbol;

  /**
   * The original name, prior to any renaming by DtsRollupGenerator._makeUniqueNames()
   */
  public readonly originalName: string;

  /**
   * Whether this API item is exported by the *.t.s file
   */
  public readonly exported: boolean;

  private _nameForEmit: string | undefined = undefined;

  private _sortKey: string | undefined = undefined;

  public constructor(parameters: IDtsEntryParameters) {
    this.astSymbol = parameters.astSymbol;
    this.originalName = parameters.originalName;
    this.exported = parameters.exported;
  }

  /**
   * The originalName, possibly renamed to ensure that all the top-level exports have unique names.
   */
  public get nameForEmit(): string | undefined {
    return this._nameForEmit;
  }

  public set nameForEmit(value: string | undefined) {
    this._nameForEmit = value;
    this._sortKey = undefined; // invalidate the cached value
  }

  /**
   * A sorting key used by DtsRollupGenerator._makeUniqueNames()
   */
  public getSortKey(): string {
    if (!this._sortKey) {
      const name: string = this.nameForEmit || this.originalName;
      if (name.substr(0, 1) === '_') {
        // Removes the leading underscore, for example: "_example" --> "example*"
        // This causes internal definitions to sort alphabetically with regular definitions.
        // The star is appended to preserve uniqueness, since "*" is not a legal  identifier character.
        this._sortKey = name.substr(1) + '*';
      } else {
        this._sortKey = name;
      }
    }
    return this._sortKey;
  }
}
