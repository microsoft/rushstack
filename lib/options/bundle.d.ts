export interface IBundleOptions {
    paths: {
        sourceMatch: string;
    };
    baseUrl: string;
    configPath?: string;
    config?: {
        paths?: {
            [key: string]: string;
        };
        meta?: {
            [key: string]: {
                scriptLoad?: boolean;
            };
        };
    };
    entries: {
        entry: string;
        outputPath: string;
        configPath?: string;
        config?: {
            paths?: {
                [key: string]: string;
            };
        };
        include?: string[];
        exclude?: string[];
        autoImport?: string[];
        isStandalone?: boolean;
    }[];
}
declare var _default: {
    config: {};
    paths: {
        sourceMatch: string;
    };
    baseUrl: string;
    entries: undefined[];
};
export default _default;
