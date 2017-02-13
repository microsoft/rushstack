import ApiItem, { ApiItemKind } from './definitions/ApiItem';
import ApiItemContainer from './definitions/ApiItemContainer';
import { ApiTag } from './definitions/ApiDocumentation';
import { IDocElement, IParam } from './IDocElement';
import { IDocItem, IDocFunction, IDocMember } from './IDocItem';

/**
 * A class to abstract away the difference between an item from our public API that could be 
 * represented by either an ApiItem or an IDocItem that is retrieved from a JSON file.
 */
export default class ResolvedApiItem {
  public kind: ApiItemKind;
  public summary: IDocElement[];
  public remarks: IDocElement[];
  public deprecatedMessage: IDocElement[];
  public apiTag: ApiTag;
  public params: {[name: string]: IParam};
  public returnsMessage: IDocElement[];
  public members: { [name: string]: ApiItem | IDocMember};

  /**
   * 
   */
  public static createFromApiItem(apiItem: ApiItem): ResolvedApiItem {
    const canResolveRefs: boolean = apiItem.canResolveReferences();
    if (!canResolveRefs) {
      return undefined;
    }

    const members: { [name: string]: ApiItem} = {};
    if (apiItem instanceof ApiItemContainer) {
      apiItem.memberItems.forEach(value => {
        members[value.name] = value;
      });
    }
    return new ResolvedApiItem(
      apiItem.kind,
      apiItem.documentation.summary,
      apiItem.documentation.remarks,
      apiItem.documentation.deprecatedMessage,
      apiItem.documentation.apiTag,
      apiItem.documentation.parameters,
      apiItem.documentation.returnsMessage,
      members
    );
  }

  /**
   * 
   */
  public static createFromJson(docItem: IDocItem): ResolvedApiItem {
    let parameters: {[name: string]: IParam} = undefined;
    let returnsMessage: IDocElement[] = undefined;
    let members: { [name: string]: IDocMember} = undefined;
    switch (docItem.kind) {
      case 'IDocFunction':
        parameters = docItem.parameters;
        returnsMessage = docItem.returnValue.description;
        break;
      case 'IDocMethod':
        parameters = docItem.parameters;
        returnsMessage = docItem.returnValue.description;
        break;
      case 'IDocClass':
        members = docItem.members;
        break;
      default:
        break;
    }

    return new ResolvedApiItem(
      ApiItemKind[docItem.kind],
      docItem.summary,
      docItem.remarks,
      docItem.deprecatedMessage,
      undefined,
      parameters,
      returnsMessage,
      members

    );
  }

  constructor(
    kind: ApiItemKind,
    summary: IDocElement[],
    remarks: IDocElement[],
    deprecatedMessage: IDocElement[],
    apiTag?: ApiTag,
    params?:  {[name: string]: IParam},
    returnsMessage?: IDocElement[],
    members?: { [name: string]: ApiItem | IDocMember} ) {
    this.kind = kind;
    this.summary = summary;
    this.remarks = remarks;
    this.apiTag = apiTag;
    this.params = params;
    this.returnsMessage = returnsMessage;
    this.members = members;
  }
}
