import { ITask } from './ITask';
import { IBuildConfig } from './IBuildConfig';
export declare class GulpTask implements ITask {
    name: string;
    buildConfig: IBuildConfig;
    executeTask(gulp: any, completeCallback: (result?: any) => void): any;
    execute(config: IBuildConfig): Promise<any>;
    resolvePath(localPath: string): string;
    readConfig(localPath: string): string;
}
