// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.s

import { ApiItem, ApiItem_parent, IApiItemJson, IApiItemConstructor, IApiItemOptions } from '../items/ApiItem';
import { Parameter } from '../model/Parameter';

/**
 * Constructor options for {@link (ApiParameterListMixin:interface)}.
 * @public
 */
export interface IApiParameterListMixinOptions extends IApiItemOptions {
  overloadIndex: number;
  parameters?: Parameter[];
}

export interface IApiParameterListJson extends IApiItemJson {
  overloadIndex: number;
  parameters: IApiItemJson[];
}

const _overloadIndex: unique symbol = Symbol('ApiParameterListMixin._overloadIndex');
const _parameters: unique symbol = Symbol('ApiParameterListMixin._parameters');

/**
 * The mixin base class for API items that can have function parameters (but not necessarily a return value).
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
export interface ApiParameterListMixin extends ApiItem {
  /**
   * When a function has multiple overloaded declarations, this zero-based integer index can be used to unqiuely
   * identify them.
   *
   * @remarks
   *
   * Consider this overloaded declaration:
   *
   * ```ts
   * export namespace Versioning {
   *   export function addVersions(x: number, y: number): number;
   *   export function addVersions(x: string, y: string): string;
   *   export function addVersions(x: number|string, y: number|string): number|string {
   *     // . . .
   *   }
   * }
   * ```
   *
   * In the above example, there are two overloaded declarations.  The overload using numbers will have
   * `overloadIndex = 0`.  The overload using strings will have `overloadIndex = 1`.  The third declaration that
   * accepts all possible inputs is considered part of the implementation, and is not processed by API Extractor.
   */
  readonly overloadIndex: number;

  /**
   * The function parameters.
   */
  readonly parameters: ReadonlyArray<Parameter>;

  /**
   * Appends a parameter to the `ApiParameterListMixin.parameters` collection.
   */
  addParameter(parameter: Parameter): void;

  serializeInto(jsonObject: Partial<IApiItemJson>): void;
}

/**
 * Mixin function for {@link (ApiParameterListMixin:interface)}.
 *
 * @param baseClass - The base class to be extended
 * @returns A child class that extends baseClass, adding the {@link (ApiParameterListMixin:interface)} functionality.
 *
 * @public
 */
export function ApiParameterListMixin<TBaseClass extends IApiItemConstructor>(baseClass: TBaseClass):
  TBaseClass & (new (...args: any[]) => ApiParameterListMixin) { // tslint:disable-line:no-any

  abstract class MixedClass extends baseClass implements ApiParameterListMixin {
    public readonly [_overloadIndex]: number;
    public readonly [_parameters]: Parameter[];

    /** @override */
    public static onDeserializeInto(options: Partial<IApiParameterListMixinOptions>,
      jsonObject: IApiParameterListJson): void {

      baseClass.onDeserializeInto(options, jsonObject);

      options.overloadIndex = jsonObject.overloadIndex;
      options.parameters = [];

      for (const parameterObject of jsonObject.parameters) {
        options.parameters.push(ApiItem.deserialize(parameterObject) as Parameter);
      }
    }

    // tslint:disable-next-line:no-any
    constructor(...args: any[]) {
      super(...args);

      const options: IApiParameterListMixinOptions = args[0];
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

    public get parameters(): ReadonlyArray<Parameter> {
      return this[_parameters];
    }

    public addParameter(parameter: Parameter): void {
      const existingParent: ApiItem | undefined = parameter[ApiItem_parent];
      if (existingParent !== undefined) {
        throw new Error(`This Parameter has already been added to another function:`
          + ` "${existingParent.displayName}"`);
      }

      this[_parameters].push(parameter);

      parameter[ApiItem_parent] = this;
    }

    /** @override */
    public serializeInto(jsonObject: Partial<IApiParameterListJson>): void {
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

/**
 * Static members for {@link (ApiParameterListMixin:interface)}.
 * @public
 */
export namespace ApiParameterListMixin {
  /**
   * A type guard that tests whether the specified `ApiItem` subclass extends the `ApiParameterListMixin` mixin.
   *
   * @remarks
   *
   * The JavaScript `instanceof` operator cannot be used to test for mixin inheritance, because each invocation of
   * the mixin function produces a different subclass.  (This could be mitigated by `Symbol.hasInstance`, however
   * the TypeScript type system cannot invoke a runtime test.)
   */
  export function isBaseClassOf(apiItem: ApiItem): apiItem is ApiParameterListMixin {
    return apiItem.hasOwnProperty(_parameters);
  }
}
