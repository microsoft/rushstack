import { ApiItem } from '../items/ApiItem';

/**
 * Generic result object for finding API items used by different kinds of find operations.
 * @public
 */
export interface IFindApiItemsResult {
  /**
   * The API items that were found. Not guaranteed to be complete, see `maybeIncompleteResult`.
   */
  items: ApiItem[];

  /**
   * Diagnostic messages regarding the find operation.
   */
  messages: IFindApiItemsMessage[];

  /**
   * Indicates whether the result is potentially incomplete due to errors during the find operation.
   * If true, the `messages` explain the errors in more detail.
   */
  maybeIncompleteResult: boolean;
}

/**
 * This object is used for messages returned as part of `IFindApiItemsResult`.
 * @public
 */
export interface IFindApiItemsMessage {
  /**
   * Unique identifier for the message.
   */
  messageId: FindApiItemsMessageId;

  /**
   * Text description of the message.
   */
  text: string;
}

/**
 * Unique identifiers for messages returned as part of `IFindApiItemsResult`.
 * @public
 */
export enum FindApiItemsMessageId {
  /**
   * "Declaration resolution failed for ___. Error message: ___."
   */
  DeclarationResolutionFailed = 'declaration-resolution-failed',

  /**
   * "Unable to get the associated model of ___."
   */
  MissingApiModel = 'missing-api-model',

  /**
   * "Encountered unexpected excerpt tokens in ___. Excerpt: ___."
   */
  UnexpectedExcerptTokens = 'unexpected-excerpt-tokens',

  /**
   * Item ___ is of unsupported kind ___."
   */
  UnsupportedKind = 'unsupported-kind'
}
