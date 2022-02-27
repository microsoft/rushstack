import { RushConstants } from '../logic/RushConstants';
import { ContributionPoint, IContributeAPIForBuildCacheProvider } from './ContributionPoint';
import { IRushPluginManifest } from './PluginLoader/PluginLoaderBase';
import { RushLifecycleHooks } from './RushLifeCycle';
import { RushSession } from './RushSession';

interface IContributeCallInfo {
  expectedFunctionNameSet: Set<string>;
  calledFunctionNameSet: Set<string>;
}

/**
 * @beta
 *
 * When a plugin specifies contribution points, it means the plugin must call
 * all of the according APIs in rushSession once before initialized. This
 * ensure the semantics of the contribution points which the plugin specifies.
 */
export class RushSessionForPlugin extends RushSession {
  private _isOutOfScope: boolean = false;
  private _contributeInfo: Map<ContributionPoint, IContributeCallInfo> = new Map<
    ContributionPoint,
    IContributeCallInfo
  >();
  private _pluginManifest: IRushPluginManifest;
  public constructor(internalRushSession: RushSession, pluginManifest: IRushPluginManifest) {
    super(internalRushSession.options);

    // sync internal variables with internalRushSession
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (this as any)._cloudBuildCacheProviderFactories =
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (internalRushSession as any)._cloudBuildCacheProviderFactories;

    this._pluginManifest = pluginManifest;

    if (!Array.isArray(pluginManifest.contributes)) {
      return;
    }

    const hookForPlugin: RushLifecycleHooks = new RushLifecycleHooks();

    // Plugins specified contribution point should be initialize lazily.
    this.hooks.initialize = hookForPlugin.initialize;

    for (const contribute of pluginManifest.contributes) {
      switch (contribute) {
        case ContributionPoint.buildCacheProvider: {
          const contributeCallInfo: IContributeCallInfo = {
            expectedFunctionNameSet: new Set<string>(),
            calledFunctionNameSet: new Set<string>()
          };
          this._contributeInfo.set(contribute, contributeCallInfo);
          this.getContributeAPIForBuildCacheProvider = () => {
            const api: IContributeAPIForBuildCacheProvider = super.getContributeAPIForBuildCacheProvider();
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return Object.keys(api).reduce((acc: any, key: string) => {
              contributeCallInfo.expectedFunctionNameSet.add(key);
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              acc[key] = (...args: any): any => {
                if (this._isOutOfScope) {
                  throw new Error(
                    `The plugin ${pluginManifest.pluginName} has already initialized. You need call ${key} inside apply function once.`
                  );
                }
                contributeCallInfo.calledFunctionNameSet.add(key);
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (api as any)[key](...args);
              };
              return acc;
            }, {});
          };
          break;
        }
        default: {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const shouldNeverContribute: never = contribute;
        }
      }
    }
  }

  public initialized(): void {
    this._isOutOfScope = true;
    const contributeToUnCalledFunctionNameSet: Map<ContributionPoint, Set<string>> = new Map<
      ContributionPoint,
      Set<string>
    >();
    for (const [contribute, contributeCallInfo] of this._contributeInfo.entries()) {
      const functionNameSet: Set<string> = new Set<string>();
      for (const functionName of contributeCallInfo.expectedFunctionNameSet) {
        if (!contributeCallInfo.calledFunctionNameSet.has(functionName)) {
          functionNameSet.add(functionName);
        }
      }
      if (functionNameSet.size) {
        contributeToUnCalledFunctionNameSet.set(contribute, functionNameSet);
      }
    }
    let errorMessage: string | undefined;
    if (contributeToUnCalledFunctionNameSet.size) {
      errorMessage = `Not all of the contribution points related API has been called:`;
      for (const [contribute, unCalledFunctionNameSet] of contributeToUnCalledFunctionNameSet.entries()) {
        errorMessage += `\nContributes ${contribute}: ${Array.from(unCalledFunctionNameSet).join(
          ', '
        )} not called`;
      }
      throw new Error(errorMessage);
    }
  }

  public getContributeAPIForBuildCacheProvider(): IContributeAPIForBuildCacheProvider {
    const { pluginName } = this._pluginManifest;
    throw new Error(
      `getContributeAPIForBuildCacheProvider is not allowed to be called by ${pluginName}. The plugin must specify contributes ${ContributionPoint.buildCacheProvider} in ${RushConstants.rushPluginManifestFilename}.`
    );
  }
}
