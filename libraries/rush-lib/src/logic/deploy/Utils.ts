function escapeRegExp(literal: string): string {
  return literal.replace(/[^A-Za-z0-9_]/g, '\\$&');
}

export function matchesWithStar(patternWithStar: string, input: string): boolean {
  // Map "@types/*" --> "^\@types\/.*$"
  const pattern: string =
    '^' +
    patternWithStar
      .split('*')
      .map((x) => escapeRegExp(x))
      .join('.*') +
    '$';
  const regExp: RegExp = new RegExp(pattern);
  return regExp.test(input);
}
