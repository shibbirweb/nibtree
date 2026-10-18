# Nibtree in your browser

Nibtree is a Git client with a 3-way merge tool, workspaces, tabs, blame, history and a terminal. This package
runs the whole app in your browser, served from your own machine.

```sh
npx nibtree              # open the current folder
npx nibtree ~/code/app   # open another folder
npx nibtree@next         # the newest beta
```

It prints an address with an access token and opens it in your browser. Keep the terminal open while you work;
press Ctrl+C to stop.

## Options

```
--host <address>     where to listen (default 127.0.0.1; 0.0.0.0 for every network)
--port <number>      port to listen on (default 4300; 0 lets the system pick); a busy port moves on
--strict-port        stop instead of moving on when the port is busy
--no-open            print the address without opening a browser
--token <value>      a fixed access token (also NIBTREE_TOKEN); default: a new random one
--base-path <path>   serve under a path, behind a reverse proxy (for example /nibtree/)
--public-url <url>   the address to print when a proxy or Docker maps another one (http://host:port)
--version            show the version
--help               show this help
```

`NIBTREE_HOST`, `NIBTREE_PORT`, `NIBTREE_TOKEN` and `NIBTREE_PUBLIC_URL` set the same defaults as their options,
and `NIBTREE_NO_OPEN=1` is `--no-open`.

## Docker

```sh
docker run --rm -p 4410:4410 -v "$PWD:/workspace" -e NIBTREE_TOKEN=pick-a-secret ghcr.io/shibbirweb/nibtree
```

The image has git, git-lfs, SSH and GnuPG, and listens on port 4410. Details:
https://github.com/shibbirweb/nibtree/wiki/Docker-Image

Every page needs the token, also on your own machine. With `--host 0.0.0.0`, anyone who can reach the address and
has the token can read and change your files and run commands, so share it only on networks you trust.

## Settings

The browser version keeps its settings, recent folders and local history in `~/.nibtree-browser`, apart from the
desktop app's `~/.nibtree`.

## Platforms

macOS (Apple silicon and Intel), Linux (x64 and Arm, glibc) and Windows (x64 and Arm). Git must be installed.
The program for your platform comes in an optional package, such as `@nibtree/darwin-arm64`, so do not install with
`--omit=optional`.

Source, desktop app and documentation: https://github.com/shibbirweb/nibtree
