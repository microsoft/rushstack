export interface IYamlDumpOptions {
  lineWidth: number;
  noCompatMode: boolean;
  noRefs: boolean;
  sortKeys: boolean;
}

// This is based on PNPM's own configuration:
// https://github.com/pnpm/pnpm-shrinkwrap/blob/master/src/write.ts
export const PNPM_SHRINKWRAP_YAML_FORMAT: IYamlDumpOptions = {
  lineWidth: 1000,
  noCompatMode: true,
  noRefs: true,
  sortKeys: true
};
