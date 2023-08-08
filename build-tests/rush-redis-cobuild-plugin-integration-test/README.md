# About

This package enables integration testing of the `RedisCobuildLockProvider` by connecting to an actual Redis created using an [redis](https://hub.docker.com/_/redis) docker image.

# Prerequisites

Docker and docker compose must be installed

# Start the Redis

In this folder run `docker-compose up -d`

# Stop the Redis

In this folder run `docker-compose down`

# Install and build the integration test code

```sh
rush update
rush build -t rush-redis-cobuild-plugin-integration-test
```

# Run the test for lock provider

```sh
# start the docker container: docker-compose up -d
# build the code: rushx build
rushx test-lock-provider
```

# Integration test in sandbox repo

Sandbox repo folder: **build-tests/rush-redis-cobuild-plugin-integration-test/sandbox/repo**

```sh
cd sandbox/repo
node ../../lib/runRush.js update
```

#### Case 1: Normal build, Cobuild is disabled because of missing RUSH_COBUILD_CONTEXT_ID 

1. Write to build cache

```sh
rm -rf common/temp/build-cache && node ../../lib/runRush.js --debug cobuild
```

2. Read from build cache

```sh
node ../../lib/runRush.js --debug cobuild
```

Expected behavior: Cobuild feature is disabled. Build cache is saved/restored as normal.

#### Case 2: Cobuild enabled by specifying RUSH_COBUILD_CONTEXT_ID and Redis authentication

1. Clear redis server

```sh
(cd ../.. && docker compose down && docker compose up -d)
```

2. Run cobuilds

```sh
rm -rf common/temp/build-cache && RUSH_COBUILD_CONTEXT_ID=foo REDIS_PASS=redis123 RUSH_COBUILD_RUNNER_ID=runner1 node ../../lib/runRush.js --debug cobuild
```

Expected behavior: Cobuild feature is enabled. Run command successfully.
You can also see cobuild related logs in the terminal.

```sh
Running cobuild (runner foo/runner1)
Analyzing repo state... DONE (0.11 seconds)

Executing a maximum of 10 simultaneous processes...

==[ b (build) ]====================================================[ 1 of 9 ]==
Get completed_state(cobuild:completed:foo:2e477baf39a85b28fc40e63b417692fe8afcc023)_package(b)_phase(_phase:build): SUCCESS;2e477baf39a85b28fc40e63b417692fe8afcc023
Get completed_state(cobuild:completed:foo:cfc620db4e74a6f0db41b1a86d0b5402966b97f3)_package(a)_phase(_phase:build): SUCCESS;cfc620db4e74a6f0db41b1a86d0b5402966b97f3
Successfully acquired lock(cobuild:lock:foo:4c36160884a7a502f9894e8f0adae05c45c8cc4b)_package(b)_phase(_phase:build) to runner(runner1) and it expires in 30s
```

#### Case 3: Cobuild enabled, run two cobuild commands in parallel

> Note: This test requires Visual Studio Code to be installed.

1. Open predefined `.vscode/redis-cobuild.code-workspace` in Visual Studio Code.

2. Clear redis server

```sh
# Under rushstack/build-tests/rush-redis-cobuild-plugin-integration-test
docker compose down && docker compose up -d
```

3. Clear build cache

```sh
# Under rushstack/build-tests/rush-redis-cobuild-plugin-integration-test/sandbox/repo
rm -rf common/temp/build-cache
```

4. Open command palette (Ctrl+Shift+P or Command+Shift+P) and select `Tasks: Run Task` and select `cobuild`.

> In this step, two dedicated terminal windows will open. Running `rush cobuild` command under sandbox repo respectively.

Expected behavior: Cobuild feature is enabled, cobuild related logs out in both terminals.

#### Case 4: Cobuild enabled, run two cobuild commands in parallel, one of them failed

> Note: This test requires Visual Studio Code to be installed.

1. Open predefined `.vscode/redis-cobuild.code-workspace` in Visual Studio Code.

2. Making the cobuild command of project "A" fails

**sandbox/repo/projects/a/package.json**

```diff
  "scripts": {
-   "_phase:build": "node ../build.js a",
+   "_phase:build": "exit 1",
  }
```

3. Clear redis server

```sh
# Under rushstack/build-tests/rush-redis-cobuild-plugin-integration-test
docker compose down && docker compose up -d
```

4. Clear build cache

```sh
# Under rushstack/build-tests/rush-redis-cobuild-plugin-integration-test/sandbox/repo
rm -rf common/temp/build-cache
```

5. Open command palette (Ctrl+Shift+P or Command+Shift+P) and select `Tasks: Run Task` and select `cobuild`.

Expected behavior: Cobuild feature is enabled, cobuild related logs out in both terminals. These two cobuild commands fail because of the failing build of project "A". And, one of them restored the failing build cache created by the other one.
