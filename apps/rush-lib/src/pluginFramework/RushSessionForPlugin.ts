import { ContributionPointManager } from './ContributionPoint';
import { IRushPluginManifest } from './PluginLoader/PluginLoaderBase';
import { RushLifecycleHooks } from './RushLifeCycle';
import { RushSession } from './RushSession';

export interface IRushSessionForPlugin extends RushSession {
  validateContributesAPIUsage: () => void;
}

/**
 * @beta
 *
 * When a plugin specifies contribution points, it means the plugin must call
 * all of the according APIs in rushSession once synchronously. This
 * ensure the semantics of the contribution points which the plugin specifies.
 */
export const getRushSessionForPlugin = (
  internalRushSession: RushSession,
  pluginManifest: IRushPluginManifest
): RushSession | IRushSessionForPlugin => {
  const contributionPointManager: ContributionPointManager | undefined = ContributionPointManager.create(
    internalRushSession,
    pluginManifest
  );

  if (!contributionPointManager) {
    return internalRushSession;
  }

  const hooksForPlugin: RushLifecycleHooks = new RushLifecycleHooks();

  // Plugin specified contribution point should be passed a proxy rush session.
  const rushSessionForPlugin: IRushSessionForPlugin = new Proxy(internalRushSession, {
    get(...args: Parameters<Required<ProxyHandler<IRushSessionForPlugin>>['get']>) {
      const [, prop] = args;
      if (prop === 'hooks') {
        return hooksForPlugin;
      }
      if (prop in contributionPointManager) {
        return Reflect.get(contributionPointManager, prop);
      }
      return Reflect.get(...args);
    },
    has: (...args: Parameters<Required<ProxyHandler<IRushSessionForPlugin>>['has']>) => {
      const [target, prop] = args;
      if ('validateContributesAPIUsage' === prop) {
        return true;
      }
      return prop in target;
    }
  }) as IRushSessionForPlugin;
  return rushSessionForPlugin;
};
