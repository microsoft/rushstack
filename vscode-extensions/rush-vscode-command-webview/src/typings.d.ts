// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IRootState } from './store';
import type { Webview } from 'vscode';

declare global {
  // eslint-disable-next-line @typescript-eslint/naming-convention
  interface Window {
    __DATA__: IRootState;
    acquireVsCodeApi: () => Webview;
  }
}
