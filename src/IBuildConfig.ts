export interface IBuildConfig {
  gulp?: any;
  rootPath?: string;
  libFolder?: string;
  libAMDFolder?: string;
  distFolder?: string;
  tempFolder?: string;
  properties?: { [ key: string]: any };
}

export default IBuildConfig;
