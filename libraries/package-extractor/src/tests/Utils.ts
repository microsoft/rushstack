import path from 'path';
import { FileSystem, JsonFile } from '@rushstack/node-core-library';
interface RushProject {
  packageName: string;
  projectFolder: string;
}
export const loadRushProjectFromConfigurationFile = (filepath: string): RushProject[] => {
  if (!FileSystem.exists(filepath) || !filepath.endsWith('rush.json')) {
    throw new Error('File not exist or not correct');
  }

  const rushConfig: {
    projects: RushProject[];
  } = JsonFile.parseString(FileSystem.readFile(filepath).toString());
  return rushConfig.projects.map((p) => {
    return {
      ...p,
      projectRelativeFolder: p.projectFolder,
      projectFolder: path.resolve(path.dirname(filepath), p.projectFolder)
    };
  });
};
