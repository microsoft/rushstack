import ApiItem, { ApiItemKind } from './definitions/ApiItem';
import ApiItemContainer from './definitions/ApiItemContainer';
import { ApiTag } from './definitions/ApiDocumentation';
import { IDocElement, IParam } from './IDocElement';
import { IDocItem } from './IDocItem';
import ApiJsonFile from './generators/ApiJsonFile';

/**
 * A class to abstract away the difference between an item from our public API that could be 
 * represented by either an ApiItem or an IDocItem that is retrieved from a JSON file.
 */
export default class ResolvedApiItem {
  public kind: ApiItemKind;
  public summary: IDocElement[];
  public remarks: IDocElement[];
  public deprecatedMessage: IDocElement[];
  public isBeta: boolean;
  public params: {[name: string]: IParam};
  public returnsMessage: IDocElement[];
  public members: { [name: string]: ApiItem | IDocItem};

  /**
   * A function to abstract the construction of a ResolvedApiItem instance
   * from an ApiItem. 
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
      apiItem.documentation.apiTag === ApiTag.Beta,
      apiItem.documentation.parameters,
      apiItem.documentation.returnsMessage,
      members
    );
  }

  /**
   * A function to abstract the construction of a ResolvedApiItem instance
   * from a JSON object that symbolizes an IDocItem. 
   */
  public static createFromJson(docItem: IDocItem): ResolvedApiItem {
    let parameters: {[name: string]: IParam} = undefined;
    let returnsMessage: IDocElement[] = undefined;
    let members: { [name: string]: IDocItem} = undefined;
    switch (docItem.kind) {
      case 'function':
        parameters = docItem.parameters;
        returnsMessage = docItem.returnValue.description;
        break;
      case 'method':
        parameters = docItem.parameters;
        returnsMessage = docItem.returnValue.description;
        break;
      case 'class':
        members = docItem.members;
        break;
      case 'interface':
        members = docItem.members;
        break;
      default:
        break;
    }

    return new ResolvedApiItem(
      ApiJsonFile.convertJsonToKind(docItem.kind),
      docItem.summary,
      docItem.remarks,
      docItem.deprecatedMessage,
      docItem.isBeta,
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
    isBeta?: boolean,
    params?:  {[name: string]: IParam},
    returnsMessage?: IDocElement[],
    members?: { [name: string]: ApiItem | IDocItem} ) {
    this.kind = kind;
    this.summary = summary;
    this.remarks = remarks;
    this.isBeta = isBeta;
    this.params = params;
    this.returnsMessage = returnsMessage;
    this.members = members;
  }
}
