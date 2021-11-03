import { ConfigurationFile, IConfigurationFileOptions } from '@rushstack/heft-config-file';
import * as path from 'path';

export interface IWorkboxConfigurationJson {
  swSrc: string;
  swDest: string;
  modifyURLPrefix: Record<string, string>;
  globDirectory: string;
  globPatterns: string[];
  globIgnores: string[];
}

let workboxConfigurationFileLoader: ConfigurationFile<IWorkboxConfigurationJson> | undefined;

/**
 * Returns the loader for the `config/workbox.json` config file.
 */
export function configurationFileLoader(): ConfigurationFile<IWorkboxConfigurationJson> {
  if (!workboxConfigurationFileLoader) {
    const schemaPath: string = path.resolve(__dirname, '..', 'schemas', 'workbox.schema.json');
    workboxConfigurationFileLoader = new ConfigurationFile<IWorkboxConfigurationJson>({
      projectRelativeFilePath: 'config/workbox.json',
      jsonSchemaPath: schemaPath
    } as IConfigurationFileOptions<IWorkboxConfigurationJson>);
  }

  return workboxConfigurationFileLoader;
}
