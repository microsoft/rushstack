import { ConfigurationFile, IConfigurationFileOptions } from '@rushstack/heft-config-file';
import * as path from 'path';

export interface IBrowsersyncConfigurationJson {
  rootDir: string;
  port: number;
  watch: boolean;
}

let browsersyncConfigurationFileLoader: ConfigurationFile<IBrowsersyncConfigurationJson> | undefined;

/**
 * Returns the loader for the `config/browsersync.json` config file.
 */
export function configurationFileLoader(): ConfigurationFile<IBrowsersyncConfigurationJson> {
  if (!browsersyncConfigurationFileLoader) {
    const schemaPath: string = path.resolve(__dirname, '..', 'schemas', 'browsersync.schema.json');
    browsersyncConfigurationFileLoader = new ConfigurationFile<IBrowsersyncConfigurationJson>({
      projectRelativeFilePath: 'config/browsersync.json',
      jsonSchemaPath: schemaPath
    } as IConfigurationFileOptions<IBrowsersyncConfigurationJson>);
  }

  return browsersyncConfigurationFileLoader;
}
