// Type definitions for webpack in Microsoft ODSP projects
// Project: ODSP-WEBPACK

/*
 * This definition of webpack require overrides all other definitions of require in our toolchain
 * Make sure all other definitions of require are commented out e.g. in node.d.ts
 */
declare var require: {
    (path: string): any;
    (paths: string[], callback: (...modules: any[]) => void): void;
    ensure: (paths: string[], callback: (require: <T>(path: string) => T) => void, path: string) => void;
};