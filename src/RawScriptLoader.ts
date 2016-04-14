import { EOL } from 'os';

const loaderFn: (content: string) => string = (content: string) => {
  return `${EOL}${content}${EOL}`;
};

(loaderFn as any).raw = true;

export = loaderFn;
