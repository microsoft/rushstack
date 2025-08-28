// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { InternalError } from '@rushstack/node-core-library';
import { AstEntity, AstSyntheticEntity } from './AstEntity';

export interface IAstSubPathImportOptions {
  readonly astEntity: AstEntity;
  readonly exportPath: string[];
}

/**
 * `AstSubPathImport` represents a sub-path import, such as `import("foo").X.Y.Z` will import Y.Z from X of "foo".
 *
 * @remarks
 *
 * The base AstEntity can be either local or external entity.
 *
 * ```ts
 * // import from AstImport (NamedImport, modulePath="foo", exportName="X"), with exportPath ["Y", "Z"]
 * const foo: import("foo").X.Y.Z;
 *
 * // import from AstImport (DefaultImport, modulePath="foo"), with exportPath ["X", "Y", "Z"]
 * const bar: import("foo").default.X.Y.Z;
 *
 * // import from AstEntity of X, with exportPath ["Y", "Z"]
 * const baz: import("./foo").X.Y.Z;
 * ```
 */
export class AstSubPathImport extends AstSyntheticEntity {
  /**
   * The AstEntity that is imported from.
   *
   * @remarks
   *
   * The AstEntity can be either local or external entity.
   */
  public readonly baseAstEntity: AstEntity;

  /**
   * The path to the entity within the `baseAstEntity`.
   */
  public readonly exportPath: string[];

  /**
   * Whether it is referenced only by import type syntax, e.g. `import("foo").Bar`.
   */
  public isImportTypeEverywhere: boolean = true;

  public constructor(options: IAstSubPathImportOptions) {
    super();

    if (options.exportPath.length === 0) {
      throw new InternalError('AstSubPathImport.exportPath cannot be empty');
    }

    this.baseAstEntity = options.astEntity;
    this.exportPath = options.exportPath;
  }

  /** {@inheritdoc} */
  public get localName(): string {
    // abstract
    return this.exportPath[this.exportPath.length - 1];
  }
}
