// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.s

import { ApiItem, ApiItem_parent, IApiItemJson, IApiItemConstructor, IApiItemOptions } from '../model/ApiItem';
import { ApiParameter } from '../model/ApiParameter';

/** @public */
export interface IApiFunctionLikeMixinOptions extends IApiItemOptions {
  overloadIndex: number;
  parameters?: ApiParameter[];
}

export interface IApiFunctionLikeJson extends IApiItemJson {
  overloadIndex: number;
  parameters: IApiItemJson[];
}

const _overloadIndex: unique symbol = Symbol('ApiFunctionLikeMixin._overloadIndex');
const _parameters: unique symbol = Symbol('ApiFunctionLikeMixin._parameters');

/** @public */
// tslint:disable-next-line:interface-name
export interface ApiFunctionLikeMixin extends ApiItem {
  readonly overloadIndex: number;
  readonly parameters: ReadonlyArray<ApiParameter>;
  addParameter(parameter: ApiParameter): void;
  serializeInto(jsonObject: Partial<IApiItemJson>): void;
}

/** @public */
export function ApiFunctionLikeMixin<TBaseClass extends IApiItemConstructor>(baseClass: TBaseClass):
  TBaseClass & (new (...args: any[]) => ApiFunctionLikeMixin) { // tslint:disable-line:no-any

  abstract class MixedClass extends baseClass implements ApiFunctionLikeMixin {
    public readonly [_overloadIndex]: number;
    public readonly [_parameters]: ApiParameter[];

    /** @override */
    public static onDeserializeInto(options: Partial<IApiFunctionLikeMixinOptions>,
      jsonObject: IApiFunctionLikeJson): void {

      baseClass.onDeserializeInto(options, jsonObject);

      options.overloadIndex = jsonObject.overloadIndex;
      options.parameters = [];

      for (const parameterObject of jsonObject.parameters) {
        options.parameters.push(ApiItem.deserialize(parameterObject) as ApiParameter);
      }
    }

    // tslint:disable-next-line:no-any
    constructor(...args: any[]) {
      super(...args);

      const options: IApiFunctionLikeMixinOptions = args[0];
      this[_overloadIndex] = options.overloadIndex;

      this[_parameters] = [];

      if (options.parameters) {
        for (const parameter of options.parameters) {
          this.addParameter(parameter);
        }
      }
    }

    public get overloadIndex(): number {
      return this[_overloadIndex];
    }

    public get parameters(): ReadonlyArray<ApiParameter> {
      return this[_parameters];
    }

    public addParameter(parameter: ApiParameter): void {
      const existingParent: ApiItem | undefined = parameter[ApiItem_parent];
      if (existingParent !== undefined) {
        throw new Error(`This ApiParameter has already been added to another function: "${existingParent.name}"`);
      }

      this[_parameters].push(parameter);

      parameter[ApiItem_parent] = this;
    }

    /** @override */
    public serializeInto(jsonObject: Partial<IApiFunctionLikeJson>): void {
      super.serializeInto(jsonObject);

      jsonObject.overloadIndex = this.overloadIndex;

      const parameterObjects: IApiItemJson[] = [];
      for (const parameter of this.parameters) {
        const parameterJsonObject: Partial<IApiItemJson> = {};
        parameter.serializeInto(parameterJsonObject);
        parameterObjects.push(parameterJsonObject as IApiItemJson);
      }

      jsonObject.parameters = parameterObjects;
    }
  }

  return MixedClass;
}

/** @public */
export namespace ApiFunctionLikeMixin {
  export function isBaseClassOf(apiItem: ApiItem): apiItem is ApiFunctionLikeMixin {
    return apiItem.hasOwnProperty(_parameters);
  }
}
