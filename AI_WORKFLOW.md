# AI workflow note

> Draft: review and rewrite in your own words before submitting.

## Tools used
- **Claude Code** (desktop app, agentic mode): scaffolding, implementation, tests, docs
- **Claude Code's built-in browser**: driving the running app to verify UI flows end to end

## Where AI materially sped things up
- Turning the brief into a scoped plan and data model (users, documents, shares with roles) in minutes
- Boilerplate: Express routes, the SQLite schema, the share dialog, CSS layout
- Writing the API test suite, which covers role enforcement, sanitisation, and upload
- Drafting README, architecture, and submission docs from the actual code

## What I changed or rejected
- **Editor library:** a heavier setup (React + Tiptap + bundler) was the obvious option. I chose no-build `contenteditable` to protect the timebox, and wrote the trade-off down instead of hiding it.
- **Trusting the client:** I kept sanitisation and permission checks on the server, not just in the UI, and added tests that call the API directly as a viewer or non-shared user.
- **Tooling failures caught and fixed:** a shell heredoc that silently wrote no files was replaced with direct file writes. A Windows-specific `node --test test/` path issue was fixed with an explicit glob.
- **Output I noticed and left (documented):** list formatting can leave empty `<p></p>` around lists. It's harmless to rendering and is noted for the editor swap.
- **Paste behaviour:** rich paste from other apps brought in arbitrary markup, so I made paste plain-text.

## How correctness was verified
- `npm test`: 3 API tests (sharing roles, viewer write blocked, non-shared 403, owner-only delete and share, empty-title 400, `<script>` stripped, .txt/.md import, unsupported type 415, unauthenticated 401). All passing.
- Manual end-to-end run in a real browser:
  - As Alice: created a doc, applied H1, bold, and a bulleted list, saw autosave, then reloaded and confirmed the HTML persisted.
  - Shared the doc with Bob (editor) and Carol (viewer).
  - Switched to Bob: the doc showed under *Shared with me* with "can edit", and was editable.
  - Switched to Carol: banner shown, toolbar disabled, title read-only.
  - Imported a `.md` file: it became a new owned document with headings and lists.
- Not yet verified: `.docx` import was only exercised through the library, not with a real Word file. Test with one before relying on it.
