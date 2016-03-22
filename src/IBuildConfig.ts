export interface IBuildConfig {
  gulp?: any;
  rootPath?: string;
  libFolder?: string;
  libAMDFolder?: string;
  distFolder?: string;
  tempFolder?: string;
  properties?: { [ key: string]: any };

  onTaskStart?: (taskName: string) => void;
  onTaskEnd?: (taskName: string, durationMilliseconds: number, error?: any) => void;
}

export default IBuildConfig;
