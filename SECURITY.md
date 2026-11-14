# Security policy

## Supported versions

Nibtree is in its 0.1 beta line. Security fixes go into the newest release only, so please update before
reporting.

| Version | Supported |
| --- | --- |
| Newest beta (`0.1.0-beta.N`) and, once released, the newest stable | Yes |
| Older releases | No |

This covers the desktop app (macOS, Windows, Linux), the browser version (`npx nibtree` and the Docker images) and
the `nibtree` command line tool.

## Reporting a vulnerability

Please do not open a public issue for a security problem.

Report it privately through GitHub: open the repository's **Security** tab and choose
[**Report a vulnerability**](https://github.com/shibbirweb/nibtree/security/advisories/new). Include:

- the Nibtree version and your operating system,
- what an attacker can do and what they need first (for example network access, a crafted repository, a file
  opened in the app),
- steps or a small proof of concept that shows it.

We aim to answer within a week. Once the problem is confirmed, we agree on a fix and a release date,
and you are credited in the advisory unless you ask not to be.

## Areas that matter most

- **The browser version's server** (`npx nibtree`, Docker): it can read and change files and run commands, so its
  access token, the Host and Origin checks and the `--host` setting are security boundaries.
- **The MCP server and the command line tool**: off by default; when on, they listen on `127.0.0.1` and need the
  secret token.
- **Opening untrusted repositories**: git hooks, `.gitattributes` filters, submodule URLs, file names and the
  Markdown preview (scripts are stripped and remote images are not loaded).
- **Secrets**: the GitHub token (system keychain), sign-in prompts for git and SSH, and the settings folder.

## Out of scope

- Problems that need someone who already controls your user account or your git configuration.
- Running the browser version with `--host 0.0.0.0` on an untrusted network while sharing its token.
- Warnings about the app not being signed yet (Gatekeeper, SmartScreen); these are tracked as known issues.
