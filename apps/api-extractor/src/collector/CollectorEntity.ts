// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as ts from 'typescript';

import { AstSymbol } from '../analyzer/AstSymbol';
import { Collector } from './Collector';
import { Sort } from '@microsoft/node-core-library';
import { AstEntity } from '../analyzer/AstSymbolTable';

/**
 * This is a data structure used by the Collector to track an AstEntity that may be emitted in the *.d.ts file.
 *
 * @remarks
 * The additional contextual state beyond AstSymbol is:
 * - Whether it's an export of this entry point or not
 * - The nameForEmit, which may get renamed by DtsRollupGenerator._makeUniqueNames()
 * - The export name (or names, if the same declaration is exported multiple times)
 */
export class CollectorEntity {
  /**
   * The AstEntity that this entry represents.
   */
  public readonly astEntity: AstEntity;

  private _exportNames: Set<string> = new Set<string>();
  private _exportNamesSorted: boolean = false;
  private _singleExportName: string | undefined = undefined;

  private _nameForEmit: string | undefined = undefined;

  private _sortKey: string | undefined = undefined;

  public constructor(astEntity: AstEntity) {
    this.astEntity = astEntity;
  }

  /**
   * The declaration name that will be emitted in a .d.ts rollup.  For non-exported declarations,
   * Collector._makeUniqueNames() may need to rename the declaration to avoid conflicts with other declarations
   * in that module.
   */
  public get nameForEmit(): string | undefined {
    return this._nameForEmit;
  }

  public set nameForEmit(value: string | undefined) {
    this._nameForEmit = value;
    this._sortKey = undefined; // invalidate the cached value
  }

  /**
   * If this symbol is exported from the entry point, the list of export names.
   *
   * @remarks
   * Note that a given symbol may be exported more than once:
   * ```
   * class X { }
   * export { X }
   * export { X as Y }
   * ```
   */
  public get exportNames(): ReadonlySet<string> {
    if (!this._exportNamesSorted) {
      Sort.sortSet(this._exportNames);
      this._exportNamesSorted = true;
    }
    return this._exportNames;
  }

  /**
   * If exportNames contains only one string, then singleExportName is that string.
   * In all other cases, it is undefined.
   */
  public get singleExportName(): string | undefined {
   return this._singleExportName;
  }

  /**
   * This is true if exportNames contains only one string, and the declaration can be exported using the inline syntax
   * such as "export class X { }" instead of "export { X }".
   */
  public get shouldInlineExport(): boolean {
    // We don't inline an AstImport
    if (this.astEntity instanceof AstSymbol) {
      // We don't inline a symbol with more than one exported name
      if (this._singleExportName !== undefined && this._singleExportName !== ts.InternalSymbolName.Default) {
        // We can't inline a symbol whose emitted name is different from the export name
        if (this._nameForEmit === undefined || this._nameForEmit === this._singleExportName) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Returns true if this symbol is an export for the entry point being analyzed.
   */
  public get exported(): boolean {
    return this.exportNames.size > 0;
  }

  /**
   * Adds a new exportName to the exportNames set.
   */
  public addExportName(exportName: string): void {
    if (!this._exportNames.has(exportName)) {
      this._exportNamesSorted = false;
      this._exportNames.add(exportName);

      if (this._exportNames.size === 1) {
        this._singleExportName = exportName;
      } else {
        this._singleExportName = undefined;
      }
    }
  }

  /**
   * A sorting key used by DtsRollupGenerator._makeUniqueNames()
   */
  public getSortKey(): string {
    if (!this._sortKey) {
      this._sortKey = Collector.getSortKeyIgnoringUnderscore(this.nameForEmit || this.astEntity.localName);
    }
    return this._sortKey;
  }
}
