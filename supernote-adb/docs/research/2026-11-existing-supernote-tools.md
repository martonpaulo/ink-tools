# Existing Supernote tools

Status: current

Checked 2026-11-10 from each project's public README or listing. This note answers two questions: does a tool already do this job, and what can this project reuse?

## Agent and device control

| Tool | License | What it does | How it reaches the tablet | What to reuse |
| :--- | :--- | :--- | :--- | :--- |
| [`supernote-mcp`](https://github.com/ridget/supernote-mcp) | MIT | An MCP server: live screen, read notebooks, upload and download files. | Screen Mirroring and Browse & Access, over Wi-Fi. | The MCP tool shape, and touching the device only when a tool is called. |
| [`inkbridge`](https://github.com/CRSiegfried/inkbridge) | MIT | A CLI and MCP server: send documents, bring annotations back, chain PDFs. | Private cloud today, behind a `Transport` protocol. | The `Transport` seam and its conformance suite, the annotation round trip, and leaving transcription to the caller. |
| [`sn-tcp-tunnel`](https://github.com/gorlix/sn-tcp-tunnel) | not checked | A plugin that tunnels ADB over TCP with `socat`. | A plugin on the tablet. | A route that may survive a restart of the tablet. |

No tool found opens a note at a page, asks for a sync, or presses a control by name.

## Files and notes

| Tool | What it does |
| :--- | :--- |
| [`supynote`](https://github.com/thopiax/supynote) | Finds the tablet on the network, lists files and converts notes. |
| [`snbackup`](https://pypi.org/project/snbackup/) | Backs up notes and uploads files through Browse & Access. |
| [`supernote-tool`](https://github.com/jya-dev/supernote-tool) | Converts `.note` files to PNG, PDF, SVG or text. |
| [`allenporter/supernote`](https://github.com/allenporter/supernote) | Parses notebooks and hosts a private cloud replica. |

## Writing note files

`supernote-tool` 0.7.3 was tried on a public Manta sample from [`supernote-typescript`](https://github.com/philips/supernote-typescript/tree/main/tests/input):

- `reconstruct` shrank the file from 104,913 to 90,286 bytes and dropped the page's recognition block.
- `merge` of the sample with itself failed with `IndexError: layer number out of range: 0`.
- It has no code that creates strokes, text or images.

So a `.note` file should not be rewritten on a computer.

## Limits of this note

- `supynote` and `snbackup` were read from search summaries only.
- None of these tools was run against a tablet.
