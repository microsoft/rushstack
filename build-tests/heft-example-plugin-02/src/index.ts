import type { IHeftTaskSession, HeftConfiguration, IHeftTaskPlugin } from '@rushstack/heft';
import type { PLUGIN_NAME as ExamplePlugin01Name, IExamplePlugin01Accessor } from 'heft-example-plugin-01';

export const PLUGIN_NAME: 'example-plugin-02' = 'example-plugin-02';
const EXAMPLE_PLUGIN_01_NAME: typeof ExamplePlugin01Name = 'example-plugin-01';

export default class ExamplePlugin02 implements IHeftTaskPlugin {
  public apply(taskSession: IHeftTaskSession, heftConfiguration: HeftConfiguration): void {
    taskSession.requestAccessToPluginByName(
      'heft-example-plugin-01',
      EXAMPLE_PLUGIN_01_NAME,
      (accessor: IExamplePlugin01Accessor) => {
        accessor.exampleHook.tap(PLUGIN_NAME, () => {
          taskSession.logger.terminal.writeLine(
            `!!!!!!!!!!!!!!! Plugin "${EXAMPLE_PLUGIN_01_NAME}" hook called !!!!!!!!!!!!!!! `
          );
        });
      }
    );
  }
}
