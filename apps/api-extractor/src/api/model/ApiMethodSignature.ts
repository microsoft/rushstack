// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { ApiItemKind } from './ApiItem';
import { IApiMethodItemOptions, ApiMethodItem } from './ApiMethodItem';

/** @public */
export interface IApiMethodSignatureOptions extends IApiMethodItemOptions {
}

/**
 * Represents a TypeScript member function declaration that belongs to an `ApiInterface`.
 *
 * @remarks
 *
 * This is part of the {@link ApiModel} hierarchy of classes, which are serializable representations of
 * API declarations.
 *
 * `ApiMethodSignature` represents a TypeScript declaration such as the `render` member function in this example:
 *
 * ```ts
 * export interface IWidget {
 *   draw(): void;
 * }
 * ```
 *
 * Compare with {@link ApiMethod}, which represents a method belonging to a class.
 * For example, a class method can be `static` but an interface method cannot.
 *
 * @public
 */
export class ApiMethodSignature extends ApiMethodItem {
  public static getCanonicalReference(name: string, overloadIndex: number): string {
    return `(${name}:${overloadIndex})`;
  }

  public constructor(options: IApiMethodSignatureOptions) {
    super(options);
  }

  /** @override */
  public get kind(): ApiItemKind {
    return ApiItemKind.MethodSignature;
  }

  /** @override */
  public get canonicalReference(): string {
    return ApiMethodSignature.getCanonicalReference(this.name, this.overloadIndex);
  }
}
