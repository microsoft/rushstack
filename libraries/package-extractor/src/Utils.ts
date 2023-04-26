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
  // eslint-disable-next-line @rushstack/security/no-unsafe-regexp
  const regExp: RegExp = new RegExp(pattern);
  return regExp.test(input);
}
