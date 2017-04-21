// Typings based on DefinitelyTyped definitions from es6-promise

export interface Thenable<T> {
    then<U>(onFulfilled?: (value: T) => U | Thenable<U>, onRejected?: (error: any) => U | Thenable<U>): Thenable<U>;
    then<U>(onFulfilled?: (value: T) => U | Thenable<U>, onRejected?: (error: any) => void): Thenable<U>;
}

export class Promise<T> implements Thenable<T> {

	constructor(callback: (resolve: (value?: T | Thenable<T>) => void, reject: (error?: any) => void) => void);

    then<U>(onFulfilled?: (value: T) => U | Thenable<U>, onRejected?: (error: any) => U | Thenable<U>): Promise<U>;
    then<U>(onFulfilled?: (value: T) => U | Thenable<U>, onRejected?: (error: any) => void): Promise<U>;

	catch<U>(onRejected?: (error: any) => U | Thenable<U>): Promise<U>;

	public static resolve<T>(value?: T | Thenable<T>): Promise<T>;

	public static reject(error: any): Promise<any>;
	public static reject<T>(error: T): Promise<T>;

	public static all<T1, T2, T3, T4, T5, T6, T7, T8, T9, T10>(values: [T1 | Thenable<T1>, T2 | Thenable<T2>, T3 | Thenable<T3>, T4 | Thenable <T4>, T5 | Thenable<T5>, T6 | Thenable<T6>, T7 | Thenable<T7>, T8 | Thenable<T8>, T9 | Thenable<T9>, T10 | Thenable<T10>]): Promise<[T1, T2, T3, T4, T5, T6, T7, T8, T9, T10]>;
    public static all<T1, T2, T3, T4, T5, T6, T7, T8, T9>(values: [T1 | Thenable<T1>, T2 | Thenable<T2>, T3 | Thenable<T3>, T4 | Thenable <T4>, T5 | Thenable<T5>, T6 | Thenable<T6>, T7 | Thenable<T7>, T8 | Thenable<T8>, T9 | Thenable<T9>]): Promise<[T1, T2, T3, T4, T5, T6, T7, T8, T9]>;
    public static all<T1, T2, T3, T4, T5, T6, T7, T8>(values: [T1 | Thenable<T1>, T2 | Thenable<T2>, T3 | Thenable<T3>, T4 | Thenable <T4>, T5 | Thenable<T5>, T6 | Thenable<T6>, T7 | Thenable<T7>, T8 | Thenable<T8>]): Promise<[T1, T2, T3, T4, T5, T6, T7, T8]>;
    public static all<T1, T2, T3, T4, T5, T6, T7>(values: [T1 | Thenable<T1>, T2 | Thenable<T2>, T3 | Thenable<T3>, T4 | Thenable <T4>, T5 | Thenable<T5>, T6 | Thenable<T6>, T7 | Thenable<T7>]): Promise<[T1, T2, T3, T4, T5, T6, T7]>;
    public static all<T1, T2, T3, T4, T5, T6>(values: [T1 | Thenable<T1>, T2 | Thenable<T2>, T3 | Thenable<T3>, T4 | Thenable <T4>, T5 | Thenable<T5>, T6 | Thenable<T6>]): Promise<[T1, T2, T3, T4, T5, T6]>;
    public static all<T1, T2, T3, T4, T5>(values: [T1 | Thenable<T1>, T2 | Thenable<T2>, T3 | Thenable<T3>, T4 | Thenable <T4>, T5 | Thenable<T5>]): Promise<[T1, T2, T3, T4, T5]>;
    public static all<T1, T2, T3, T4>(values: [T1 | Thenable<T1>, T2 | Thenable<T2>, T3 | Thenable<T3>, T4 | Thenable <T4>]): Promise<[T1, T2, T3, T4]>;
    public static all<T1, T2, T3>(values: [T1 | Thenable<T1>, T2 | Thenable<T2>, T3 | Thenable<T3>]): Promise<[T1, T2, T3]>;
    public static all<T1, T2>(values: [T1 | Thenable<T1>, T2 | Thenable<T2>]): Promise<[T1, T2]>;
    public static all<T>(values: (T | Thenable<T>)[]): Promise<T[]>;

	public static race<T>(promises: (T | Thenable<T>)[]): Promise<T>;
}


// Typings based on DefinitelyTyped definitions from whatwg-fetch

export class Request extends Body {
	constructor(input: string|Request, init?:RequestInit);
	method: string;
	url: string;
	headers: Headers;
	context: RequestContext;
	referrer: string;
	mode: RequestMode;
	redirect: RequestRedirect;
	credentials: RequestCredentials;
	cache: RequestCache;
}

export interface RequestInit {
	method?: string;
	headers?: HeaderInit|{ [index: string]: string };
	body?: BodyInit;
	mode?: RequestMode;
	redirect?: RequestRedirect;
	credentials?: RequestCredentials;
	cache?: RequestCache;
}

export type RequestContext =
	"audio" | "beacon" | "cspreport" | "download" | "embed" |
	"eventsource" | "favicon" | "fetch" | "font" | "form" | "frame" |
	"hyperlink" | "iframe" | "image" | "imageset" | "import" |
	"internal" | "location" | "manifest" | "object" | "ping" | "plugin" |
	"prefetch" | "script" | "serviceworker" | "sharedworker" |
	"subresource" | "style" | "track" | "video" | "worker" |
	"xmlhttprequest" | "xslt";
export type RequestMode = "same-origin" | "no-cors" | "cors";
export type RequestRedirect = "follow" | "error" | "manual";
export type RequestCredentials = "omit" | "same-origin" | "include";
export type RequestCache =
	"default" | "no-store" | "reload" | "no-cache" |
	"force-cache" | "only-if-cached";

export interface HeadersMap {
	[index: string]: string;
}

export class Headers {
	constructor(headers?:Headers|HeadersMap)
	append(name: string, value: string): void;
	delete(name: string):void;
	get(name: string): string;
	getAll(name: string): Array<string>;
	has(name: string): boolean;
	set(name: string, value: string): void;
	forEach(callback: (value: string, name: string) => void): void;
}

export class Body {
	bodyUsed: boolean;
	arrayBuffer(): Promise<ArrayBuffer>;
	blob(): Promise<Blob>;
	formData(): Promise<FormData>;
	json(): Promise<any>;
	json<T>(): Promise<T>;
	text(): Promise<string>;
}

export class Response extends Body {
	constructor(body?: BodyInit, init?: ResponseInit);
	static error(): Response;
	static redirect(url: string, status: number): Response;
	type: ResponseType;
	url: string;
	status: number;
	ok: boolean;
	statusText: string;
	headers: Headers;
	clone(): Response;
}

export type ResponseType = "basic" | "cors" | "default" | "error" | "opaque" | "opaqueredirect";

export interface ResponseInit {
	status: number;
	statusText?: string;
	headers?: HeaderInit;
}

export type HeaderInit = Headers|Array<string>;
export type BodyInit = ArrayBuffer|ArrayBufferView|Blob|FormData|string;
export type RequestInfo = Request|string;

export interface Window {
	fetch(url: string|Request, init?: RequestInit): Promise<Response>;
}
