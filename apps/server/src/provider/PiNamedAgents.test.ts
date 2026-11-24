import { assert, it } from "@effect/vitest";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { piNamedAgentInstanceId, ProviderDriverKind, ProviderInstanceId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as HostProcess from "@t3tools/shared/HostProcess";
import { discoverPiNamedAgents } from "./PiNamedAgents.ts";

it.layer(NodeServices.layer)("Telos Pi definition discovery", (it) => {
  it.effect(
    "inherits the Pi instance, deduplicates project overlays, and scopes project-only names",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const temp = yield* fs.makeTempDirectoryScoped();
        const agentDir = path.join(temp, "user-agent");
        const projectA = path.join(temp, "project-a");
        const projectB = path.join(temp, "project-b");
        for (const name of [
          path.join(agentDir, "agents", "reviewer"),
          path.join(projectA, ".pi", "agents", "reviewer"),
          path.join(projectA, ".pi", "agents", "project-agent"),
          path.join(projectB, ".pi", "agents", "project-agent"),
          path.join(projectB, ".pi", "agents", "bad name"),
        ])
          yield* fs.makeDirectory(name, { recursive: true });
        yield* fs.writeFileString(path.join(agentDir, "agents", "plain-file"), "ignored");
        const driver = ProviderDriverKind.make("pi");
        const result = yield* discoverPiNamedAgents(
          {
            [ProviderInstanceId.make("pi")]: {
              driver,
              config: { binaryPath: "/telos/pi" },
              environment: [{ name: "PI_CODING_AGENT_DIR", value: agentDir, sensitive: false }],
            },
          },
          [projectB, projectA, projectB],
        ).pipe(
          Effect.provideService(HostProcess.Environment, {}),
          Effect.provideService(HostProcess.HomeDirectory, temp),
        );
        assert.deepEqual(Object.keys(result).sort(), [
          "pi",
          "pi-agent-project-agent",
          "pi-agent-reviewer",
        ]);
        assert.deepEqual(result[piNamedAgentInstanceId("reviewer")]?.config, {
          binaryPath: "/telos/pi",
        });
        assert.deepEqual(result[piNamedAgentInstanceId("project-agent")]?.config, {
          binaryPath: "/telos/pi",
          namedAgentWorkspaces: [projectA, projectB],
        });
      }),
  );
});
