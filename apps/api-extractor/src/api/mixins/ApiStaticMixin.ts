// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.s

import { ApiItem, IApiItemJson, IApiItemConstructor, IApiItemOptions } from '../model/ApiItem';

/** @public */
export interface IApiStaticMixinOptions extends IApiItemOptions {
  isStatic: boolean;
}

export interface IApiStaticMixinJson extends IApiItemJson {
  isStatic: boolean;
}

const _isStatic: unique symbol = Symbol('ApiStaticMixin._isStatic');

/** @public */
// tslint:disable-next-line:interface-name
export interface ApiStaticMixin extends ApiItem {
  readonly isStatic: boolean;

  /** @override */
  serializeInto(jsonObject: Partial<IApiItemJson>): void;
}

/** @public */
export function ApiStaticMixin<TBaseClass extends IApiItemConstructor>(baseClass: TBaseClass):
  TBaseClass & (new (...args: any[]) => ApiStaticMixin) { // tslint:disable-line:no-any

  abstract class MixedClass extends baseClass implements ApiStaticMixin {
    public [_isStatic]: boolean;

    /** @override */
    public static onDeserializeInto(options: Partial<IApiStaticMixinOptions>, jsonObject: IApiStaticMixinJson): void {
      baseClass.onDeserializeInto(options, jsonObject);

      options.isStatic = jsonObject.isStatic;
    }

    // tslint:disable-next-line:no-any
    constructor(...args: any[]) {
      super(...args);

      const options: IApiStaticMixinOptions = args[0];
      this[_isStatic] = options.isStatic;
    }

    public get isStatic(): boolean {
      return this[_isStatic];
    }

    /** @override */
    public serializeInto(jsonObject: Partial<IApiStaticMixinJson>): void {
      super.serializeInto(jsonObject);

      jsonObject.isStatic = this.isStatic;
    }
  }

  return MixedClass;
}

/** @public */
export namespace ApiStaticMixin {
  export function isBaseClassOf(apiItem: ApiItem): apiItem is ApiStaticMixin {
    return apiItem.hasOwnProperty(_isStatic);
  }
}
