// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { IDocElement } from '../markup/OldMarkup';

/**
 * Represents a reference to an ApiItem.
 * @alpha
 */
export interface IApiItemReference {
  /**
   * The name of the NPM scope, or an empty string if there is no scope.
   * @remarks
   * Example: "@microsoft"
   */
  scopeName: string;

  /**
   * The name of the NPM package that the API item belongs to, without the NPM scope.
   * @remarks
   * Example: "sample-package"
   */
  packageName: string;

  /**
   * The name of an exported API item, or an empty string.
   * @remarks
   * The name does not include any generic parameters or other punctuation.
   * Example: "SampleClass"
   */
  exportName: string;

  /**
   * The name of a member of the exported item, or an empty string.
   * @remarks
   * The name does not include any parameters or punctuation.
   * Example: "toString"
   */
  memberName: string;
}

/**
 * Whether the function is public, private, or protected.
 * @alpha
 */
export type ApiAccessModifier = 'public' | 'private' | 'protected' | '';

/**
 * Parameter Doc item.
 * @alpha
 */
export interface IApiParameter {
  /**
   * the parameter name
   */
  name: string;

  /**
   * describes the parameter
   */
  description: IDocElement[];

  /**
   * Whether the parameter is optional
   */
  isOptional: boolean;

  /**
   * Whether the parameter has the '...' spread suffix
   */
  isSpread: boolean;

  /**
   * The data type of the parameter
   */
  type: string;
}

/**
 * An ordered map of items, indexed by the symbol name.
 * @alpha
 */
export interface IApiNameMap<T> {
  /**
   * For a given name, returns the object with that name.
   */
  [name: string]: T;
}

/**
 * Return value of a method or function.
 * @alpha
 */
export interface IApiReturnValue {
  /**
   * The data type returned by the function
   */
  type: string;

  /**
   * Describes the return value
   */
  description: IDocElement[];
}

/**
 * DocItems are the typescript adaption of the json schemas
 * defined in API-json-schema.json. IDocElement is a component
 * for IDocItems because they represent formated rich text.
 *
 * This is the base class for other DocItem types.
 * @alpha
 */
export interface IApiBaseDefinition {
  /**
   * kind of DocItem. Ex: 'class', 'Enum', 'Function', etc.
   */
  kind: string;
  isBeta: boolean;
  summary: IDocElement[];
  remarks?: IDocElement[];
  deprecatedMessage?: IDocElement[];
}

/**
 * A property of a TypeScript class or interface
 * @alpha
 */
export interface IApiProperty extends IApiBaseDefinition {

  /**
   * {@inheritdoc IApiBaseDefinition.kind}
   */
  kind: 'property';

  /**
   * a text summary of the method definition
   */
  signature: string;

  /**
   * For an interface member, whether it is optional
   */
  isOptional: boolean;

  /**
   * Whether the property is read-only
   */
  isReadOnly: boolean;

  /**
   * For a class member, whether it is static
   */
  isStatic: boolean;

  /**
   * The data type of this property
   */
  type: string;
}

/**
 * A member function of a typescript class or interface.
 * @alpha
 */
export interface IApiMethod extends IApiBaseDefinition {
  /**
   * {@inheritdoc IApiBaseDefinition.kind}
   */
  kind: 'method';

  /**
   * a text summary of the method definition
   */
  signature: string;

  /**
   * the access modifier of the method
   */
  accessModifier: ApiAccessModifier;

  /**
   * for an interface member, whether it is optional
   */
  isOptional: boolean;

  /**
   * for a class member, whether it is static
   */
  isStatic: boolean;

  /**
   * a mapping of parameter name to IApiParameter
   */

  parameters: IApiNameMap<IApiParameter>;

  /**
   * describes the return value of the method
   */
  returnValue: IApiReturnValue;
}

/**
 * A Typescript function.
 * @alpha
 */
export interface IApiFunction extends IApiBaseDefinition {
  /**
   * {@inheritdoc IApiBaseDefinition.kind}
   */
  kind: 'function';

  /**
   * a text summary of the method definition
   */
  signature: string;

  /**
   * parameters of the function
   */
  parameters: IApiNameMap<IApiParameter>;

  /**
   * a description of the return value
   */
  returnValue: IApiReturnValue;
}

/**
 * A Typescript function.
 * @alpha
 */
export interface IApiConstructor extends IApiBaseDefinition {
  /**
   * {@inheritdoc IApiBaseDefinition.kind}
   */
  kind: 'constructor';

  /**
   * a text summary of the method definition
   */
  signature: string;

  /**
   * parameters of the function
   */
  parameters: IApiNameMap<IApiParameter>;
}

/**
 * IApiClass represetns an exported class.
 * @alpha
 */
export interface IApiClass extends IApiBaseDefinition {
  /**
   * {@inheritdoc IApiBaseDefinition.kind}
   */
  kind: 'class';
  /**
   * Can be a combination of methods and/or properties
   */
  members: IApiNameMap<ApiMember>;

  /**
   * Interfaces implemented by this class
   */
  implements?: string;

  /**
   * The base class for this class
   */
  extends?: string;

  /**
   * Generic type parameters for this class
   */
  typeParameters?: string[];
}

/**
 * IApiEnum represents an exported enum.
 * @alpha
 */
export interface IApiEnum extends IApiBaseDefinition {
  /**
   * {@inheritdoc IApiBaseDefinition.kind}
   */
  kind: 'enum';

  values: IApiEnumMember[];
}

/**
 * A member of an IApiEnum.
 *
 * @alpha
 */
export interface IApiEnumMember extends IApiBaseDefinition {
  /**
   * {@inheritdoc IApiBaseDefinition.kind}
   */
  kind: 'enum value';

  value: string;
}

/**
 * IApiInterface represents an exported interface.
 * @alpha
 */
export interface IApiInterface extends IApiBaseDefinition {
  /**
   * {@inheritdoc IApiBaseDefinition.kind}
   */
  kind: 'interface';
  /**
   * A mapping from the name of a member API to its ApiMember
   */
  members: IApiNameMap<ApiMember>;

  /**
   * Interfaces implemented by this interface
   */
  implements?: string;

  /**
   * The base interface for this interface
   */
  extends?: string;

  /**
   * Generic type parameters for this interface
   */
  typeParameters?: string[];
}

/**
 * IApiPackage is an object contaning the exported
 * definions of this API package. The exports can include:
 * classes, interfaces, enums, functions.
 * @alpha
 */
export interface IApiPackage {
   /**
   * {@inheritdoc IApiBaseDefinition.kind}
   */
  kind: 'package';

  /**
   * The name of the NPM package, including the optional scope.
   * @remarks
   * Example: "@microsoft/example-package"
   */
  name: string;

  /**
   * IDocItems of exported API items
   */
  exports: IApiNameMap<ApiItem>;

  /**
   * The following are needed so that this interface and can share
   * common properties with others that extend IApiBaseDefinition. The IApiPackage
   * does not extend the IApiBaseDefinition because a summary is not required for
   * a package.
   */
  isBeta?: boolean;
  summary?: IDocElement[];
  remarks?: IDocElement[];
  deprecatedMessage?: IDocElement[];
}

/**
 * A member of a class.
 * @alpha
 */
export type ApiMember = IApiProperty | IApiMethod;

/**
 * @alpha
 */
export type ApiItem = IApiProperty | ApiMember | IApiFunction | IApiConstructor |
   IApiClass | IApiEnum | IApiEnumMember | IApiInterface | IApiPackage;

/**
 * Describes a return type and description of the return type
 * that is given in documentation comments.
 *
 * @alpha
 */
export interface IApiReturnValue {
  type: string;
  description: IDocElement[];
}
