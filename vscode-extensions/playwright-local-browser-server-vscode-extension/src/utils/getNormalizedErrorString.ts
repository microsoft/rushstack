export function getNormalizedErrorString(error: unknown): string {
  if (error instanceof Error) {
    if (error.stack) {
      return error.stack;
    }
    return error.message;
  }
  return String(error);
}
