export interface IBundleOptions {
  paths: {
    sourceMatch: string;
  };

  baseUrl: string;
  configPath?: string; // deprecated.
  config?: {
    paths?: { [key: string]: string },
    meta?: { [key: string]: {
      scriptLoad?: boolean;
    }}
  };

  entries: {
    entry: string;
    outputPath: string;
    configPath?: string;  // Deprecated?
    config?: {
      paths?: { [key: string]: string }
    },
    include?: string[];
    exclude?: string[];
    autoImport?: string[];
    isStandalone?: boolean;
  }[];

}

export default {
  config: {},
  paths: {
    sourceMatch: 'src/**/*'
  },
  baseUrl: '/',
  entries: []
};

