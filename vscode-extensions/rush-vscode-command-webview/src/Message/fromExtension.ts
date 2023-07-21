import { store } from '../store';
import { IProjectState, initializeProjectInfo } from '../store/slices/project';

export type IFromExtensionMessage = IFromExtensionMessageInitialize;

interface IFromExtensionMessageInitialize {
  command: 'initialize';
  state: IProjectState;
}

export const fromExtensionListener: (event: MessageEvent<IFromExtensionMessage>) => void = (
  event: MessageEvent<IFromExtensionMessage>
) => {
  const message: IFromExtensionMessage = event.data;
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
    default: {
      const _command: never = message.command;
      throw new Error(`Unknown command: ${_command}`);
    }
  }
};
