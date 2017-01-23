// Typings based on DefinitelyTyped definitions from whatwg-fetch

/* tslint:disable: interface-name */
/* tslint:disable: no-any */
/* tslint:disable: no-shadowed-variable */
/* tslint:disable: no-var-keyword */
/* tslint:disable: variable-name */
/* tslint:disable: member-ordering */
/* tslint:disable: no-unused-variable */
/* tslint:disable: quotemark */
/* tslint:disable: indent */
/* tslint:disable: max-line-length */
/* tslint:disable: member-access */
/* tslint:disable: whitespace */

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
