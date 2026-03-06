// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { store } from '../store/index.ts';
import { type IProjectState, initializeProjectInfo, onChangeProject } from '../store/slices/project.ts';

export type IFromExtensionMessage = IFromExtensionMessageInitialize;

interface IFromExtensionMessageInitialize {
  command: string;
  state: IProjectState;
}

export const fromExtensionListener: (event: MessageEvent<IFromExtensionMessage>) => void = (
  event: MessageEvent<IFromExtensionMessage>
) => {
  const message: IFromExtensionMessage = event.data;
  // eslint-disable-next-line no-console
  console.log('message: ', message);
  switch (message.command) {
    case 'initialize': {
      store.dispatch(
        initializeProjectInfo({
          ...message.state
        })
      );
      break;
    }
    case 'updateProject': {
      store.dispatch(
        onChangeProject({
          ...message.state
        })
      );
      break;
    }
    default: {
      const _command: string = message.command;
      throw new Error(`Unknown command: ${_command}`);
    }
  }
};
