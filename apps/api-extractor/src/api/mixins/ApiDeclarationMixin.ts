// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.s

import { ApiItem, IApiItemJson, IApiItemConstructor, IApiItemOptions } from '../model/ApiItem';

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
}

/** @public */
export function ApiDeclarationMixin<TBaseClass extends IApiItemConstructor>(baseClass: TBaseClass):
  TBaseClass & (new (...args: any[]) => ApiDeclarationMixin) {

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

    /** @override */
    public serializeInto(jsonObject: Partial<IApiDeclarationMixinJson>): void {
      super.serializeInto(jsonObject);

      jsonObject.signature = this[_signature];
    }
  }

  return MixedClass;
}
