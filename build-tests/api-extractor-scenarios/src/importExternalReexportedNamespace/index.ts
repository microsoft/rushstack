// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

// Regression test for https://github.com/microsoft/rushstack/issues/4963
//
// `Lib2ReexportedNamespace` is imported by name from an external package, but in that package it was
// produced by re-exporting an entire module as a namespace (`export * as Lib2ReexportedNamespace from
// './...'`).  Referencing a type within it used to crash API Extractor with an internal error, because
// following the alias chain lands on the module's source file symbol.
import { Lib2ReexportedNamespace } from 'api-extractor-lib2-test/lib/Lib2ReexportedNamespace';

/** @public */
export function useReexportedNamespace(): Lib2ReexportedNamespace.Lib2ReexportedInterface {
  return { prop: 1 };
}
