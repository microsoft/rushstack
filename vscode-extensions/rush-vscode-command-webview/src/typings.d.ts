import type { IRootState } from './store';
import type { Webview } from 'vscode';

declare global {
  // eslint-disable-next-line @typescript-eslint/naming-convention
  interface Window {
    __DATA__: IRootState;
    acquireVsCodeApi: () => Webview;
  }
}
