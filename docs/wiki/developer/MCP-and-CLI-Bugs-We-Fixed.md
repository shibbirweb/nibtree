# MCP and CLI Bugs We Fixed

The bugs we found in the MCP server and the command line tool, why they happened and how we fixed them. How they work is in [How MCP and the CLI Work](How-MCP-and-CLI-Work.md); the user side is in [MCP Server and Command Line Tool](../usage/MCP-and-CLI.md).

**The clash check missed `inspect_elements`.**
- **The issue:** a backend tool could have taken the name `inspect_elements` without a test failing.
- **Why it happened:** `FRONTEND_TOOLS`, the list the Rust clash test checks, was typed by hand with a fixed length of 23, and nobody added the 24th UI tool to it.
- **The fix and why we chose it:** the list is now a slice with every UI tool, and a Vitest test in `toolDefs.test.ts` reads `registry.rs` and compares it with the real `UI_TOOLS` names. Reading the Rust file from TypeScript checks the list the app actually registers, not a parse of `toolDefs.ts`.

**A refused request could lose its answer on Windows.**
- **The issue:** with the command line tool switched off, `nibtree cli tools` failed on Windows with "Could not read Nibtree's answer: io: Peer disconnected" instead of saying the tool is off. The Windows CI job found it.
- **Why it happened:** a refused request (wrong token, a switch off, a bad path) is answered before its body is read, and the connection was closed at once. Closing a socket that still holds unread data makes Windows reset the connection, and the reset can arrive before the client has read the answer.
- **The fix and why we chose it:** `close_after_refusal` in `mcp/http.rs` shuts the sending side first, then reads and drops the rest of the request for up to a second before closing. Reading the whole body before refusing would have let anyone make the server read 1 MB without a token; the short linger only reads what the client already sent.

**`git_push` dropped `pushTags`.**
- **The issue:** `nibtree cli call git_push pushTags=true` pushed the branch but no tags, and said nothing about it. A full test run of the git tools found it.
- **Why it happened:** tags were only added on the path with a `remoteName`; the plain push to the upstream has no tags option, and the flag was read only on the other path.
- **The fix and why we chose it:** without `remoteName`, `git_push` now pushes the branch, then the tags with `run_push_tags`, the same push the app's Push Tags uses. Refusing the flag would have made callers learn a rule for no reason. `push_sends_the_branch_and_push_tags_works_without_a_remote_name` covers it.
