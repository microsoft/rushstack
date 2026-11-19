# Rush daemon integration review map

This is the file-level map for the review's frozen snapshot of #6018:
base `cb0447361e46537ca97480ae04671412058a146e`, head `61f908c6005d79caa03fe923408966c0b9becf6f` (473 changed paths).
It does not claim that only 10% of the diff needs review. New fixes after that head
are additional review work; use the PR's subsequent commits to inspect them.

Classification is conservative: an inherited file must have an identical Git blob
to the cited source. Files that combine Reporter and daemon integration work remain
**review required**, even if most lines originally came from another PR. Shared
Rush/node-core changes in the integration group affect native commands too.

The main comparison is pinned to `2a6f922763b404783647e66a98ecf5f961d71b6c`. A file already on that main
snapshot may still appear in this PR because the branch's merge base is older.
This map is not a rebase and does not bypass prerequisite review or release gates.
The other source snapshots are #5999 at `492bca5e23f8e3bc43bb86700cf89761fddc11f8`
and #6019 at `dfbe8a9adbaf7da3d0bd36854d1e8d1a1e23b9ab`.

| Category | Files |
| --- | ---: |
| WS3/WS4 integration delta: review required | 408 |
| Inherited Reporter follow-up (#6019), exact file | 11 |
| Reporter/integration mixed or follow-up delta: review required | 34 |
| Inherited R8 (#5999), exact file | 15 |
| Already landed on main | 5 |

## WS3/WS4 integration delta: review required

<details>
<summary>408 exact paths</summary>

```text
README.md
apps/rush-cli-client/.npmignore
apps/rush-cli-client/README.md
apps/rush-cli-client/bin/rush-client
apps/rush-cli-client/bin/rushx-client
apps/rush-cli-client/config/jest.config.json
apps/rush-cli-client/config/rig.json
apps/rush-cli-client/eslint.config.js
apps/rush-cli-client/package.json
apps/rush-cli-client/src/ClientAdmissionControls.ts
apps/rush-cli-client/src/ClientOperationRenderer.ts
apps/rush-cli-client/src/DaemonLogOutput.ts
apps/rush-cli-client/src/DaemonLogOutputProtocol.ts
apps/rush-cli-client/src/DaemonLogOutputWorker.ts
apps/rush-cli-client/src/GraphGenerationControls.ts
apps/rush-cli-client/src/GraphRequestContext.ts
apps/rush-cli-client/src/daemonCommands.ts
apps/rush-cli-client/src/daemonConnectionOptions.ts
apps/rush-cli-client/src/daemonGraph.ts
apps/rush-cli-client/src/daemonLogs.ts
apps/rush-cli-client/src/launchClient.ts
apps/rush-cli-client/src/routing.ts
apps/rush-cli-client/src/start.ts
apps/rush-cli-client/src/startRushX.ts
apps/rush-cli-client/src/test/CliSignalTestProcess.ts
apps/rush-cli-client/src/test/ClientAdmissionControls.test.ts
apps/rush-cli-client/src/test/ClientOperationRenderer.test.ts
apps/rush-cli-client/src/test/DaemonLogOutput.test.ts
apps/rush-cli-client/src/test/DaemonLogOutputTestProcess.ts
apps/rush-cli-client/src/test/DaemonLogSignalTestProcess.ts
apps/rush-cli-client/src/test/GraphGenerationControls.test.ts
apps/rush-cli-client/src/test/GraphGenerationWire.test.ts
apps/rush-cli-client/src/test/GraphRequestContext.test.ts
apps/rush-cli-client/src/test/IpcFixtureFile.test.ts
apps/rush-cli-client/src/test/IpcFixtureFile.ts
apps/rush-cli-client/src/test/NativeBuildTestFixture.test.ts
apps/rush-cli-client/src/test/NativeBuildTestFixture.ts
apps/rush-cli-client/src/test/PersistentIpcPressure.test.ts
apps/rush-cli-client/src/test/PersistentIpcPressure.ts
apps/rush-cli-client/src/test/PersistentIpcTestFixture.ts
apps/rush-cli-client/src/test/PtyTestProcess.ts
apps/rush-cli-client/src/test/RushXDaemon.test.ts
apps/rush-cli-client/src/test/RushXDaemonAlias.test.ts
apps/rush-cli-client/src/test/RushXDaemonBoundaries.test.ts
apps/rush-cli-client/src/test/RushXDaemonTestFixture.ts
apps/rush-cli-client/src/test/RushXTerminal.test.ts
apps/rush-cli-client/src/test/daemonConnectionSelection.test.ts
apps/rush-cli-client/src/test/daemonGraph.test.ts
apps/rush-cli-client/src/test/daemonLogs.test.ts
apps/rush-cli-client/src/test/launchClient.test.ts
apps/rush-cli-client/src/test/nativeBuild.test.ts
apps/rush-cli-client/src/test/nativeMutation.test.ts
apps/rush-cli-client/src/test/persistentIpc.test.ts
apps/rush-cli-client/src/test/persistentIpcBoundaries.test.ts
apps/rush-cli-client/src/test/persistentIpcCancellation.test.ts
apps/rush-cli-client/src/test/persistentIpcRetention.test.ts
apps/rush-cli-client/src/test/pipedInput.test.ts
apps/rush-cli-client/src/test/routing.test.ts
apps/rush-cli-client/src/test/versionSelectionFallback.test.ts
apps/rush-cli-client/src/writeStreamAsync.ts
apps/rush-cli-client/tsconfig.json
common/changes/@microsoft/rush/daemon-watch-policy-4747_2026-09-07.json
common/changes/@microsoft/rush/daemon-windows-path-environment_2026-09-07.json
common/changes/@microsoft/rush/graph-prepared-refresh_2026-09-06.json
common/changes/@microsoft/rush/native-entry-contracts_2026-09-08.json
common/changes/@microsoft/rush/preserve-live-purge-lock_2026-09-08.json
common/changes/@microsoft/rush/propagate-aggregate-runner-cleanup_2026-09-09.json
common/changes/@microsoft/rush/reporter-environment-native-engine_2026-09-06.json
common/changes/@microsoft/rush/reporter-stdout-compatibility_2026-09-09.json
common/changes/@microsoft/rush/review-r6-disposal-abort_2026-09-09-14-50.json
common/changes/@microsoft/rush/runner-lifetime-completion_2026-09-06-14-26.json
common/changes/@microsoft/rush/rushd-client_2026-09-06.json
common/changes/@microsoft/rush/rushd-iteration-lease-4747_2026-09-06.json
common/changes/@microsoft/rush/rushd-native-engine-4747_2026-09-06.json
common/changes/@microsoft/rush/rushd-native-path-aliases_2026-09-07.json
common/changes/@microsoft/rush/rushd-warmset-4747_2026-09-06.json
common/changes/@microsoft/rush/rushx-execution_2026-09-06.json
common/changes/@microsoft/rush/rushx-invocation-namespace_2026-09-07.json
common/changes/@microsoft/rush/warm-ipc-process-factory_2026-09-07.json
common/changes/@microsoft/rush/windows-ipc-resource-order_2026-09-07.json
common/changes/@microsoft/rush/ws3-explicit-node-ipc_2026-09-09.json
common/changes/@microsoft/rush/ws3-lifecycle-4747_2026-09-06.json
common/changes/@rushstack/node-core-library/windows-native-mutex_2026-09-07.json
common/changes/@rushstack/operation-graph/rushd-warmset-4747_2026-09-06.json
common/changes/@rushstack/rush-cli-client/admission-controls_2026-09-06.json
common/changes/@rushstack/rush-cli-client/fixture-git-line-endings_2026-09-08.json
common/changes/@rushstack/rush-cli-client/graph-generation-4747_2026-09-07.json
common/changes/@rushstack/rush-cli-client/hosted-ci-rushx-pipe-fixture_2026-09-07.json
common/changes/@rushstack/rush-cli-client/joined-launcher-fixture-cleanup_2026-09-08.json
common/changes/@rushstack/rush-cli-client/native-cli-rendering_2026-09-06.json
common/changes/@rushstack/rush-cli-client/native-early-stdin-fixture_2026-09-07.json
common/changes/@rushstack/rush-cli-client/native-fixture-callback-lifetime_2026-09-08.json
common/changes/@rushstack/rush-cli-client/native-graph-cli-fixtures_2026-09-07.json
common/changes/@rushstack/rush-cli-client/native-reuse-setup_2026-09-08.json
common/changes/@rushstack/rush-cli-client/native-workspace-identity_2026-09-07.json
common/changes/@rushstack/rush-cli-client/registry-miss-fixture_2026-09-07.json
common/changes/@rushstack/rush-cli-client/restart-retry-4747_2026-09-07.json
common/changes/@rushstack/rush-cli-client/retention-gate-publication_2026-09-11.json
common/changes/@rushstack/rush-cli-client/retention-pressure-handshake_2026-09-11.json
common/changes/@rushstack/rush-cli-client/rushd-client_2026-09-06.json
common/changes/@rushstack/rush-cli-client/rushd-graph-4747_2026-09-06.json
common/changes/@rushstack/rush-cli-client/rushx-execution_2026-09-06.json
common/changes/@rushstack/rush-cli-client/rushx-invocation-namespace_2026-09-07.json
common/changes/@rushstack/rush-cli-client/stdin-lifecycle_2026-09-06.json
common/changes/@rushstack/rush-cli-client/version-selected-launcher_2026-09-07.json
common/changes/@rushstack/rush-cli-client/version-skew-restart_2026-09-06.json
common/changes/@rushstack/rush-cli-client/windows-log-follow_2026-09-09.json
common/changes/@rushstack/rush-cli-client/ws3-explicit-node-ipc_2026-09-09.json
common/changes/@rushstack/rush-cli-client/ws4-acceptance-fixes_2026-09-09.json
common/changes/@rushstack/rush-client-core/atomic-fixture-pid-marker_2026-09-08.json
common/changes/@rushstack/rush-client-core/hosted-ci-startup-lifetime_2026-09-07.json
common/changes/@rushstack/rush-client-core/no-replay-after-terminal-control_2026-09-06.json
common/changes/@rushstack/rush-client-core/prebind-startup-handoff_2026-09-07.json
common/changes/@rushstack/rush-client-core/restart-retry-4747_2026-09-07.json
common/changes/@rushstack/rush-client-core/reuse-native-startup-lock_2026-09-07.json
common/changes/@rushstack/rush-client-core/rushd-client_2026-09-06.json
common/changes/@rushstack/rush-client-core/rushx-execution_2026-09-06.json
common/changes/@rushstack/rush-client-core/startup-readiness-cancellation_2026-09-07.json
common/changes/@rushstack/rush-client-core/stdin-lifecycle_2026-09-06.json
common/changes/@rushstack/rush-client-core/version-skew-restart_2026-09-06.json
common/changes/@rushstack/rush-client-core/windows-startup-sharing_2026-09-07.json
common/changes/@rushstack/rush-client-core/ws3-closing-readiness_2026-09-09.json
common/changes/@rushstack/rush-daemon-protocol/daemon-watch-policy-4747_2026-09-07.json
common/changes/@rushstack/rush-daemon-protocol/graph-generation-4747_2026-09-07.json
common/changes/@rushstack/rush-daemon-protocol/reload-tier-status-4747_2026-09-07.json
common/changes/@rushstack/rush-daemon-protocol/restart-retry-4747_2026-09-07.json
common/changes/@rushstack/rush-daemon-protocol/rushd-graph-4747_2026-09-06.json
common/changes/@rushstack/rush-daemon-protocol/rushd-lifecycle-4747_2026-09-06-14-40.json
common/changes/@rushstack/rush-daemon-protocol/rushx-execution_2026-09-06.json
common/changes/@rushstack/rush-daemon-protocol/stdin-lifecycle_2026-09-06.json
common/changes/@rushstack/rush-daemon-protocol/warm-status-4747_2026-09-07.json
common/changes/@rushstack/rush-daemon-protocol/ws3-explicit-node-ipc_2026-09-09.json
common/changes/@rushstack/rush-daemon-transport/rushd-handoff-4747_2026-09-06-14-50.json
common/changes/@rushstack/rush-daemon-transport/rushd-startup-cleanup-4747_2026-09-06-15-00.json
common/changes/@rushstack/rush-daemon/canonical-warm-fixture_2026-09-07.json
common/changes/@rushstack/rush-daemon/ci-daemon-setup-ownership_2026-09-11.json
common/changes/@rushstack/rush-daemon/composite-lifecycle-4747_2026-09-06.json
common/changes/@rushstack/rush-daemon/daemon-watch-policy-4747_2026-09-07.json
common/changes/@rushstack/rush-daemon/fixture-git-line-endings_2026-09-08.json
common/changes/@rushstack/rush-daemon/graph-generation-test-lifetime_2026-09-07.json
common/changes/@rushstack/rush-daemon/graph-prepared-refresh_2026-09-06.json
common/changes/@rushstack/rush-daemon/hosted-ci-startup-lifetime_2026-09-07.json
common/changes/@rushstack/rush-daemon/joined-graph-fixture-cleanup_2026-09-08.json
common/changes/@rushstack/rush-daemon/linux-descendant-quiescence_2026-09-08.json
common/changes/@rushstack/rush-daemon/measured-generation-and-native-setup_2026-09-08.json
common/changes/@rushstack/rush-daemon/measured-retention-expectations_2026-09-08.json
common/changes/@rushstack/rush-daemon/native-fixture-hooks-cleanup_2026-09-07.json
common/changes/@rushstack/rush-daemon/native-fixture-watch-paths_2026-09-07.json
common/changes/@rushstack/rush-daemon/native-graph-setup-budget_2026-09-08.json
common/changes/@rushstack/rush-daemon/native-retention-fixture-budget_2026-09-08.json
common/changes/@rushstack/rush-daemon/native-workspace-identity_2026-09-07.json
common/changes/@rushstack/rush-daemon/native-wrong-version-test-budget_2026-09-08.json
common/changes/@rushstack/rush-daemon/reload-tier-status-4747_2026-09-07.json
common/changes/@rushstack/rush-daemon/restart-retry-4747_2026-09-07.json
common/changes/@rushstack/rush-daemon/rushd-client_2026-09-06.json
common/changes/@rushstack/rush-daemon/rushd-graph-4747_2026-09-06.json
common/changes/@rushstack/rush-daemon/rushd-handoff-4747_2026-09-06-14-50.json
common/changes/@rushstack/rush-daemon/rushd-idle-shutdown-4747_2026-09-06-14-30.json
common/changes/@rushstack/rush-daemon/rushd-iteration-lease-4747_2026-09-06.json
common/changes/@rushstack/rush-daemon/rushd-management-4747_2026-09-06-14-40.json
common/changes/@rushstack/rush-daemon/rushd-native-engine-4747_2026-09-06.json
common/changes/@rushstack/rush-daemon/rushd-warmset-4747_2026-09-06.json
common/changes/@rushstack/rush-daemon/rushx-execution_2026-09-06.json
common/changes/@rushstack/rush-daemon/rushx-invocation-namespace_2026-09-07.json
common/changes/@rushstack/rush-daemon/stdin-lifecycle_2026-09-06.json
common/changes/@rushstack/rush-daemon/version-selected-launcher_2026-09-07.json
common/changes/@rushstack/rush-daemon/warm-generation-4747_2026-09-07.json
common/changes/@rushstack/rush-daemon/windows-fixture-sharing_2026-09-07.json
common/changes/@rushstack/rush-daemon/windows-warm-fixtures_2026-09-07.json
common/changes/@rushstack/rush-daemon/ws3-explicit-node-ipc_2026-09-09.json
common/changes/@rushstack/rush-daemon/ws3-lifecycle-4747_2026-09-06.json
common/changes/@rushstack/rush-daemon/ws3-request-cleanup-ownership_2026-09-09.json
common/changes/@rushstack/rush-daemon/ws4-terminal-context_2026-09-09.json
common/changes/@rushstack/rush-terminal-renderer/native-cli-rendering_2026-09-06.json
common/config/rush/browser-approved-packages.json
common/config/rush/nonbrowser-approved-packages.json
common/config/subspaces/default/pnpm-lock.yaml
common/reviews/api/operation-graph.api.md
common/reviews/api/rush-client-core.api.md
common/reviews/api/rush-daemon-protocol.api.md
common/reviews/api/rush-daemon-transport.api.md
common/reviews/api/rush-daemon.api.md
common/reviews/api/rush-terminal-renderer.api.md
libraries/node-core-library/src/LockFile.ts
libraries/node-core-library/src/WindowsLockFile.ts
libraries/node-core-library/src/test/WindowsLockFile.test.ts
libraries/operation-graph/src/WatchLoop.ts
libraries/operation-graph/src/protocol.types.ts
libraries/operation-graph/src/test/WatchLoop.test.ts
libraries/rush-client-core/.npmignore
libraries/rush-client-core/README.md
libraries/rush-client-core/config/api-extractor.json
libraries/rush-client-core/config/jest.config.json
libraries/rush-client-core/config/rig.json
libraries/rush-client-core/eslint.config.js
libraries/rush-client-core/package.json
libraries/rush-client-core/src/DaemonClient.ts
libraries/rush-client-core/src/DaemonClientError.ts
libraries/rush-client-core/src/DaemonLogFile.ts
libraries/rush-client-core/src/DaemonStartup.ts
libraries/rush-client-core/src/StartupLock.ts
libraries/rush-client-core/src/captureDaemonRequest.ts
libraries/rush-client-core/src/connectOrStartDaemon.ts
libraries/rush-client-core/src/executeWithDaemonRestart.ts
libraries/rush-client-core/src/index.ts
libraries/rush-client-core/src/runDaemonStartup.ts
libraries/rush-client-core/src/test/DaemonClient.test.ts
libraries/rush-client-core/src/test/StartupLock.test.ts
libraries/rush-client-core/src/test/TestProcessExit.ts
libraries/rush-client-core/src/test/WindowsOwnershipRead.test.ts
libraries/rush-client-core/src/test/connectOrStartDaemon.test.ts
libraries/rush-client-core/src/test/connectOrStartDaemonCancellation.test.ts
libraries/rush-client-core/src/test/fixtures/daemon.ts
libraries/rush-client-core/src/test/fixtures/launcher.ts
libraries/rush-client-core/src/test/fixtures/starter.ts
libraries/rush-client-core/tsconfig.json
libraries/rush-daemon-protocol/README.md
libraries/rush-daemon-protocol/src/ControlMessageValidation.ts
libraries/rush-daemon-protocol/src/DaemonClientCaps.ts
libraries/rush-daemon-protocol/src/DaemonCommandResult.ts
libraries/rush-daemon-protocol/src/DaemonControlKinds.ts
libraries/rush-daemon-protocol/src/DaemonControlMessage.ts
libraries/rush-daemon-protocol/src/DaemonGraphSnapshot.ts
libraries/rush-daemon-protocol/src/DaemonInteractiveControl.ts
libraries/rush-daemon-protocol/src/DaemonInvocationKind.ts
libraries/rush-daemon-protocol/src/DaemonLifecycleControl.ts
libraries/rush-daemon-protocol/src/DaemonPongMessage.ts
libraries/rush-daemon-protocol/src/DaemonPongValidation.ts
libraries/rush-daemon-protocol/src/DaemonProtocolVersion.ts
libraries/rush-daemon-protocol/src/DaemonRequestEnvelope.ts
libraries/rush-daemon-protocol/src/DaemonWorkspaceStatus.ts
libraries/rush-daemon-protocol/src/RequestControlValidation.ts
libraries/rush-daemon-protocol/src/RequestLifecycleCapabilityValidation.ts
libraries/rush-daemon-protocol/src/RequestResultValidation.ts
libraries/rush-daemon-protocol/src/RestartResultValidation.ts
libraries/rush-daemon-protocol/src/StatusValidation.ts
libraries/rush-daemon-protocol/src/WarmProjectRankValidation.ts
libraries/rush-daemon-protocol/src/WarmSetStatusValidation.ts
libraries/rush-daemon-protocol/src/WorkspaceStatusValidation.ts
libraries/rush-daemon-protocol/src/index.ts
libraries/rush-daemon-protocol/src/test/GraphGeneration.test.ts
libraries/rush-daemon-protocol/src/test/InputLifecycleControl.test.ts
libraries/rush-daemon-protocol/src/test/InvocationKind.test.ts
libraries/rush-daemon-protocol/src/test/LifecycleControl.test.ts
libraries/rush-daemon-protocol/src/test/RestartResult.test.ts
libraries/rush-daemon-protocol/src/test/WarmSetStatus.test.ts
libraries/rush-daemon-protocol/src/test/WorkspaceReloadTier.test.ts
libraries/rush-daemon-protocol/src/test/WorkspaceStatus.test.ts
libraries/rush-daemon-protocol/src/test/WorkspaceStatusTestData.ts
libraries/rush-daemon-transport/README.md
libraries/rush-daemon-transport/src/DaemonListener.ts
libraries/rush-daemon-transport/src/DaemonListenerBinding.ts
libraries/rush-daemon-transport/src/DaemonListenerLifetime.ts
libraries/rush-daemon-transport/src/DaemonOwnership.ts
libraries/rush-daemon-transport/src/test/ListenerOwnership.test.ts
libraries/rush-daemon-transport/src/test/ListenerStartupFailure.test.ts
libraries/rush-daemon/README.md
libraries/rush-daemon/package.json
libraries/rush-daemon/src/DaemonControlSession.ts
libraries/rush-daemon/src/DaemonGraphObserver.ts
libraries/rush-daemon/src/DaemonGraphRequest.ts
libraries/rush-daemon/src/DaemonGraphRequestRouter.ts
libraries/rush-daemon/src/DaemonIdleTimer.ts
libraries/rush-daemon/src/DaemonInstallation.ts
libraries/rush-daemon/src/DaemonInteractiveConnection.ts
libraries/rush-daemon/src/DaemonRequestDispatcher.ts
libraries/rush-daemon/src/EngineTerminalProvider.ts
libraries/rush-daemon/src/GlobalCommandExecutionContext.ts
libraries/rush-daemon/src/GlobalCommandRequest.ts
libraries/rush-daemon/src/GlobalCommandRequestRouter.ts
libraries/rush-daemon/src/InteractiveRequestInputRouter.ts
libraries/rush-daemon/src/LinuxProcessGroupExit.ts
libraries/rush-daemon/src/NativeMutationRequest.ts
libraries/rush-daemon/src/NativeMutationWorker.ts
libraries/rush-daemon/src/PhasedRequestRouter.ts
libraries/rush-daemon/src/ProductionDaemonRequestResolver.ts
libraries/rush-daemon/src/RequestScheduler.ts
libraries/rush-daemon/src/RushDaemonCommandLine.ts
libraries/rush-daemon/src/RushDaemonHost.ts
libraries/rush-daemon/src/RushDaemonRequestResolver.ts
libraries/rush-daemon/src/RushXDaemonRequestResolver.ts
libraries/rush-daemon/src/SelectedDaemonBootstrap.ts
libraries/rush-daemon/src/SelectedDaemonInstaller.ts
libraries/rush-daemon/src/VersionSelectedDaemonLauncher.ts
libraries/rush-daemon/src/WarmSetRanking.ts
libraries/rush-daemon/src/WorkspaceEngineComponentFactory.ts
libraries/rush-daemon/src/WorkspaceGeneration.ts
libraries/rush-daemon/src/WorkspaceInvalidationTracker.ts
libraries/rush-daemon/src/WorkspaceProcessRestart.ts
libraries/rush-daemon/src/WorkspaceRequestAdmission.ts
libraries/rush-daemon/src/WorkspaceRequestLifecycle.ts
libraries/rush-daemon/src/WorkspaceRequestResources.ts
libraries/rush-daemon/src/WorkspaceResolverLifecycle.ts
libraries/rush-daemon/src/WorkspaceSession.ts
libraries/rush-daemon/src/WorkspaceSessionFileWatcher.ts
libraries/rush-daemon/src/WorkspaceSessionProvider.ts
libraries/rush-daemon/src/WorkspaceStatus.ts
libraries/rush-daemon/src/WorkspaceWarmSet.ts
libraries/rush-daemon/src/index.ts
libraries/rush-daemon/src/serveRushDaemon.ts
libraries/rush-daemon/src/test/DaemonGraphFixturePaths.test.ts
libraries/rush-daemon/src/test/DaemonGraphFixtureSetup.test.ts
libraries/rush-daemon/src/test/DaemonGraphGeneration.test.ts
libraries/rush-daemon/src/test/DaemonGraphRequestRouter.test.ts
libraries/rush-daemon/src/test/DaemonGraphTestFixture.ts
libraries/rush-daemon/src/test/DaemonIdleShutdown.test.ts
libraries/rush-daemon/src/test/DaemonIdleTimer.test.ts
libraries/rush-daemon/src/test/DaemonRequestWireGlobal.test.ts
libraries/rush-daemon/src/test/DaemonShutdown.test.ts
libraries/rush-daemon/src/test/DaemonShutdownOwnership.test.ts
libraries/rush-daemon/src/test/GlobalCommandRequestRouter.test.ts
libraries/rush-daemon/src/test/GraphInvalidationNotifications.test.ts
libraries/rush-daemon/src/test/InteractiveInputEnd.test.ts
libraries/rush-daemon/src/test/LinuxProcessGroupExit.test.ts
libraries/rush-daemon/src/test/NativeBuildTestResult.test.ts
libraries/rush-daemon/src/test/NativeBuildTestResult.ts
libraries/rush-daemon/src/test/NativeEngineTestCommands.ts
libraries/rush-daemon/src/test/NativeIpcFixture.test.ts
libraries/rush-daemon/src/test/NativeMutationCleanupFailure.test.ts
libraries/rush-daemon/src/test/NativeWorkspacePaths.test.ts
libraries/rush-daemon/src/test/PhasedCommandEnvironment.test.ts
libraries/rush-daemon/src/test/ProductionDaemonRequestResolver.test.ts
libraries/rush-daemon/src/test/RequestScheduler.test.ts
libraries/rush-daemon/src/test/RushDaemonCommandLine.test.ts
libraries/rush-daemon/src/test/RushDaemonHost.test.ts
libraries/rush-daemon/src/test/SuccessfulMutationFixture.ts
libraries/rush-daemon/src/test/SuccessfulNativeMutation.test.ts
libraries/rush-daemon/src/test/TestDaemonListener.ts
libraries/rush-daemon/src/test/TestProcessExit.test.ts
libraries/rush-daemon/src/test/TestProcessExit.ts
libraries/rush-daemon/src/test/VersionSelectedDaemonLauncher.test.ts
libraries/rush-daemon/src/test/WarmGenerationTestUtilities.ts
libraries/rush-daemon/src/test/WarmSetRanking.test.ts
libraries/rush-daemon/src/test/WarmSetTestFixture.ts
libraries/rush-daemon/src/test/WorkspaceEngineComponentFactory.test.ts
libraries/rush-daemon/src/test/WorkspaceLifecycleTestProcess.ts
libraries/rush-daemon/src/test/WorkspaceReloadTierStatus.test.ts
libraries/rush-daemon/src/test/WorkspaceSession.test.ts
libraries/rush-daemon/src/test/WorkspaceSessionFileWatcher.test.ts
libraries/rush-daemon/src/test/WorkspaceSessionProvider.test.ts
libraries/rush-daemon/src/test/WorkspaceStatus.test.ts
libraries/rush-daemon/src/test/WorkspaceWarmGeneration.test.ts
libraries/rush-daemon/src/test/WorkspaceWarmQuiescence.test.ts
libraries/rush-daemon/src/test/WorkspaceWarmSet.test.ts
libraries/rush-daemon/src/test/WorkspaceWatchPolicy.test.ts
libraries/rush-daemon/src/test/fixtures/SuccessfulMutationDaemon.ts
libraries/rush-daemon/src/test/fixtures/SuccessfulMutationSuccessorMarker.ts
libraries/rush-lib/assets/rush-init/rush.json
libraries/rush-lib/src/api/DaemonConfiguration.ts
libraries/rush-lib/src/api/PhasedCommandEngine.ts
libraries/rush-lib/src/api/PhasedCommandEngineBusyError.ts
libraries/rush-lib/src/api/PhasedCommandEngineConfigurationChangedError.ts
libraries/rush-lib/src/api/RushConfiguration.ts
libraries/rush-lib/src/api/RushProjectConfiguration.ts
libraries/rush-lib/src/api/WorkspaceInputFingerprint.ts
libraries/rush-lib/src/api/test/DaemonConfiguration.test.ts
libraries/rush-lib/src/api/test/WorkspaceInputFingerprint.test.ts
libraries/rush-lib/src/cli/RushCommandLineParser.ts
libraries/rush-lib/src/cli/RushStartupBanner.ts
libraries/rush-lib/src/cli/RushXCommandLine.ts
libraries/rush-lib/src/cli/actions/BaseRushAction.ts
libraries/rush-lib/src/cli/parsing/SelectionParameterSet.ts
libraries/rush-lib/src/cli/test/RushCommandLineParser.test.ts
libraries/rush-lib/src/cli/test/RushCommandLineParserReporterClose.test.ts
libraries/rush-lib/src/cli/test/mockRushCommandLineParser.ts
libraries/rush-lib/src/index.ts
libraries/rush-lib/src/logic/EventHooksManager.ts
libraries/rush-lib/src/logic/NodeJsCompatibility.ts
libraries/rush-lib/src/logic/ProjectChangeAnalyzer.ts
libraries/rush-lib/src/logic/PurgeManager.ts
libraries/rush-lib/src/logic/Telemetry.ts
libraries/rush-lib/src/logic/dotenv.ts
libraries/rush-lib/src/logic/operations/CacheableOperationPlugin.ts
libraries/rush-lib/src/logic/operations/DaemonIpcConfiguration.ts
libraries/rush-lib/src/logic/operations/DaemonIpcOperationRunnerPlugin.ts
libraries/rush-lib/src/logic/operations/IOperationExecutionResult.ts
libraries/rush-lib/src/logic/operations/IOperationGraph.ts
libraries/rush-lib/src/logic/operations/IOperationRunner.ts
libraries/rush-lib/src/logic/operations/IPCOperationRunner.ts
libraries/rush-lib/src/logic/operations/LegacySkipPlugin.ts
libraries/rush-lib/src/logic/operations/NullOperationRunner.ts
libraries/rush-lib/src/logic/operations/OperationExecutionRecord.ts
libraries/rush-lib/src/logic/operations/OperationGraph.ts
libraries/rush-lib/src/logic/operations/PhasedCommandEngineExecution.ts
libraries/rush-lib/src/logic/operations/test/DaemonIpcConfiguration.test.ts
libraries/rush-lib/src/logic/operations/test/HeftChildProcessReporter.test.ts
libraries/rush-lib/src/logic/operations/test/IPCOperationRunnerResources.test.ts
libraries/rush-lib/src/logic/operations/test/OperationGraph.test.ts
libraries/rush-lib/src/logic/selectors/GitChangedProjectSelectorParser.ts
libraries/rush-lib/src/logic/test/PurgeManager.test.ts
libraries/rush-lib/src/logic/test/Telemetry.test.ts
libraries/rush-lib/src/pluginFramework/OperationGraphHooks.ts
libraries/rush-lib/src/pluginFramework/PluginLoader/PluginLoaderBase.ts
libraries/rush-lib/src/pluginFramework/PluginManager.ts
libraries/rush-lib/src/schemas/rush-project.schema.json
libraries/rush-lib/src/schemas/rush.schema.json
libraries/rush-lib/src/utilities/Utilities.ts
libraries/rush-lib/src/utilities/resolvePhasedCommandCwd.ts
libraries/rush-lib/src/utilities/test/resolvePhasedCommandCwd.test.ts
libraries/rush-sdk/src/test/__snapshots__/script.test.ts.snap
libraries/rush-terminal-renderer/README.md
libraries/rush-terminal-renderer/src/DaemonRendererHost.ts
libraries/rush-terminal-renderer/src/LegacyCollatedRenderer.ts
libraries/rush-terminal-renderer/src/OperationStreamHeader.ts
libraries/rush-terminal-renderer/src/OperationStreamRegistry.ts
libraries/rush-terminal-renderer/src/OperationTextDecoder.ts
libraries/rush-terminal-renderer/src/test/OperationTextDecoder.test.ts
rush.json
```

</details>

## Inherited Reporter follow-up (#6019), exact file

<details>
<summary>11 exact paths</summary>

```text
apps/rush/src/IRushFrontendLaunchOptions.ts
apps/rush/src/RushCommandSelector.ts
apps/rush/src/test/RushCommandSelector.test.ts
common/changes/@microsoft/rush/reporter-dag-review-fixes_2026-09-07.json
common/changes/@rushstack/rush-reporter/reporter-dag-review-fixes_2026-09-07.json
common/changes/@rushstack/rush-reporter/reporter-timer-failure-boundary_2026-09-09.json
libraries/reporter/src/manager/IReporter.ts
libraries/reporter/src/utilities/startReporterTimer.ts
libraries/rush-lib/src/api/test/EnvironmentConfiguration.test.ts
libraries/rush-lib/src/scripts/InstallRunRushBootstrap.ts
libraries/rush-lib/src/scripts/test/InstallRunRushBootstrap.test.ts
```

</details>

## Reporter/integration mixed or follow-up delta: review required

<details>
<summary>34 exact paths</summary>

```text
apps/rush/src/MinimalRushConfiguration.ts
apps/rush/src/RushFrontend.ts
apps/rush/src/RushReporterHost.ts
apps/rush/src/test/MinimalRushConfiguration.test.ts
apps/rush/src/test/RushFrontend.test.ts
apps/rush/src/test/RushReporterControlOwnership.test.ts
apps/rush/src/test/RushReporterHost.test.ts
apps/rush/src/test/sandbox/reporter-demo/README.md
apps/rush/src/test/sandbox/reporter-demo/run.mjs
common/changes/@rushstack/heft/preserve-child-reporter-private-members_2026-09-08.json
common/changes/@rushstack/rush-reporter/copilot-reporter-telemetry-privacy_2026-08-28-03-20-00.json
common/changes/@rushstack/rush-reporter/post-giga-ai-test-isolation_2026-09-11.json
common/changes/@rushstack/rush-reporter/qualification-setup-budget_2026-09-08.json
common/changes/@rushstack/rush-reporter/r8-machine-source-aliases_2026-09-11.json
common/changes/@rushstack/rush-reporter/review-combined-secret-source_2026-09-09.json
common/changes/@rushstack/rush-reporter/review-r4-followup_2026-09-11-19-24.json
common/changes/@rushstack/rush-reporter/review-r6-disposal-abort_2026-09-09-14-50.json
common/reviews/api/rush-lib.api.md
common/reviews/api/rush-reporter.api.md
docs/rush/reporter.md
libraries/reporter/README.md
libraries/reporter/src/index.ts
libraries/reporter/src/manager/ReporterManager.ts
libraries/reporter/src/reporters/AiReporter.ts
libraries/reporter/src/reporters/DefaultInteractiveReporter.ts
libraries/reporter/src/reporters/PlaintextReporter.ts
libraries/reporter/src/test/AiReporterQualification.test.ts
libraries/reporter/src/test/DefaultInteractiveReporter.test.ts
libraries/reporter/src/test/HeftIntegration.test.ts
libraries/reporter/src/test/HumanReadableDiagnostic.test.ts
libraries/reporter/src/test/Manager.test.ts
libraries/reporter/src/test/PlaintextReporter.test.ts
libraries/rush-lib/src/api/EnvironmentConfiguration.ts
libraries/rush-lib/src/cli/scriptActions/PhasedScriptAction.ts
```

</details>

## Inherited R8 (#5999), exact file

<details>
<summary>15 exact paths</summary>

```text
common/changes/@rushstack/rush-reporter/copilot-reporter-r8a-ai-gates_2026-08-28-08-45.json
common/changes/@rushstack/rush-reporter/r8-native-windows-qualification_2026-09-09.json
common/changes/@rushstack/rush-reporter/review-r8-qualification_2026-09-09-13-00.json
libraries/reporter/scripts/runAiReporterQualification.js
libraries/reporter/src/diagnostics/DiagnosticSecretValues.ts
libraries/reporter/src/qualification/AiReporterQualification.ts
libraries/reporter/src/qualification/AiReporterQualificationCorpus.ts
libraries/reporter/src/reporters/HumanReadableDiagnostic.ts
libraries/reporter/src/reporters/JsonReporter.ts
libraries/reporter/src/reporters/ReporterRedaction.ts
libraries/reporter/src/test/FileReporter.test.ts
libraries/reporter/src/test/JsonAiReporter.test.ts
libraries/reporter/src/test/ReporterRedaction.test.ts
libraries/reporter/src/test/helpers/AiQualificationTestSession.ts
libraries/reporter/src/test/helpers/AiQualificationWorker.ts
```

</details>

## Already landed on main

<details>
<summary>5 exact paths</summary>

```text
libraries/reporter/src/perf/PerformanceBudgets.ts
libraries/reporter/src/telemetry/TelemetryAggregate.ts
libraries/reporter/src/telemetry/TelemetrySubscriber.ts
libraries/reporter/src/test/Performance.test.ts
libraries/reporter/src/test/Telemetry.test.ts
```

</details>

## Review order

1. Shared native lock, environment, shell and command-selection changes.
2. WS3 host/request lifetime, reload/restart and warm-set implementation.
3. WS4 client routing, version selection, streams and management commands.
4. Mixed Reporter/integration files and their regression coverage.
5. Package/API/configuration changes, generated lockfile and change notes.
