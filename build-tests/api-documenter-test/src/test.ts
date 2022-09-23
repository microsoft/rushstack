export type Example1 =
  | {
      /** Docs for string A */
      a: string;
    }
  | {
      /** Docs for number A */
      a: number;
    };

export type Example2 = {
  /** Docs for A */
  a: string;
} & (
  | {
      /** Docs for B */
      b: string;
    }
  | {
      /** Docs for C */
      c: string;
    }
);

export type Example3 =
  | {
      /** Docs for A */
      a: string;
    }
  | true
  | undefined;

/** @param a - Docs for A */
export type Example4 = (a: string) => {
  /** Docs for B */
  b: string;
};
