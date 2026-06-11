// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

// Re-exports an entire module as a namespace. When a downstream package imports this namespace by
// name and references a type within it, following the alias chain lands on this module's source file
// symbol. See https://github.com/microsoft/rushstack/issues/4963
export * as Lib2ReexportedNamespace from './Lib2ReexportedNamespaceTarget';
