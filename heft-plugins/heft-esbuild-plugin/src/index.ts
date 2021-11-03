import type { IHeftPlugin } from '@rushstack/heft';

import { EsbuildPlugin } from './EsbuildPlugin';

/**
 * @internal
 */
export default new EsbuildPlugin() as IHeftPlugin;
