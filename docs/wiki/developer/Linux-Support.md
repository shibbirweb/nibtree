# Linux Support

What the code does differently on Linux, how the Linux packages are built, and what is still missing. Builds and signing on every platform: [Platforms and Signing](Platforms-and-Signing.md). Windows has its own page: [Windows Support](Windows-Support.md).

## Why it is a small change

Linux is a Unix like macOS, so most of the backend already worked there: paths use `/`, the terminal starts your login shell (`$SHELL`) and lists `/etc/shells`, script runs read `PATH` from that shell, Move to Trash uses the freedesktop trash, and the browser version has been built and tested on Linux for a while. The desktop app adds the window, and on Linux Tauri draws it with WebKitGTK (the GTK port of WebKit, the same engine as Safari). So the work was packaging, CI, the release job and three gaps.

## Packages

`src-tauri/tauri.linux.conf.json` is merged over `tauri.conf.json` on Linux. Its bundle targets replace the macOS ones:

- **AppImage**: one file that runs on most distributions without installing. The update check links Linux users to it (`downloadAsset` in `src/lib/update/releases.ts`). `bundleMediaFramework` is off, since the app plays no audio or video.
- **.deb**: for Ubuntu, Debian and their relatives. It depends on `git` as well as the WebKitGTK and GTK packages Tauri adds itself, and installs the program as `/usr/bin/nibtree`.

After the build, `scripts/deb-package.ts` finishes the `.deb`. Debian reads everything after a `-` in a version as the package revision, so `0.2.0-beta.1` would sort above `0.2.0` and apt would never upgrade a beta to its stable release. Tauri only takes semver versions, so the script rewrites the control file with the Debian form, `0.2.0~beta.1` (`debianVersion` in `scripts/versioning.ts`; a `~` sorts before everything). It then checks the fields apt shows (`controlProblems` in `scripts/debPackage.ts`): the version, a maintainer with an email (Cargo's `authors`), the long description (`bundle.longDescription`) and the homepage. A missing one fails the build.

Both are x64 only for now. They are built on `ubuntu-22.04`, the oldest runner GitHub offers, because a program only runs where the system's glibc (the C library) is at least as new as the one it was built against.

## CI and releases

- `ci.yml` runs `linux-rust` on every push and pull request: `cargo test --workspace` and clippy with the WebKitGTK libraries installed. There is no Linux frontend job: the page runs the same way as on macOS (POSIX paths, a WebKit web view), so the macOS frontend job covers it.
- `linux-packages.yml` builds both packages for every pull request, installs the `.deb` with `apt-get`, runs `nibtree cli status` from it and from the AppImage (both must answer "not running" with exit code 2), and keeps both files under the run's Artifacts for 14 days. The runner has no FUSE (the AppImage's way of mounting itself), so `APPIMAGE_EXTRACT_AND_RUN=1` makes it unpack itself first.
- `build-linux` in `release.yml` builds them the same way, finishes the `.deb` and attaches both with `gh release upload` (not `tauri-action`, which uploads as soon as it has built), but only when the repository variable `LINUX_RELEASES` is `true`, like `WINDOWS_RELEASES` for Windows.

The Linux build needs these packages, on CI and on your own machine: `libwebkit2gtk-4.1-dev libxdo-dev libssl-dev librsvg2-dev pkg-config`.

## The GitHub token in the keyring

On macOS the token lives in the Keychain and on Windows in the Credential Manager. On Linux, `github/secrets.rs` uses the Secret Service, the desktop keyring that GNOME Keyring and KWallet provide over D-Bus. The `keyring` crate talks to it through `zbus`, which is pure Rust (features `async-secret-service`, `async-io` and `crypto-rust`), so no `libdbus` is needed to build or to run. `async-io` rather than `tokio`, because with `tokio` a keyring call on a Tokio thread can deadlock.

A server or a container usually has no Secret Service. There `no_keyring` treats the failure as "no token saved", so reading and removing quietly do nothing, and saving says to start a keyring or use the GitHub CLI. The browser version on Linux and in Docker behaves as before.

## One copy at a time

Like Windows, Linux starts a new process for every launch, and two copies would share `state.json` and the MCP port. So `tauri-plugin-single-instance` (over D-Bus too) is registered on Linux as well. A second start hands its folder to the running app (`on_second_launch`, see [Windows Support](Windows-Support.md#one-copy-at-a-time)). `nibtree cli` and the askpass helper exit before the plugin runs, and the merge tool never registers it.

## The command line tool from an AppImage

An AppImage runs its program from a folder it mounts while it runs, which is gone once the app quits. A `~/.local/bin/nibtree` link to that program would break. So `install::current_exe` returns the AppImage file itself, which the AppImage runtime names in `APPIMAGE`. The MCP settings that AI tools copy use the same path. The `.deb` needs no link, because `/usr/bin/nibtree` is already on `PATH`.

## Not done yet

- **Memory readout**: `memory.rs` returns zero bytes on Linux, so the status bar hides it. A port would read `/proc` for the app's WebKit processes.
- **MCP screenshot**: says it is not supported on Linux.
- **arm64 packages** and an `.rpm`.
- **Manual testing** on a real desktop: GNOME and KDE, X11 and Wayland, the keyring prompt and a second launch.

## Tests

- `install.rs`: `links_to_the_app_image_only_on_linux` checks the `APPIMAGE` rule on every platform.
- `versioning.test.ts` and `debPackage.test.ts`: the Debian version, and every control field the check rejects.
- `releases.test.ts`: the AppImage is the Linux download, and a release with only a `.deb` offers the release page.
- `linux-rust` runs every Rust test on Linux. Tests that need a desktop (the keyring, a second launch) are left to manual testing.
