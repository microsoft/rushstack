// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.s

import { ApiItem, IApiItemJson, IApiItemConstructor, IApiItemOptions } from '../model/ApiItem';
import { ApiDocumentedItem } from '../model/ApiDocumentedItem';
import { Excerpt, ExcerptToken, IExcerptTokenRange, IDeclarationExcerpt, ExcerptName } from './Excerpt';

/** @public */
export interface IApiDeclarationMixinOptions extends IApiItemOptions {
  declarationExcerpt: IDeclarationExcerpt;
}

export interface IApiDeclarationMixinJson extends IApiItemJson, IDeclarationExcerpt {
}

const _excerpt: unique symbol = Symbol('ApiDeclarationMixin._excerpt');
const _excerptTokens: unique symbol = Symbol('ApiDeclarationMixin._excerptTokens');
const _embeddedExcerptsByName: unique symbol = Symbol('ApiDeclarationMixin._embeddedExcerptsByName');

/** @public */
// tslint:disable-next-line:interface-name
export interface ApiDeclarationMixin extends ApiItem {
  readonly excerpt: Excerpt;

  readonly excerptTokens: ReadonlyArray<ExcerptToken>;

  readonly embeddedExcerptsByName: ReadonlyMap<ExcerptName, Excerpt>;

  /** @override */
  serializeInto(jsonObject: Partial<IApiItemJson>): void;

  getEmbeddedExcerpt(name: ExcerptName): Excerpt;

  /**
   * If the API item has certain important modifier tags such as `@sealed`, `@virtual`, or `@override`,
   * this prepends them as a doc comment above the excerpt.
   */
  getExcerptWithModifiers(): string;
}

/** @public */
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
        embeddedExcerptsByName: { }
      };

      for (const key of Object.getOwnPropertyNames(jsonObject.embeddedExcerptsByName)) {
        const range: IExcerptTokenRange = jsonObject.embeddedExcerptsByName[key];
        declarationExcerpt.embeddedExcerptsByName[key] = range;
      }

      options.declarationExcerpt = declarationExcerpt;
    }

    // tslint:disable-next-line:no-any
    constructor(...args: any[]) {
      super(...args);

      const options: IApiDeclarationMixinOptions = args[0];
      this[_excerptTokens] = [...options.declarationExcerpt.excerptTokens];

      this[_embeddedExcerptsByName] = new Map<ExcerptName, Excerpt>();

      for (const key of Object.getOwnPropertyNames(options.declarationExcerpt.embeddedExcerptsByName)) {
        const excerptRange: IExcerptTokenRange = options.declarationExcerpt.embeddedExcerptsByName[key];
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

      jsonObject.embeddedExcerptsByName = { };
      for (const [key, value] of this.embeddedExcerptsByName) {
        jsonObject.embeddedExcerptsByName[key] = value.tokenRange;
      }
    }
  }

  return MixedClass;
}

/** @public */
export namespace ApiDeclarationMixin {
  export function isBaseClassOf(apiItem: ApiItem): apiItem is ApiDeclarationMixin {
    return apiItem.hasOwnProperty(_excerpt);
  }
}
