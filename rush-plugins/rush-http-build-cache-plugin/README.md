# @rushstack/rush-http-build-cache-plugin

A Rush plugin that uses HTTP/HTTPS to manage cache objects.

Authentication is provided via standard `Authorization` HTTP headers, with the value (a Bearer or Basic token) configured using a custom node script. Your "tokenHandler" node script is automatically called when the user updates their cloud credentials.

## Configuration

To use the HTTP build cache plugin, enable it in `common/config/rush/build-cache.json`:

```json
{
    "buildCacheEnabled": true,

    "cacheProvider": "http"
}
```

Once enabled, configure the HTTP build cache in config file `common/config/rush-plugins/rush-http-build-cache-plugin.json`:

```json
{
    "url": "https://build-cache.example.com",
    "tokenHandler": "node common/scripts/custom-script-that-returns-an-authentication-header.js",
    "isCacheWriteAllowed": false
}
```

- url: The server to store cache objects.
- `tokenHandler`: A script that can print the Authorization header expected by the server. The value printed to `stdout` by this command should be an exact header, for example, `Bearer ab98d8c878d937290d979a9097c90dfffff` or `Basic 098abc7dff==`.
- `isCacheWriteAllowed`: A flag that determines if the plugin should write to the cache.

## HTTP Cache Server Requirements

The HTTP build cache plugin can use almost any HTTP/HTTPS backend for remote caching, as long as it honors the following rules:

 - Uses `Authorization: Bearer xxx` or `Authorization: Basic xxx` headers for authentication.
 - Accepts GET requests for cache reads.
 - Accepts PUT requests for cache writes (with a raw request body -- no `form/multipart`).
 - Cache hits return HTTP 200 with the file in the response body.
 - Successful cache writes return HTTP 2xx (200-299).
 - Cache misses return HTTP 404 or HTTP 403.
 - Invalid or missing authentication returns HTTP 401.

## Examples

### Gradle Build Cache Server

The Gradle Build Cache Server (typically used to support Gradle Remote Build Cache) meets all of the requirements above, so if you don't have another server in mind, you can use it as your remote backend.

First, start up and configure your build cache node locally:

 - Download latest JAR file from https://docs.gradle.com/build-cache-node/
 - Start the service: `java -jar build-cache-node-14.0.jar start`
 - Copy the startup banner information, and navigate to the specified localhost port
 - Enter the temporary username/password credentials printed in the startup banner
 - Click Build Cache > Settings > Cache Access Control and grant "Read & write" access to Anonymous

Second, create your `rush-http-build-cache-plugin.json` file as described in the Configuration section:

 - Note that your `url` should end with `/cache/`, for example, `http://localhost:5071/cache/`
 - To test reading and writing, set `isCacheWriteAllowed: true`.
 - Configure `tokenHandler` to point to a script that prints a Basic or Bearer Authorization value (this can be a dummy string if you granted Read and Write to Anonymous in your build cache node configuration).

Note that the Gradle Build Cache Server has a stricter format for its cache keys (they should be a simple hexadecimal hash with no non-alphanumeric characters). Configure this setting in your `common/config/rush/build-cache.json` file:

```json
{
    "cacheEntryNamePattern": "[hash]"
}
```

Last, initialize your cache credentials using Rush:

```console
rush update-cloud-credentials --interactive
```

To test out your remote build cache with full debugging output (for spotting any errors reading or writing the cache), run with the `--debug` flag:

```console
rush --debug build --verbose
```

> If you go on to deploy Rush remote build caching to your developers using the Gradle Build Cache, update your `tokenHandler`
> script to reflect your use case -- for example, you could require each developer to have a designated username/token configured
> via environment variables, and configure Cache Access Control with the corresponding entries. In this case the `tokenHandler`
> script should read the environment variables and print out an Authorization header, for example:
>
> ```javascript
> // common/scripts/build-cache-auth.js
> const credentials = `${process.env.CACHE_USER}:${process.env.CACHE_TOKEN}`;
> console.log('Basic ' + Buffer.from(credentials).toString('base64'));
> ```
