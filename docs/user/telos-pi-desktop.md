# Telos Pi desktop

This fork keeps T3 Code's desktop interface and uses Telos Pi's native JSONL RPC (`pi --mode rpc`) instead of ACP. The model picker shows the models available to Pi; sign in and configure models in Pi as usual.

## Run from source on Linux

The default executable is `/mnt/AI1/telos_projects/Pi/pi/pi-test.sh`. The checkout needs its Node dependencies installed and a supported Node on `PATH`. If your checkout lives elsewhere, set the binary path under **Settings → Providers → Telos Pi**, or set `TELOS_PI_BINARY` before launching the app. A missing checkout is reported in provider settings; the app does not substitute stock Pi.

From this fork's root:

```sh
corepack pnpm install --frozen-lockfile
APP_VERSION=0.1.12-nightly.20261124.5191 VITE_RELEASE_CHANNEL=nightly \
  corepack pnpm run build:desktop:bundle
T3CODE_HOME="$HOME/.t3-telos" T3CODE_DISABLE_AUTO_UPDATE=true corepack pnpm run start:desktop
```

Keep `T3CODE_HOME` separate from existing T3 Code installations. This changes T3's state directory, not Pi's; Pi still reads its usual credentials, models, extensions, skills, and settings unless you configure a different `PI_CODING_AGENT_DIR`.

To sign in or use an interactive-only Pi feature, open T3's project terminal and run the same Telos Pi executable without `--mode rpc`. Native RPC supports the core session and extension-dialog interactions, but the T3 chat does not recreate Pi's custom TUI components. An independent terminal process does not attach to an already-running T3 Pi session.
