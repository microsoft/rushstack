// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.s

import { ApiItem, IApiItemJson, IApiItemConstructor, IApiItemOptions } from '../items/ApiItem';
import { ApiDocumentedItem } from '../items/ApiDocumentedItem';
import { Excerpt, ExcerptToken, IExcerptTokenRange, IExcerptToken } from './Excerpt';

/**
 * Constructor options for {@link (ApiDeclarationMixin:interface)}.
 * @public
 */
export interface IApiDeclarationMixinOptions extends IApiItemOptions {
  excerptTokens: IExcerptToken[];
}

export interface IApiDeclarationMixinJson extends IApiItemJson {
  excerptTokens: IExcerptToken[];
}

const _excerpt: unique symbol = Symbol('ApiDeclarationMixin._excerpt');
const _excerptTokens: unique symbol = Symbol('ApiDeclarationMixin._excerptTokens');

/**
 * The mixin base class for API items that have an associated source code excerpt containing a
 * TypeScript declaration.
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
 * Most `ApiItem` subclasses have declarations and thus extend `ApiDeclarationMixin`.  Counterexamples include
 * `ApiModel` and `ApiPackage`, which do not have any corresponding TypeScript source code.
 *
 * @public
 */
// tslint:disable-next-line:interface-name
export interface ApiDeclarationMixin extends ApiItem {
  /**
   * The source code excerpt where the API item is declared.
   */
  readonly excerpt: Excerpt;

  /**
   * The individual source code tokens that comprise the main excerpt.
   */
  readonly excerptTokens: ReadonlyArray<ExcerptToken>;

  /** @override */
  serializeInto(jsonObject: Partial<IApiItemJson>): void;

  /**
   * Constructs a new {@link Excerpt} corresponding to the provided token range.
   */
  buildExcerpt(tokenRange: IExcerptTokenRange): Excerpt;

  /**
   * If the API item has certain important modifier tags such as `@sealed`, `@virtual`, or `@override`,
   * this prepends them as a doc comment above the excerpt.
   */
  getExcerptWithModifiers(): string;
}

/**
 * Mixin function for {@link (ApiDeclarationMixin:interface)}.
 *
 * @param baseClass - The base class to be extended
 * @returns A child class that extends baseClass, adding the {@link (ApiDeclarationMixin:interface)} functionality.
 *
 * @public
 */
export function ApiDeclarationMixin<TBaseClass extends IApiItemConstructor>(baseClass: TBaseClass):
  TBaseClass & (new (...args: any[]) => ApiDeclarationMixin) { // tslint:disable-line:no-any

  abstract class MixedClass extends baseClass implements ApiDeclarationMixin {
    public [_excerptTokens]: ExcerptToken[];
    public [_excerpt]: Excerpt;

    /** @override */
    public static onDeserializeInto(options: Partial<IApiDeclarationMixinOptions>,
      jsonObject: IApiDeclarationMixinJson): void {

      baseClass.onDeserializeInto(options, jsonObject);

      options.excerptTokens = jsonObject.excerptTokens;
    }

    // tslint:disable-next-line:no-any
    constructor(...args: any[]) {
      super(...args);

      const options: IApiDeclarationMixinOptions = args[0];
      this[_excerptTokens] = [...options.excerptTokens];
      this[_excerpt] = new Excerpt(this.excerptTokens, { startIndex: 0, endIndex: this.excerptTokens.length });
    }

    public get excerpt(): Excerpt {
      return this[_excerpt];
    }

    public get excerptTokens(): ReadonlyArray<ExcerptToken> {
      return this[_excerptTokens];
    }

    public getExcerptWithModifiers(): string {
      const excerpt: string = this.excerpt.text;
      const modifierTags: string[] = [];

      if (excerpt.length > 0) {
        if (this instanceof ApiDocumentedItem) {
          if (this.tsdocComment) {
            if (this.tsdocComment.modifierTagSet.isSealed()) {
              modifierTags.push('@sealed');
            }
            if (this.tsdocComment.modifierTagSet.isVirtual()) {
              modifierTags.push('@virtual');
            }
            if (this.tsdocComment.modifierTagSet.isOverride()) {
              modifierTags.push('@override');
            }
          }
          if (modifierTags.length > 0) {
            return '/** ' + modifierTags.join(' ') + ' */\n'
              + excerpt;
          }
        }
      }

      return excerpt;
    }

    /** @override */
    public serializeInto(jsonObject: Partial<IApiDeclarationMixinJson>): void {
      super.serializeInto(jsonObject);

      jsonObject.excerptTokens = this.excerptTokens.map(x => ({ kind: x.kind, text: x.text }));
    }

    public buildExcerpt(tokenRange: IExcerptTokenRange): Excerpt {
      return new Excerpt(this.excerptTokens, tokenRange);
    }

  }

  return MixedClass;
}

/**
 * Static members for {@link (ApiDeclarationMixin:interface)}.
 * @public
 */
export namespace ApiDeclarationMixin {
  /**
   * A type guard that tests whether the specified `ApiItem` subclass extends the `ApiDeclarationMixin` mixin.
   *
   * @remarks
   *
   * The JavaScript `instanceof` operator cannot be used to test for mixin inheritance, because each invocation of
   * the mixin function produces a different subclass.  (This could be mitigated by `Symbol.hasInstance`, however
   * the TypeScript type system cannot invoke a runtime test.)
   */
  export function isBaseClassOf(apiItem: ApiItem): apiItem is ApiDeclarationMixin {
    return apiItem.hasOwnProperty(_excerpt);
  }
}
