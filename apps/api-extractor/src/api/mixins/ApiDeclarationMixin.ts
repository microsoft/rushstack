// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.s

import { ApiItem, IApiItemJson, IApiItemConstructor, IApiItemOptions } from '../model/ApiItem';
import { ApiDocumentedItem } from '../model/ApiDocumentedItem';

/** @public */
export interface IApiDeclarationMixinOptions extends IApiItemOptions {
  signature: string;
}

export interface IApiDeclarationMixinJson extends IApiItemJson {
  signature: string;
}

const _signature: unique symbol = Symbol('ApiDeclarationMixin._signature');

/** @public */
// tslint:disable-next-line:interface-name
export interface ApiDeclarationMixin extends ApiItem {
  readonly signature: string;

  /** @override */
  serializeInto(jsonObject: Partial<IApiItemJson>): void;

  /**
   * If the API item has certain important modifier tags such as `@sealed`, `@virtual`, or `@override`,
   * this prepends them as a doc comment above the signature.
   */
  getSignatureWithModifiers(): string;
}

/** @public */
export function ApiDeclarationMixin<TBaseClass extends IApiItemConstructor>(baseClass: TBaseClass):
  TBaseClass & (new (...args: any[]) => ApiDeclarationMixin) { // tslint:disable-line:no-any

  abstract class MixedClass extends baseClass implements ApiDeclarationMixin {
    public [_signature]: string;

    /** @override */
    public static onDeserializeInto(options: Partial<IApiDeclarationMixinOptions>,
      jsonObject: IApiDeclarationMixinJson): void {

      baseClass.onDeserializeInto(options, jsonObject);

      options.signature = jsonObject.signature;
    }

    // tslint:disable-next-line:no-any
    constructor(...args: any[]) {
      super(...args);

      const options: IApiDeclarationMixinOptions = args[0];
      this[_signature] = options.signature;
    }

    public get signature(): string {
      return this[_signature];
    }

    public getSignatureWithModifiers(): string {
      const signature: string = this.signature;
      const modifierTags: string[] = [];

      if (signature.length > 0) {
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
              + signature;
          }
        }
      }

      return this.signature;
    }

    /** @override */
    public serializeInto(jsonObject: Partial<IApiDeclarationMixinJson>): void {
      super.serializeInto(jsonObject);

      jsonObject.signature = this[_signature];
    }
  }

  return MixedClass;
}

/** @public */
export namespace ApiDeclarationMixin {
  export function isBaseClassOf(apiItem: ApiItem): apiItem is ApiDeclarationMixin {
    return apiItem.hasOwnProperty(_signature);
  }
}
