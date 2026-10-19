# Nibtree in your browser

Nibtree is a Git client with a 3-way merge tool, workspaces, tabs, blame, history and a terminal. This image runs
the whole app in your browser, served from a container with git, git-lfs, SSH and GnuPG inside.

```sh
docker run --rm -p 4410:4410 \
  -v "$PWD:/workspace" \
  -v nibtree-home:/home/nibtree \
  -e NIBTREE_TOKEN=pick-a-secret \
  shibbirweb/nibtree:next
```

Then open http://localhost:4410/?token=pick-a-secret. Without `NIBTREE_TOKEN` a new random token is made on each
start, and `docker logs` shows the address with it.

## Tags

- `next`: the newest beta
- `latest`: the newest stable release (from the first stable release on)
- an exact version, such as `0.1.0-beta.13`

Each tag has `linux/amd64` and `linux/arm64`. The same image is on GitHub as `ghcr.io/shibbirweb/nibtree`.

## Volumes and options

- **`/workspace`** is the folder the app opens. Pass another path inside the container as the command to open
  that one instead.
- **`/home/nibtree`** holds the settings (`~/.nibtree-browser`) and git's config. A named volume keeps them
  between runs.
- **Your git identity and SSH keys:** mount them read-only, for example
  `-v ~/.gitconfig:/home/nibtree/.gitconfig:ro -v ~/.ssh:/home/nibtree/.ssh:ro`.
- **File owners:** on Linux add `--user "$(id -u):$(id -g)"`, so files the app writes belong to you.
- **Another port:** with `-p 9000:4410`, also set `-e NIBTREE_PUBLIC_URL=http://localhost:9000`, so the printed
  address is right.

## Docker Compose

[compose.yaml](https://github.com/shibbirweb/nibtree/blob/develop/docker/compose.yaml) runs the same container
with `docker compose up -d`. It listens on `127.0.0.1` only and restarts with Docker. Put it in the folder you want
to open, then:

```sh
NIBTREE_TOKEN=pick-a-secret docker compose up -d
```

## Security

Every page needs the token. Anyone who can reach the port and has the token can read and change the mounted files
and run commands in the container, so publish the port only on networks you trust.

## More

- How the image is built and tested: https://github.com/shibbirweb/nibtree/wiki/Docker-Image
- Without Docker: `npx nibtree@next` runs the same app from npm
- Source, desktop app and documentation: https://github.com/shibbirweb/nibtree
