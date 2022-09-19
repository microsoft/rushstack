import type { IHeftTaskSession, HeftConfiguration, IHeftTaskPlugin } from '@rushstack/heft';
import { PLUGIN_NAME as ExamplePlugin01Name, IExamplePlugin01Accessor } from 'heft-example-plugin-01';

export const PLUGIN_NAME: 'ExamplePlugin02' = 'ExamplePlugin02';

export default class ExamplePlugin02 implements IHeftTaskPlugin {
  public apply(taskSession: IHeftTaskSession, heftConfiguration: HeftConfiguration): void {
    taskSession.requestAccessToPluginByName(
      'heft-example-plugin-01',
      ExamplePlugin01Name,
      (accessor: IExamplePlugin01Accessor) => {
        accessor.exampleHook.tap(PLUGIN_NAME, () => {
          taskSession.logger.terminal.writeLine(
            `!!!!!!!!!!!!!!! Plugin "${ExamplePlugin01Name}" hook called !!!!!!!!!!!!!!! `
          );
        });
      }
    );
  }
}
