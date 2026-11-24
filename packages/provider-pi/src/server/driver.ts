// User-wide ~/.pi/agent state makes continuation identity use default instance grouping.
import { piNamedAgentName, ProviderDriverKind, type ServerProvider } from "@t3tools/contracts";
import { DEFAULT_TELOS_PI_BINARY, PiSettings } from "../settings.ts";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import * as ChildProcessSpawner from "effect/process/ChildProcessSpawner";

import * as ProviderHost from "@t3tools/provider-core/server/ProviderHost";
import { piUsageReader } from "./usage.ts";
import { makePiTextGeneration } from "./textGeneration.ts";
import { PiAdapterV2Driver, type PiAdapterV2DriverEnv } from "./adapter.ts";
import { ProviderDriverError } from "@t3tools/provider-core/server/errors";
import {
  buildInitialPiProviderSnapshot,
  checkPiProviderStatus,
  discoverPiCommandsForCwd,
} from "./status.ts";
import { makeManagedServerProvider } from "@t3tools/provider-core/server/managedProvider";
import {
  defaultProviderContinuationIdentity,
  type ProviderDriver,
  type ProviderInstance,
} from "@t3tools/provider-core/server/driver";
import type { ServerProviderDraft } from "@t3tools/provider-core/server/snapshotProbe";
import { mergeProviderInstanceEnvironment } from "@t3tools/provider-core/server/instanceEnvironment";
import { makeManualOnlyProviderMaintenanceCapabilities } from "@t3tools/provider-core/server/maintenanceResolver";
import {
  haveProviderSnapshotSettingsChanged,
  makeProviderSnapshotSettingsSource,
  type ProviderSnapshotSettings,
} from "@t3tools/provider-core/server/snapshotSettings";

const decodePiSettings = Schema.decodeSync(PiSettings);

const DRIVER_KIND = ProviderDriverKind.make("pi");

export type PiDriverEnv =
  | PiAdapterV2DriverEnv
  | ProviderHost.ProviderHost
  | ChildProcessSpawner.ChildProcessSpawner
  | FileSystem.FileSystem
  | Path.Path;

const withInstanceIdentity =
  (input: {
    readonly instanceId: ProviderInstance["instanceId"];
    readonly displayName: string | undefined;
    readonly accentColor: string | undefined;
    readonly continuationGroupKey: string;
    readonly namedAgentWorkspaces?: ReadonlyArray<string>;
  }) =>
  (snapshot: ServerProviderDraft): ServerProvider => ({
    ...snapshot,
    instanceId: input.instanceId,
    driver: DRIVER_KIND,
    ...(input.displayName ? { displayName: input.displayName } : {}),
    ...(input.accentColor ? { accentColor: input.accentColor } : {}),
    continuation: { groupKey: input.continuationGroupKey },
    ...(input.namedAgentWorkspaces === undefined
      ? {}
      : { piNamedAgentWorkspaces: input.namedAgentWorkspaces }),
  });

export const PiDriver: ProviderDriver<PiSettings, PiDriverEnv, Path.Path> = {
  driverKind: DRIVER_KIND,
  metadata: {
    displayName: "Telos Pi",
    supportsMultipleInstances: true,
  },
  usage: piUsageReader,
  configSchema: PiSettings,
  defaultConfig: (): PiSettings => decodePiSettings({}),
  create: Effect.fn("PiDriver.create")(function* ({
    instanceId,
    displayName,
    accentColor,
    environment,
    enabled,
    config,
  }) {
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const fileSystem = yield* FileSystem.FileSystem;
    const pathService = yield* Path.Path;
    const host = yield* ProviderHost.ProviderHost;
    // Pi runs extensions' session_start in its cwd; the server's cwd is $HOME on packaged desktop.
    const probeCwd = pathService.join(host.paths.providerStatusCacheDir, "pi-status-probe");
    const namedAgent = piNamedAgentName(instanceId);
    const namedAgentWorkspaces = namedAgent === undefined ? undefined : config.namedAgentWorkspaces;
    const processEnv = yield* mergeProviderInstanceEnvironment(environment);
    const continuationIdentity = defaultProviderContinuationIdentity({
      driverKind: DRIVER_KIND,
      instanceId,
    });
    const stampIdentity = withInstanceIdentity({
      instanceId,
      displayName,
      accentColor,
      continuationGroupKey: continuationIdentity.continuationKey,
      ...(namedAgentWorkspaces === undefined ? {} : { namedAgentWorkspaces }),
    });
    // Migrate the stock default without overriding an explicitly configured executable.
    const configuredBinary = config.binaryPath;
    const binaryPath =
      configuredBinary === DEFAULT_TELOS_PI_BINARY || configuredBinary === "pi"
        ? processEnv.TELOS_PI_BINARY?.trim() || DEFAULT_TELOS_PI_BINARY
        : configuredBinary;
    const effectiveConfig = {
      ...config,
      enabled,
      binaryPath,
      launchArgs:
        namedAgent === undefined
          ? config.launchArgs
          : `${config.launchArgs} --agent ${namedAgent}`.trim(),
    } satisfies PiSettings;
    // Update the Telos checkout itself, not the upstream Pi npm package.
    const resolveMaintenance = () =>
      Effect.succeed(
        makeManualOnlyProviderMaintenanceCapabilities({
          provider: DRIVER_KIND,
          packageName: null,
          installPath: binaryPath,
        }),
      );

    const orchestrationAdapter = yield* PiAdapterV2Driver.create({
      instanceId,
      displayName,
      accentColor,
      environment,
      enabled,
      config: effectiveConfig,
    }).pipe(
      Effect.mapError(
        (cause) =>
          new ProviderDriverError({
            driver: DRIVER_KIND,
            instanceId,
            detail: "Failed to build Pi orchestration adapter.",
            cause,
          }),
      ),
    );
    const textGeneration = yield* makePiTextGeneration(
      effectiveConfig,
      processEnv,
      host.compatibility,
    );

    const checkProvider = fileSystem
      .makeDirectory(probeCwd, { recursive: true })
      .pipe(
        Effect.ignore,
        Effect.andThen(
          checkPiProviderStatus(
            effectiveConfig,
            processEnv,
            namedAgentWorkspaces?.[0] ?? probeCwd,
            host.compatibility,
          ),
        ),
        Effect.map(stampIdentity),
        Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, spawner),
      );

    const snapshotSettings = yield* makeProviderSnapshotSettingsSource(effectiveConfig);
    const snapshot = yield* makeManagedServerProvider<ProviderSnapshotSettings<PiSettings>>({
      resolveMaintenance,
      getSettings: snapshotSettings.getSettings,
      streamSettings: snapshotSettings.streamSettings,
      haveSettingsChanged: haveProviderSnapshotSettingsChanged,
      initialSnapshot: (settings) =>
        buildInitialPiProviderSnapshot(settings.provider).pipe(Effect.map(stampIdentity)),
      checkProvider,
    }).pipe(
      Effect.mapError(
        (cause) =>
          new ProviderDriverError({
            driver: DRIVER_KIND,
            instanceId,
            detail: "Failed to build Pi snapshot.",
            cause,
          }),
      ),
    );

    return {
      instanceId,
      driverKind: DRIVER_KIND,
      continuationIdentity,
      displayName,
      accentColor,
      enabled,
      snapshot,
      snapshotForCwd: (workspaceCwd) =>
        !effectiveConfig.enabled
          ? snapshot.getSnapshot
          : namedAgent !== undefined
            ? checkPiProviderStatus(
                effectiveConfig,
                processEnv,
                workspaceCwd,
                host.compatibility,
              ).pipe(
                Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, spawner),
                Effect.map((status) => ({
                  ...stampIdentity(status),
                  workspaceModels: status.models,
                  slashCommandsPending: false,
                })),
              )
            : Effect.all([
                snapshot.getSnapshot,
                discoverPiCommandsForCwd(effectiveConfig, processEnv, workspaceCwd).pipe(
                  Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, spawner),
                  Effect.mapError(
                    (cause) =>
                      new ProviderDriverError({
                        driver: DRIVER_KIND,
                        instanceId,
                        detail: "Failed to discover Pi workspace commands.",
                        cause,
                      }),
                  ),
                ),
              ]).pipe(
                Effect.map(([machineSnapshot, commands]) => ({
                  ...machineSnapshot,
                  ...commands,
                  slashCommandsPending: false,
                })),
              ),
      orchestrationAdapter,
      textGeneration,
    } satisfies ProviderInstance;
  }),
};
