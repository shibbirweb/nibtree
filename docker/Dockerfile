# Nibtree's browser version in a container:
#
#   docker run --rm -p 4410:4410 -v "$PWD:/workspace" -v nibtree-home:/home/nibtree ghcr.io/shibbirweb/nibtree
#
# The build context comes from `bun scripts/docker-context.ts`: `<arch>/` (amd64, arm64) is the unpacked npm
# package @nibtree/linux-<cpu>, the same nibtree-browser program and page, so the image runs exactly what CI
# tested. See docs/wiki/developer/Docker-Image.md.
FROM debian:bookworm-slim

ARG TARGETARCH
ARG VERSION=dev

LABEL org.opencontainers.image.title="Nibtree" \
      org.opencontainers.image.description="Nibtree in your browser: a Git client with a 3-way merge tool" \
      org.opencontainers.image.source="https://github.com/shibbirweb/nibtree" \
      org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.version="${VERSION}"

# The app writes through the git command, so git is the heart of the image: LFS, SSH remotes, signed commits and
# the terminal's shell come with it. tini is PID 1: it passes `docker stop` on and reaps the terminals' shells.
# A mounted folder belongs to the host's user, often not the container's, and git would refuse it: hence
# safe.directory. Any `--user` may run the image, so its home is writable without a volume too.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        bash ca-certificates git git-lfs gnupg less openssh-client tini \
    && rm -rf /var/lib/apt/lists/* \
    && git lfs install --system \
    && git config --system --add safe.directory '*' \
    && useradd --uid 1000 --create-home --shell /bin/bash nibtree \
    && chmod 1777 /home/nibtree

# The package's bin/: the program with its page beside it (src-tauri/browser/src/assets.rs looks there).
COPY ${TARGETARCH}/bin/ /usr/local/lib/nibtree/
RUN ln -s /usr/local/lib/nibtree/nibtree-browser /usr/local/bin/nibtree-browser

ENV HOME=/home/nibtree \
    NIBTREE_HOST=0.0.0.0 \
    NIBTREE_PORT=4410 \
    NIBTREE_NO_OPEN=1
USER nibtree
WORKDIR /workspace
EXPOSE 4410

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
    CMD bash -c 'exec 3<>/dev/tcp/127.0.0.1/${NIBTREE_PORT}'

ENTRYPOINT ["/usr/bin/tini", "--", "nibtree-browser"]
CMD ["/workspace"]
