// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * JSON Project Selector Expressions provide a canonical way to represent a
 * complex selection of projects. In the future, Rush may use such expressions
 * within configuration files to control certain behaviors. Users can create
 * and save these expressions in JSON files and select them on the command line.
 *
 * Any string-based project selector can also be expressed in JSON format.
 */
export type ExpressionJson = ISelectorJson | IFilterJson | IOperatorJson;

/**
 * A selector has a scope and a value. On the command-line this is represented as
 * a pair separated by a colon, for example, "tag:app" is a selector with scope `tag`
 * and value `app`. An individual project name, often specified on the command-line
 * with no scope, is represented by the scope `name`.
 *
 * In the future, Rush plugins may implement additional selector scopes. In JSON
 * form, it's possible certain scopes might even support additional field properties
 * to customize the selection.
 */
export interface ISelectorJson {
  scope: string;
  value: string;
}

/**
 * A filter is a type of transformer, which takes one set of projects and transforms
 * them into a new set. Classic Rush parameters like "--to" and "--from" are examples
 * of filters.
 *
 * In the future, Rush plugins may implement additional filter types.
 */
export interface IFilterJson {
  filter: string;
  arg: ExpressionJson;
}

/**
 * An operator is a built-in type of transformer that takes one or more sets of projects
 * and applies a logical operation to them.
 *
 * Today, the binary operators "and" and "or", and the unary operator "not", are built into
 * the expression selector. Other operators may be implemented in the future.
 */
export interface IOperatorJson {
  op: string;
  args: ExpressionJson[];
}
