import {
  RedisCobuildLockProvider,
  IRedisCobuildLockProviderOptions
} from '@rushstack/rush-redis-cobuild-plugin';
import { ConsoleTerminalProvider, ITerminal, Terminal } from '@rushstack/node-core-library';
import { OperationStatus, ICobuildContext } from '@microsoft/rush-lib';

const options: IRedisCobuildLockProviderOptions = {
  url: 'redis://localhost:6379',
  password: 'redis123'
};

const terminal: ITerminal = new Terminal(
  new ConsoleTerminalProvider({
    verboseEnabled: true,
    debugEnabled: true
  })
);

async function main(): Promise<void> {
  const lockProvider: RedisCobuildLockProvider = new RedisCobuildLockProvider(options);
  await lockProvider.connectAsync();
  const context: ICobuildContext = {
    terminal,
    contextId: 'test-context-id',
    version: 1,
    cacheId: 'test-cache-id'
  };
  await lockProvider.acquireLockAsync(context);
  await lockProvider.renewLockAsync(context);
  await lockProvider.setCompletedStateAsync(context, {
    status: OperationStatus.Success,
    cacheId: 'test-cache-id'
  });
  await lockProvider.releaseLockAsync(context);
  const completedState = await lockProvider.getCompletedStateAsync(context);
  console.log('Completed state: ', completedState);
  await lockProvider.disconnectAsync();
}
main().catch((err) => {
  console.error(err);
  process.exit(1);
});
