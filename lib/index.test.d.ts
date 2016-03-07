declare let describe: any, it: any;
declare let expect: any;
declare let serial: any, parallel: any;
declare function createTasks(name: string, count: number, executionCallback: (message: string) => void): any;
declare function createTask(name: string, executionCallback: (message: string) => void): {
    execute: () => Promise<{}>;
};
