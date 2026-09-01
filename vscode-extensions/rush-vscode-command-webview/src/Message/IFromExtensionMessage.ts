// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IProjectState } from '../store/slices/project';

// This message contract is intentionally kept in its own DOM-free module so it can be re-exported from
// the package barrel (index.ts) and consumed by the Node-based `rush-vscode-extension` project. The
// sibling `fromExtension.ts` declares `fromExtensionListener` using the browser's generic
// `MessageEvent<T>`, which is only available with the DOM lib. If this type lived there, importing it
// from a Node project (which resolves `MessageEvent` to the non-generic `@types/node` declaration)
// would fail to type-check with "Type 'MessageEvent' is not generic" (TS2315).
export type IFromExtensionMessage = IFromExtensionMessageInitialize;

interface IFromExtensionMessageInitialize {
  command: string;
  state: IProjectState;
}
