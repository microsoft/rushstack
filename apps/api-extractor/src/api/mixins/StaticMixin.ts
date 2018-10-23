// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.s

import { Mixin } from './Mixin';
import { ApiItem, IApiItemJson, IApiItemConstructor, IApiItemOptions } from '../model/ApiItem';

export interface IApiStatic extends ApiStaticMixin, ApiItem {
}

export interface IApiStaticMixinOptions extends IApiItemOptions {
  isStatic: boolean;
}

export interface IApiStaticMixinJson extends IApiItemJson {
  isStatic: boolean;
}

const _isStatic: unique symbol = Symbol('_isStatic');

// tslint:disable-next-line:interface-name
export interface ApiStaticMixin {
  readonly isStatic: boolean;

  /** @override */
  serializeInto(jsonObject: Partial<IApiItemJson>): void;
}

export function ApiStaticMixin<TBaseClass extends IApiItemConstructor>(baseClass: TBaseClass):
  Mixin<TBaseClass, ApiStaticMixin> {

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
