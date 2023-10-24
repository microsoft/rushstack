// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type webpack from 'webpack';

type BasicEvaluatedExpressionHook = ReturnType<
  typeof webpack.javascript.JavascriptParser.prototype.hooks.evaluateTypeof.for
>;
export type BasicEvaluatedExpression = ReturnType<BasicEvaluatedExpressionHook['call']>;

export type Range = number | [number, number];
export type DependencyTemplateContext = Parameters<
  typeof webpack.dependencies.NullDependency.Template.prototype.apply
>[2];
export type WebpackHash = Parameters<typeof webpack.dependencies.NullDependency.prototype.updateHash>[0];
export type UpdateHashContextDependency = Parameters<
  typeof webpack.dependencies.NullDependency.prototype.updateHash
>[1];
export type ConnectionState = ReturnType<
  typeof webpack.dependencies.NullDependency.prototype.getModuleEvaluationSideEffectsState
>;
export type ObjectSerializerContext = Parameters<
  typeof webpack.dependencies.NullDependency.prototype.serialize
>[0];
export type ObjectDeserializerContext = Parameters<
  typeof webpack.dependencies.NullDependency.prototype.deserialize
>[0];
export type ResolverWithOptions = ReturnType<
  Parameters<typeof webpack.Compiler.prototype.hooks.normalModuleFactory.call>[0]['getResolver']
>;
