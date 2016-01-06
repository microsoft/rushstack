export interface IBuildOptions {
    paths: {
        sourceMatch: string[];
        lessMatch: string[];
        sassMatch: string[];
        htmlMatch: string[];
        staticsMatch: string[];
        libFolder: string;
    };
    copyTo: {
        [key: string]: string[];
    };
    isLintingEnabled: boolean;
    lintConfig?: any;
}
declare var _default: {
    paths: {
        sourceMatch: string[];
        lessMatch: string[];
        sassMatch: string[];
        htmlMatch: string[];
        staticsMatch: string[];
        libFolder: string;
    };
    copyTo: {};
    isLintingEnabled: boolean;
    lintConfig: any;
};
export default _default;
