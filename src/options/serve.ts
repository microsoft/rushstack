export interface IServeOptions {
  port: number;
  initialPage: string;
  api?: {
    port: number,
    entryPath: string
  };
}

export default {
  port: 4321,
  initialPage: '/lib',
  api: null
};

