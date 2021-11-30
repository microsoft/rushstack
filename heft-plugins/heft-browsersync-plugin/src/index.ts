import type { IHeftPlugin } from '@rushstack/heft';

import { BrowsersyncPlugin } from './BrowsersyncPlugin';

/**
 * @internal
 */
export default new BrowsersyncPlugin() as IHeftPlugin;
