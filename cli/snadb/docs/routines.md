# Routines

Type: reference

The routines this project keeps. The owner decides when a run on request happens.

## Always on

| Routine | Where |
| :--- | :--- |
| `make validate` on each push and pull request | `.github/workflows/validate-snadb.yml` (repository root) |
| Updates for the GitHub Actions in use | `.github/dependabot.yml` (repository root) |
| Secret scanning and push protection | repository settings |
| Commit checks for private data and message form | the Skill Deck `pre-commit` and `commit-msg` hooks |

## When an event happens

| Event | Routine |
| :--- | :--- |
| The tablet's firmware changes | Check the commands on the device, and update the firmware the README names. Start with `snadb doctor`. |
| Code is copied from another project | Pin it in `upstreams.json`, credit it in `NOTICE.md`, and add the weekly upstream check. |
| A large change is planned | Run `project-audit` first. |

A check on the device changes the tablet only on the owner's yes.

## On the owner's request

| Routine | What it does |
| :--- | :--- |
| `project-groom` | Keeps the repository aligned with its baseline and the backlog healthy. |
| `project-audit` | Reviews the whole project and ranks the findings. |

## Not adopted

| Routine | Reason | Reopened when |
| :--- | :--- | :--- |
| Cloud sessions | Most work needs the tablet, which a cloud session cannot reach. | The owner adds the project to the cloud list. |
| Vulnerability scan | The project has no dependency a scanner reads. | The project gains a dependency. |
| Releases and a landing page | The project is unversioned and its README is its public page. | The project is distributed another way. |
