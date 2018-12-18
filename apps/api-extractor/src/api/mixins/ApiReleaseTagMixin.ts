// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.s

import { ApiItem, IApiItemJson, IApiItemConstructor, IApiItemOptions } from '../items/ApiItem';
import { ReleaseTag } from '../../aedoc/ReleaseTag';

/**
 * Constructor options for {@link (ApiReleaseTagMixin:interface)}.
 * @public
 */
export interface IApiReleaseTagMixinOptions extends IApiItemOptions {
  releaseTag: ReleaseTag;
}

export interface IApiReleaseTagMixinJson extends IApiItemJson {
  releaseTag: string;
}

const _releaseTag: unique symbol = Symbol('ApiReleaseTagMixin._releaseTag');

/**
 * The mixin base class for API items that can be attributed with a TSDoc tag such as `@internal`,
 * `@alpha`, `@beta`, or `@public`.  These "release tags" indicate the support level for an API.
 *
 * @remarks
 *
 * This is part of the {@link ApiModel} hierarchy of classes, which are serializable representations of
 * API declarations.  The non-abstract classes (e.g. `ApiClass`, `ApiEnum`, `ApiInterface`, etc.) use
 * TypeScript "mixin" functions (e.g. `ApiDeclarationMixin`, `ApiItemContainerMixin`, etc.) to add various
 * features that cannot be represented as a normal inheritance chain (since TypeScript does not allow a child class
 * to extend more than one base class).  The "mixin" is a TypeScript merged declaration with three components:
 * the function that generates a subclass, an interface that describes the members of the subclass, and
 * a namespace containing static members of the class.
 *
 * @public
 */
// tslint:disable-next-line:interface-name
export interface ApiReleaseTagMixin extends ApiItem {
  /**
   * The effective release tag for this declaration.  If it is not explicitly specified, the value may be
   * inherited from a containing declaration.
   *
   * @remarks
   * For example, an `ApiEnumMember` may inherit its release tag from the containing `ApiEnum`.
   */
  readonly releaseTag: ReleaseTag;

  /** @override */
  serializeInto(jsonObject: Partial<IApiItemJson>): void;
}

/**
 * Mixin function for {@link (ApiReleaseTagMixin:interface)}.
 *
 * @param baseClass - The base class to be extended
 * @returns A child class that extends baseClass, adding the {@link (ApiReleaseTagMixin:interface)} functionality.
 *
 * @public
 */
export function ApiReleaseTagMixin<TBaseClass extends IApiItemConstructor>(baseClass: TBaseClass):
  TBaseClass & (new (...args: any[]) => ApiReleaseTagMixin) { // tslint:disable-line:no-any

  abstract class MixedClass extends baseClass implements ApiReleaseTagMixin {
    public [_releaseTag]: ReleaseTag;

    /** @override */
    public static onDeserializeInto(options: Partial<IApiReleaseTagMixinOptions>,
      jsonObject: IApiReleaseTagMixinJson): void {

      baseClass.onDeserializeInto(options, jsonObject);

      const deserializedReleaseTag: ReleaseTag | undefined = ReleaseTag[jsonObject.releaseTag];
      if (deserializedReleaseTag === undefined) {
        throw new Error(`Failed to deserialize release tag ${JSON.stringify(jsonObject.releaseTag)}`);
      }

      options.releaseTag = deserializedReleaseTag;
    }

    // tslint:disable-next-line:no-any
    constructor(...args: any[]) {
      super(...args);

      const options: IApiReleaseTagMixinOptions = args[0];
      this[_releaseTag] = options.releaseTag;
    }

    public get releaseTag(): ReleaseTag {
      return this[_releaseTag];
    }

    /** @override */
    public serializeInto(jsonObject: Partial<IApiReleaseTagMixinJson>): void {
      super.serializeInto(jsonObject);

      jsonObject.releaseTag = ReleaseTag[this.releaseTag];
    }
  }

  return MixedClass;
}

/**
 * Static members for {@link (ApiReleaseTagMixin:interface)}.
 * @public
 */
export namespace ApiReleaseTagMixin {
  /**
   * A type guard that tests whether the specified `ApiItem` subclass extends the `ApiReleaseTagMixin` mixin.
   *
   * @remarks
   *
   * The JavaScript `instanceof` operator cannot be used to test for mixin inheritance, because each invocation of
   * the mixin function produces a different subclass.  (This could be mitigated by `Symbol.hasInstance`, however
   * the TypeScript type system cannot invoke a runtime test.)
   */
  export function isBaseClassOf(apiItem: ApiItem): apiItem is ApiReleaseTagMixin {
    return apiItem.hasOwnProperty(_releaseTag);
  }
}
