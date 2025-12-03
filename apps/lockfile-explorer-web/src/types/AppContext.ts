// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IAppContext } from '../packlets/lfx-shared';

declare global {
  // eslint-disable-next-line @typescript-eslint/naming-convention
  interface Window {
    appContext: IAppContext;
  }
}
