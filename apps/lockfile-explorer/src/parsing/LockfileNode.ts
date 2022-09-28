export class LockfileNode {
  data: any;
  lineNumber: number;

  constructor(yamlNode: any, lineNumber: number) {
    this.data = yamlNode;
    this.lineNumber = lineNumber;
  }
}
