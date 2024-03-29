// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/* eslint-disable @typescript-eslint/no-redeclare */

import type { ApiItem, IApiItemJson, IApiItemConstructor, IApiItemOptions } from '../items/ApiItem';
import type { DeserializerContext } from '../model/DeserializerContext';

/**
 * Constructor options for {@link (ApiAbstractMixin:interface)}.
 * @public
 */
export interface IApiAbstractMixinOptions extends IApiItemOptions {
  isAbstract: boolean;
}

export interface IApiAbstractMixinJson extends IApiItemJson {
  isAbstract: boolean;
}

const _isAbstract: unique symbol = Symbol('ApiAbstractMixin._isAbstract');

/**
 * The mixin base class for API items that have an abstract modifier.
 *
 * @remarks
 *
 * This is part of the {@link ApiModel} hierarchy of classes, which are serializable representations of
 * API declarations.  The non-abstract classes (e.g. `ApiClass`, `ApiEnum`, `ApiInterface`, etc.) use
 * TypeScript "mixin" functions (e.g. `ApiDeclaredItem`, `ApiItemContainerMixin`, etc.) to add various
 * features that cannot be represented as a normal inheritance chain (since TypeScript does not allow a child class
 * to extend more than one base class).  The "mixin" is a TypeScript merged declaration with three components:
 * the function that generates a subclass, an interface that describes the members of the subclass, and
 * a namespace containing static members of the class.
 *
 * @public
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
export interface ApiAbstractMixin extends ApiItem {
  /**
   * Indicates that the API item's value has an 'abstract' modifier.
   */
  readonly isAbstract: boolean;

  serializeInto(jsonObject: Partial<IApiItemJson>): void;
}

/**
 * Mixin function for {@link (ApiAbstractMixin:interface)}.
 *
 * @param baseClass - The base class to be extended
 * @returns A child class that extends baseClass, adding the {@link (ApiAbstractMixin:interface)}
 * functionality.
 *
 * @public
 */
export function ApiAbstractMixin<TBaseClass extends IApiItemConstructor>(
  baseClass: TBaseClass
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): TBaseClass & (new (...args: any[]) => ApiAbstractMixin) {
  class MixedClass extends baseClass implements ApiAbstractMixin {
    public [_isAbstract]: boolean;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    public constructor(...args: any[]) {
      super(...args);

      const options: IApiAbstractMixinOptions = args[0];
      this[_isAbstract] = options.isAbstract;
    }

    /** @override */
    public static onDeserializeInto(
      options: Partial<IApiAbstractMixinOptions>,
      context: DeserializerContext,
      jsonObject: IApiAbstractMixinJson
    ): void {
      baseClass.onDeserializeInto(options, context, jsonObject);

      options.isAbstract = jsonObject.isAbstract || false;
    }

    public get isAbstract(): boolean {
      return this[_isAbstract];
    }

    /** @override */
    public serializeInto(jsonObject: Partial<IApiAbstractMixinJson>): void {
      super.serializeInto(jsonObject);

      jsonObject.isAbstract = this.isAbstract;
    }
  }

  return MixedClass;
}

/**
 * Static members for {@link (ApiAbstractMixin:interface)}.
 * @public
 */
export namespace ApiAbstractMixin {
  /**
   * A type guard that tests whether the specified `ApiItem` subclass extends the `ApiAbstractMixin` mixin.
   *
   * @remarks
   *
   * The JavaScript `instanceof` operator cannot be used to test for mixin inheritance, because each invocation of
   * the mixin function produces a different subclass.  (This could be mitigated by `Symbol.hasInstance`, however
   * the TypeScript type system cannot invoke a runtime test.)
   */
  export function isBaseClassOf(apiItem: ApiItem): apiItem is ApiAbstractMixin {
    return apiItem.hasOwnProperty(_isAbstract);
  }
}
