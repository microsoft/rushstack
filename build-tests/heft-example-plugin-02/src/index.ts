import type { IHeftTaskSession, HeftConfiguration, IHeftTaskPlugin } from '@rushstack/heft';
import { PluginNames as OtherPluginNames, IExamplePlugin01Accessor } from 'heft-example-plugin-01';

const enum PluginNames {
  ExamplePlugin02 = 'examplePlugin02'
}

export default class ExamplePlugin02 implements IHeftTaskPlugin {
  public pluginName: string = PluginNames.ExamplePlugin02;

  public apply(taskSession: IHeftTaskSession, heftConfiguration: HeftConfiguration): void {
    taskSession.requestAccessToPluginByName(
      'heft-example-plugin-01',
      OtherPluginNames.ExamplePlugin01,
      (accessor: IExamplePlugin01Accessor) => {
        accessor.exampleHook.tap(PluginNames.ExamplePlugin02, () => {
          taskSession.logger.terminal.writeLine(
            `!!!!!!!!!!!!!!! Plugin "${OtherPluginNames.ExamplePlugin01}" hook called !!!!!!!!!!!!!!! `
          );
        });
      }
    );
  }
}
