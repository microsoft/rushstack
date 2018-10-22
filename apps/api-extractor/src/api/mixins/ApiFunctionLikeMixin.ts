// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.s

import { Constructor, Mixin } from './Mixin';
import { ApiItem, IApiItemJson } from '../model/ApiItem';

export interface IApiParameterOptions {
  name: string;
}

export class ApiParameter {
  public readonly name: string;

  public constructor(options: IApiParameterOptions) {
    this.name = options.name;
  }
}

export interface IApiParameterJson {
  name: string;
}

export interface IApiFunctionLikeOptions {
  overloadIndex: number;
}

export interface IApiFunctionLikeJson extends IApiItemJson {
  overloadIndex: number;
  parameters: IApiParameterJson[];
}

const _overloadIndex: unique symbol = Symbol('_overloadIndex');
const _parameters: unique symbol = Symbol('_parameters');

// tslint:disable-next-line:interface-name
export interface ApiFunctionLikeMixin {
  readonly overloadIndex: number;
  readonly parameters: ReadonlyArray<ApiParameter>;
  addParameter(parameter: ApiParameter): void;
  serializeInto(jsonObject: Partial<IApiItemJson>): void;
}

export function ApiFunctionLikeMixin<TBaseClass extends Constructor<ApiItem>>(baseClass: TBaseClass):
  Mixin<TBaseClass, ApiFunctionLikeMixin> {

  abstract class MixedClass extends baseClass implements ApiFunctionLikeMixin {
    public readonly [_overloadIndex]: number;
    public readonly [_parameters]: ApiParameter[];

    // tslint:disable-next-line:no-any
    constructor(...args: any[]) {
      super(...args);

      const options: IApiFunctionLikeOptions = args[0];
      this[_overloadIndex] = options.overloadIndex;

      this[_parameters] = [];
    }

    public get overloadIndex(): number {
      return this[_overloadIndex];
    }

    public get parameters(): ReadonlyArray<ApiParameter> {
      return this[_parameters];
    }

    public addParameter(parameter: ApiParameter): void {
      this[_parameters].push(parameter);
    }

    /** @override */
    public serializeInto(jsonObject: Partial<IApiFunctionLikeJson>): void {
      super.serializeInto(jsonObject);

      jsonObject.overloadIndex = this.overloadIndex;

      const parameterObjects: IApiParameterJson[] = [];
      for (const parameter of this.parameters) {
        parameterObjects.push({
          name: parameter.name
        });
      }

      jsonObject.parameters = parameterObjects;
    }
  }

  return MixedClass;
}

export interface IApiFunctionLike extends ApiFunctionLikeMixin, ApiItem {
}
