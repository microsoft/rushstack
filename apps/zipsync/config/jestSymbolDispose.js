// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

const disposeSymbol = Symbol('Symbol.dispose');
const asyncDisposeSymbol = Symbol('Symbol.asyncDispose');

Symbol.asyncDispose ??= asyncDisposeSymbol;
Symbol.dispose ??= disposeSymbol;
