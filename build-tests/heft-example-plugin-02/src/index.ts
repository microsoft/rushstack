import { IHeftPlugin, HeftSession, HeftConfiguration } from '@rushstack/heft';
import { PluginNames as OtherPluginNames, IExamplePlugin01Accessor } from 'heft-example-plugin-01';

const enum PluginNames {
  ExamplePlugin02 = 'example-plugin-02'
}

export class ExamplePlugin02 implements IHeftPlugin {
  public pluginName: string = PluginNames.ExamplePlugin02;

  public apply(heftSession: HeftSession, heftConfiguration: HeftConfiguration): void {
    heftSession.requestAccessToPluginByName(
      OtherPluginNames.ExamplePlugin01,
      (accessor: IExamplePlugin01Accessor) => {
        accessor.exampleHook.tap(PluginNames.ExamplePlugin02, () => {
          heftConfiguration.globalTerminal.writeLine(
            `!!!!!!!!!!!!!!! Plugin "${OtherPluginNames.ExamplePlugin01}" hook called !!!!!!!!!!!!!!! `
          );
        });
      }
    );
  }
}

export default new ExamplePlugin02();
