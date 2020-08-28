// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { AstModule } from './AstModule';
import { AstSyntheticEntity } from './AstEntity';

export interface IAstImportAsModuleOptions {
  readonly astModule: AstModule;
  readonly namespaceName: string;
}

/**
 * `AstImportAsModule` represents a namespace that is created implicitly by a statement
 * such as `import * as example from "./file";`
 *
 * @remarks
 *
 * A typical input looks like this:
 * ```ts
 * // Suppose that example.ts exports two functions f1() and f2().
 * import * as example from "./file";
 * export { example };
 * ```
 *
 * API Extractor's .d.ts rollup will transform it into an explicit namespace, like this:
 * ```ts
 * declare f1(): void;
 * declare f2(): void;
 *
 * declare namespace example {
 *   export {
 *     f1,
 *     f2
 *   }
 * }
 * ```
 *
 * The current implementation does not attempt to relocate f1()/f2() to be inside the `namespace`
 * because other type signatures may reference them directly (without using the namespace qualifier).
 * The `declare namespace example` is a synthetic construct represented by `AstImportAsModule`.
 */
export class AstImportAsModule extends AstSyntheticEntity {
  /**
   * Returns true if the AstSymbolTable.analyze() was called for this object.
   * See that function for details.
   */
  public analyzed: boolean = false;

  /**
   * For example, if the original statement was `import * as example from "./file";`
   * then `astModule` refers to the `./file.d.ts` file.
   */
  public readonly astModule: AstModule;

  /**
   * For example, if the original statement was `import * as example from "./file";`
   * then `namespaceName` would be `example`.
   */
  public readonly namespaceName: string;

  public constructor(options: IAstImportAsModuleOptions) {
    super();
    this.astModule = options.astModule;
    this.namespaceName = options.namespaceName;
  }

  /** {@inheritdoc} */
  public get localName(): string {
    // abstract
    return this.namespaceName;
  }
}
