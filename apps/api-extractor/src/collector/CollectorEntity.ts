// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { AstSymbol } from '../analyzer/AstSymbol';
import { Collector } from './Collector';

/**
 * Constructor options for CollectorEntity
 */
export interface ICollectorEntityOptions {
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
 * - The nameForEmit, which may get renamed by DtsRollupGenerator._makeUniqueNames()
 */
export class CollectorEntity {
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

  public constructor(options: ICollectorEntityOptions) {
    this.astSymbol = options.astSymbol;
    this.originalName = options.originalName;
    this.exported = options.exported;
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
      this._sortKey = Collector.getSortKeyIgnoringUnderscore(name);
    }
    return this._sortKey;
  }
}
