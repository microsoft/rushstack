import { ConfigurationFile } from '@rushstack/heft-config-file';
import * as path from 'path';

export interface IBrowsersyncConfigurationJson {
  serveRoot: string;
  port: number;
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
    });
  }

  return browsersyncConfigurationFileLoader;
}
