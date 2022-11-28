import { store } from '../store';
import { initializeParameters, IParameterState } from '../store/slices/parameter';

export type IFromExtensionMessage = IFromExtensionMessageInitialize;

interface IFromExtensionMessageInitialize {
  command: 'initialize';
  state: IParameterState;
}

export const fromExtensionListener: (event: MessageEvent<IFromExtensionMessage>) => void = (
  event: MessageEvent<IFromExtensionMessage>
) => {
  const message: IFromExtensionMessage = event.data;
  switch (message.command) {
    case 'initialize': {
      store.dispatch(
        initializeParameters({
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
