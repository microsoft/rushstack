declare let build: {
    rootDir: any;
    gulp: any;
    preDependencies: {};
    dependencies: {};
    postDependencies: {};
    config: {};
    allTasks: {};
    initializeTasks: (gulp: any, userOptions?: any, buildPath?: string) => void;
    task: (taskName: any, dependencies: any, callback: any) => void;
    _createGulpTask: (taskName: any, dependencies: any, callback: any) => any;
    doBefore: (parentTaskName: any, taskName: any) => void;
    doDuring: (parentTaskName: any, taskName: any) => void;
    doAfter: (parentTaskName: any, taskName: any) => void;
    log: (message: any) => void;
    logError: (errorMessage: any) => void;
    logVerbose: (message: any) => void;
};
export = build;
