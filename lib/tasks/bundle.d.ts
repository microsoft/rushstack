import { IBundleOptions } from '../options/bundle';
export default class BundleTasks {
    static registerTasks(build: any, options: IBundleOptions): void;
    private static _pruneMap(config);
    private static _getEntryLocation(bundle);
    private static _appendAutoImports(outputPath, bundle);
    private static _getDefaultBundleConfig(build, bundle);
    private static _getDefaultPaths(bundle);
    private static _getMetaExcludes(bundle);
    private static _createDependencyMap(build, bundle);
}
