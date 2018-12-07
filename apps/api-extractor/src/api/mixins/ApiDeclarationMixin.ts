// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.s

import { ApiItem, IApiItemJson, IApiItemConstructor, IApiItemOptions } from '../model/ApiItem';
import { ApiDocumentedItem } from '../model/ApiDocumentedItem';
import { Excerpt, ExcerptToken, IExcerptTokenRange, IDeclarationExcerpt, ExcerptName } from './Excerpt';

/**
 * Constructor options for {@link (ApiDeclarationMixin:interface)}.
 * @public
 */
export interface IApiDeclarationMixinOptions extends IApiItemOptions {
  declarationExcerpt: IDeclarationExcerpt;
}

export interface IApiDeclarationMixinJson extends IApiItemJson, IDeclarationExcerpt {
}

const _excerpt: unique symbol = Symbol('ApiDeclarationMixin._excerpt');
const _excerptTokens: unique symbol = Symbol('ApiDeclarationMixin._excerptTokens');
const _embeddedExcerptsByName: unique symbol = Symbol('ApiDeclarationMixin._embeddedExcerptsByName');

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

  /**
   * A collection of named embedded excerpts.  For example, if `ApiDeclarationMixin.excerpt` is a property
   * declaration, then `embeddedExcerptsByName` might contain an embedded excerpt corresponding to the
   * type of the property.
   */
  readonly embeddedExcerptsByName: ReadonlyMap<ExcerptName, Excerpt>;

  /** @override */
  serializeInto(jsonObject: Partial<IApiItemJson>): void;

  /**
   * Returns a member of the {@link (ApiDeclarationMixin:interface).embeddedExcerptsByName} map,
   * or throws an exception if was not found.
   */
  getEmbeddedExcerpt(name: ExcerptName): Excerpt;

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
    public [_embeddedExcerptsByName]: Map<ExcerptName, Excerpt>;
    public [_excerpt]: Excerpt;

    /** @override */
    public static onDeserializeInto(options: Partial<IApiDeclarationMixinOptions>,
      jsonObject: IApiDeclarationMixinJson): void {

      baseClass.onDeserializeInto(options, jsonObject);

      const declarationExcerpt: IDeclarationExcerpt = {
        excerptTokens: jsonObject.excerptTokens.map(x => new ExcerptToken(x.kind, x.text)),
        embeddedExcerpts: { }
      };

      for (const key of Object.getOwnPropertyNames(jsonObject.embeddedExcerpts)) {
        const range: IExcerptTokenRange = jsonObject.embeddedExcerpts[key];
        declarationExcerpt.embeddedExcerpts[key] = range;
      }

      options.declarationExcerpt = declarationExcerpt;
    }

    // tslint:disable-next-line:no-any
    constructor(...args: any[]) {
      super(...args);

      const options: IApiDeclarationMixinOptions = args[0];
      this[_excerptTokens] = [...options.declarationExcerpt.excerptTokens];

      this[_embeddedExcerptsByName] = new Map<ExcerptName, Excerpt>();

      for (const key of Object.getOwnPropertyNames(options.declarationExcerpt.embeddedExcerpts)) {
        const excerptRange: IExcerptTokenRange = options.declarationExcerpt.embeddedExcerpts[key];
        this[_embeddedExcerptsByName].set(key as ExcerptName, new Excerpt(this[_excerptTokens], excerptRange));
      }

      // this.excerpt is a Excerpt that spans the entire list of tokens
      this[_excerpt] = new Excerpt(this[_excerptTokens],
        { startIndex: 0, endIndex: this[_excerptTokens].length });
    }

    public get excerpt(): Excerpt {
      return this[_excerpt];
    }

    public get excerptTokens(): ReadonlyArray<ExcerptToken> {
      return this[_excerptTokens];
    }

    public get embeddedExcerptsByName(): ReadonlyMap<ExcerptName, Excerpt> {
      return this[_embeddedExcerptsByName];
    }

    public getEmbeddedExcerpt(name: ExcerptName): Excerpt {
      const excerpt: Excerpt | undefined = this.embeddedExcerptsByName.get(name);
      if (excerpt === undefined) {
        throw new Error(`The embedded excerpt "${name}" must be defined for ${this.kind} objects`);
      }
      return excerpt;
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

      jsonObject.embeddedExcerpts = { };
      for (const [key, value] of this.embeddedExcerptsByName) {
        jsonObject.embeddedExcerpts[key] = value.tokenRange;
      }
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
