# Supernote ADB

## What it is

A command, `snadb`, that lets a program or an AI agent control a Supernote e-ink tablet over Wi-Fi ADB.

## Who it is for

A Supernote owner who works with coding agents and wants them to act on the tablet. The first user is the author, with a Manta (A5 X2).

## The job

Open a note, copy a file, ask for a sync, or install a plugin from a computer, with a call that answers in a form a program can read. Without this, an agent runs raw `adb` commands, guesses screen coordinates, and can draw on a note by accident.

## What it does

- Calls the tablet's own entry points first: intents, broadcasts, content providers and files.
- Answers every command in text or JSON, with exit codes that do not change.
- Refuses a press when the screen has changed since it was read.
- Never replaces a file unless the caller asks.
- Keeps what the screen says out of its saved state.

## What it will never do

| Non-goal | Reason | Reopened when |
| :--- | :--- | :--- |
| Root, a modified firmware, or an exploit on the tablet. An official Ratta update is allowed. | The tablet holds the owner's notes and the warranty position is unknown. | Never, by the owner's choice. |
| Requests to Supernote Cloud. | The cloud has no documented API or scoped token, so a client must hold the account password. | Ratta publishes a documented API with scoped tokens. |
| Read or interpret note content by itself. | It copies a file only when a caller names it. Parsing belongs to tools built for it. | Never here. A caller may combine this command with a parser. |
| Write `.note` files on the computer. | The format is private, and the open tool drops recognition data when it rewrites a file ([evidence](research/2026-11-existing-supernote-tools.md#writing-note-files)). | Ratta documents the format. |
| Hold plugin code that runs on the tablet. | A plugin has its own language, build and install route. | Never here. See [Boundaries](#boundaries). |
| Install a plugin without the tablet's screen. | The platform offers no such route, and forcing one needs an exploit. | The platform documents a route. |

## How you know it worked

An agent completes a task on the tablet by calling only `snadb`, with no raw `adb` and no coordinates. The first measure is the set of commands checked on a real device, recorded in the issue tracker.

## Constraints

- Works with Android 11 tools that a `shell` user may run, and no others.
- Needs Python and `adb` only, so a clone and one link are the whole install.
- A change on the tablet happens only on an explicit call.
- The tablet's address, serial number, account and note names never enter this repository. Tests use `device-a.test`.

## Limits the owner set

| Limit | Value | Rule or check | Decided | Status |
| :--- | :--- | :--- | :--- | :--- |
| Access to the tablet | No root, modified firmware or exploit | [non-goals](#what-it-will-never-do) | 2026-11-10 | current |
| Supernote Cloud | No requests | [non-goals](#what-it-will-never-do) | 2026-11-10 | current |
| Study of third-party apps and firmware | Stays out of this repository | [research index](research/) | 2026-11-10 | current |

## Boundaries

- **Skill Deck** is the author's collection of agent workflows. It uses this command, and it keeps no copy. How an agent should use the command for a task belongs there, and what the command does belongs here.
- **The future plugin** is a separate project. It runs on the tablet and can offer calls ADB cannot reach. This command stops at copying the plugin file and talking to the plugin through ADB.
- **Calendar and Todoist sync** are a separate deployment of [Task Hub](https://github.com/Sparkinman/task-hub), through Supernote Cloud and with no ADB. Nothing here serves them.
- **Other Supernote tools** stay separate unless a decision below brings their code in.

## Reuse

The author decided on 2026-11-10 to learn from [`supernote-mcp`](https://github.com/ridget/supernote-mcp) and [`inkbridge`](https://github.com/CRSiegfried/inkbridge), both MIT: their concepts, their code, or a direct integration with this command. Code copied from them is pinned in `upstreams.json` and credited in `NOTICE.md`.

Result ([#2](https://github.com/martonpaulo/supernote-adb/issues/2)): no code or integration is adopted. Two ideas stay: touch the tablet only when called, and leave transcription to the caller.

## Alternatives considered

Checked on 2026-11-10 with `own_projects.py`, `gh search repos` and web search. The App Store and browser stores were not checked, because the job needs a command-line tool on a computer. Detail is in [the research note](research/2026-11-existing-supernote-tools.md).

| Candidate | Found by | Why it was not used | Reopened when |
| :--- | :--- | :--- | :--- |
| `supernote-mcp` | web search | Sees the screen, reads notes and copies files over Wi-Fi. It cannot open a note or press a control. | It gains direct calls. |
| `inkbridge` | `gh search repos` | Sends documents and brings annotations back. Its supported path is a private cloud. | It gains an ADB transport. |
| `supynote`, `snbackup` | web search | List and copy files through Browse & Access. | They gain device control. |
| `ink2pic`, the author's plugin | `own_projects.py` | A plugin with one job. It cannot be called from a computer. | Never for this job. |

## Accepted evidence gaps

- **Accessibility:** this is a command-line tool with plain text and JSON output, so the code is the evidence.

## Evidence on hand

- [ADB on the Supernote](research/2026-11-adb-on-supernote.md)
- [Existing Supernote tools](research/2026-11-existing-supernote-tools.md)

There are no usage figures and no user reports yet.

Decision history is in [`decisions.md`](decisions.md).
