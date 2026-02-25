// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { MessageType } from './MessageType.ts';

export class Logger {
  public log(messageType: MessageType, message: string): void {
    switch (messageType) {
      case MessageType.Info:
        console.log('[info]: ' + message);
        break;
      case MessageType.Warning:
        console.log('[warning]: ' + message);
        break;
      case MessageType.Error:
        console.log('[error]: ' + message);
        break;
    }
  }
}
