import { warning } from 'figures';

export type CustomizableErrorMessage = {
  [K: string]: string;
};

export const CUSTOMIZABLE_MESSAGES_IDS = {
  PNPM_MISMATCH_DEPENDENCY: 'PNPM_MISMATCH_DEPENDENCY',
  ANOTHER_ERROR_ID: 'ANOTHER_ERROR_ID'
};

export type MessageMap = {
  [K: string]: string;
};

class Logger {
  private messageMap: MessageMap;

  constructor(userCustomizedMessages: MessageMap) {
    this.messageMap = userCustomizedMessages;
  }

  private _log(type: 'warn' | 'error' | 'info', messageID: string, defaultMessage?: string) {
    let logFn;
    switch (type) {
      case 'warn':
        logFn = console.warn;
      case 'error':
        logFn = console.error;
      case 'info':
        logFn = console.info;
    }

    defaultMessage ?? logFn(defaultMessage);

    if (this.messageMap[messageID]) {
      logFn(this.messageMap[warning]);
    }
  }

  /**
   *
   * @param warningID
   * @param defaultMessage If the user didn't define the error message for the warningID in the `custom-error-message.json`, rush will print the defaultMessage.
   */
  public warn(warningID: string, defaultMessage?: string) {
    this._log('warn', warningID, defaultMessage);
  }

  /**
   *
   * @param errorID
   * @param defaultMessage If the user didn't define the error message for the errorID in the `custom-error-message.json`, rush will print the defaultMessage.
   */
  public error(errorID: string, defaultMessage?: string) {
    this._log('error', errorID, defaultMessage);
  }

  /**
   *
   * @param infoID
   * @param defaultMessage If the user didn't define the error message for the infoID in the `custom-error-message.json`, rush will print the defaultMessage.
   */
  public info(infoID: string, defaultMessage?: string) {
    this._log('info', infoID, defaultMessage);
  }
}

export const logger = new Logger({
  PNPM_MISMATCH_DEPENDENCY: 'This means that ___ . Please refer to this doc: https:fakelink.com for fixing it'
});
