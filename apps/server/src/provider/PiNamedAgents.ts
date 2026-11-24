import {
  isPiNamedAgentName,
  piNamedAgentInstanceId,
  ProviderInstanceId,
  resolveProviderInstanceEnabled,
  type ProviderInstanceConfigMap,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as HostProcess from "@t3tools/shared/HostProcess";

export const discoverPiNamedAgents = Effect.fn("discoverPiNamedAgents")(function* (
  configMap: ProviderInstanceConfigMap,
  workspaces: ReadonlyArray<string>,
) {
  const base = configMap[ProviderInstanceId.make("pi")];
  if (base === undefined || base.driver !== "pi") return configMap;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const home = yield* HostProcess.HomeDirectory;
  const env = yield* HostProcess.Environment;
  const configuredDir = base.environment?.find(({ name }) => name === "PI_CODING_AGENT_DIR")?.value;
  const dir = typeof configuredDir === "string" ? configuredDir : env.PI_CODING_AGENT_DIR;
  const agentDir = !dir
    ? path.join(home, ".pi", "agent")
    : dir.startsWith("~/")
      ? path.join(home, dir.slice(2))
      : dir;

  const list = (directory: string) =>
    fs.readDirectory(directory).pipe(
      Effect.orElseSucceed(() => []),
      Effect.flatMap((names) =>
        Effect.filter(
          names.filter(isPiNamedAgentName),
          (name) =>
            fs.stat(path.join(directory, name)).pipe(
              Effect.map((info) => info.type === "Directory"),
              Effect.orElseSucceed(() => false),
            ),
          { concurrency: 8 },
        ),
      ),
    );
  const global = new Set(yield* list(path.join(agentDir, "agents")));
  const scoped = new Map<string, string[]>();
  for (const cwd of [...new Set(workspaces)].sort()) {
    for (const name of yield* list(path.join(cwd, ".pi", "agents"))) {
      if (global.has(name)) continue;
      const current = scoped.get(name);
      if (current === undefined) scoped.set(name, [cwd]);
      else current.push(cwd);
    }
  }
  const config = typeof base.config === "object" && base.config !== null ? base.config : {};
  return {
    ...configMap,
    ...Object.fromEntries(
      [...global, ...scoped.keys()].sort().map((name) => {
        const instanceId = piNamedAgentInstanceId(name);
        return [
          instanceId,
          {
            ...base,
            displayName: name,
            enabled: resolveProviderInstanceEnabled(base),
            config: {
              ...config,
              ...(scoped.has(name) ? { namedAgentWorkspaces: scoped.get(name)! } : {}),
            },
          },
        ];
      }),
    ),
  } satisfies ProviderInstanceConfigMap;
});
