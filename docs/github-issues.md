# GitHub Issues

GitHub issues are the only open-work tracker. Do not park follow-ups in docs,
commit messages, or scratch notes.

This file is the issue workflow contract. Skills must follow it. When a skill
and this file diverge, this file wins.

| Concern | Where |
| --- | --- |
| Product design | `docs/game-spec.md` |
| Numeric tuning | `src/game/config.ts` |
| Engine migration history | `docs/phaser-migration-plan.md` |
| Issue labels and Ready | this file |
| Checks and build | `README.md` |

Tracker: https://github.com/jordanmack/super-goomba-bros/issues

Dictation in this repo uses the same intake loop as `/rc-dictate-issues`:
research, group, review, then file. Do not implement during dictation.

## Ready (definition agents use)

An issue is **Ready** when it is:

1. **open**, and
2. labeled **`approved`**, and
3. **not** labeled **`needs-info`**.

Autonomous fix runs may work only Ready issues unless the operator overrides
policy for that run.

### Useful queries

```bash
# Ready
gh issue list --state open --label approved --search '-label:needs-info'

# Parking lot (tracked, not approved)
gh issue list --state open --label known-open

# Consciously deferred
gh issue list --state open --label known-open --label deferred

# Blocked
gh issue list --state open --label needs-info

# Auto-fix queue
gh issue list --state open --label auto-fix --label approved --search '-label:needs-info'
```

## Label set

### Workflow (load-bearing)

| Label | Meaning | Who mutates |
| --- | --- | --- |
| `approved` | Implementation is authorized | Trusted human, or agent **normalizing** a trusted body/comment approval into this label, or agent **filing under the auto-fix bar** (with `auto-fix`). Remove only if approval is revoked. |
| `needs-info` | Blocked on operator or external input | Agents add when blocked; clear when the answer is recorded. Strip on close. |
| `known-open` | Tracked but **not approved** (parking lot) | Anyone filing parking-lot work. **Remove when applying `approved`.** |
| `deferred` | Additive marker on parking: a write+ authority reviewed the issue and chose not now | Trusted human, or agent **normalizing** clear trusted deferral prose. **Never with `approved`.** Strip when promoting to `approved`. |
| `auto-fix` | Additive on authorized work: tiny, clearly valid work safe for unattended fix | Agents at file time or by unblock retrofit when the auto-fix bar holds; trusted human anytime. **Never with `known-open` or `deferred`.** Not a Ready substitute by itself. |
| `in-progress` | Claimed by an active fix run | The fix-skill orchestrator only. Strip when that run stops working the issue. |

Steady state: an issue has **`known-open` or `approved`**, not both.

`deferred` is not a third exclusive status. It is an optional annotation on
`known-open`. Unreviewed parking is `known-open` alone. Consciously deferred
parking is `known-open` + `deferred`.

Pipeline:

```
file (known-open)
  → approve (approved, drop known-open and deferred) → Ready if not needs-info
  → defer   (add deferred; keep known-open)
  → needs-info (blocked) until cleared
file auto-fix (approved + auto-fix; no known-open) → Ready if not needs-info
```

### Type (optional; never gate Ready)

| Label | Meaning |
| --- | --- |
| `bug` | Defect |
| `enhancement` | New capability or improvement |
| `documentation` | Docs-only work |

Use at most one of `bug` | `enhancement` | `documentation` when the type is
clear. Unused GitHub defaults (`duplicate`, `good first issue`, `help wanted`,
`invalid`, `question`, `wontfix`, `accessibility`) are out of scope; do not
auto-apply them.

Do not invent new labels. Update this file first.

## Approval

### Signals (any one is enough)

From a **trusted** author:

- the **`approved`** label, or
- clear approval in the **issue body**, or
- clear approval in a **comment**

Clear examples: "approved", "approved to implement", "you may fix this", "go
ahead and implement". Completing the dictation loop in the operator's session,
posted via their write+ `gh` account, is also a trusted approval signal.
Ambiguous discussion is not approval.

**Exception:** an agent may apply **`approved`** together with **`auto-fix`**
when the auto-fix bar holds: at file time, or as an unblock-pass retrofit on an
existing `known-open` issue.

### Trust

The author must have **write (push) or higher** on this repository when the
signal is made. Posts made via `gh` as a trusted account count as that account.

| Account | Role |
| --- | --- |
| `jordanmack` | Primary operator / maintainer |

GitHub permissions remain the enforcement source of truth.

### Normalize prose approval to the label

When an agent sees trusted approval only in body or comment and `approved` is
missing:

1. Treat the issue as approved for this decision.
2. Add **`approved`**.
3. Remove **`known-open`** and **`deferred`** if present.
4. If already editing the issue, strip status parentheticals from the title.

## Deferral

### Signals (any one is enough)

From a **trusted** author:

- the **`deferred`** label, or
- clear, issue-directed deferral in the **issue body**, or
- clear, issue-directed deferral in a **comment**

Clear examples: "deferred", "formally deferred", "reviewed; not now", "park this
deliberately". Casual "later maybe" is not enough.

Trust is the same as Approval: write (push) or higher when the signal is made.

### Normalize prose deferral to the label

When an agent sees trusted, issue-directed deferral and `deferred` is missing:

1. Ensure the issue is parking-lot work: add **`known-open`** if missing and
   **`approved` is absent**.
2. Add **`deferred`**.
3. Do not remove `known-open`.
4. Never set `deferred` together with `approved`.

## Filing

### Parking path

1. Open a GitHub issue (not only a doc note or commit body).
2. Apply **`known-open`** until approved.
3. If a write+ authority is filing a conscious "not now" decision at open time,
   also apply **`deferred`**.
4. Prefer a type label when obvious.
5. Title describes the work; no status parentheticals. Status lives in labels.

### Approved path (dictation)

When the operator settles an issue in the dictation loop:

1. Open a GitHub issue.
2. Apply **`approved`**. Never also `known-open`.
3. Prefer a type label when obvious.
4. Title describes the work; no status parentheticals.
5. Body via a private `mktemp` file (`gh issue create --body-file`; then delete
   the temp). Include problem, acceptance criteria, evidence, dependencies
   (`blocked by #N`), and estimated scope (`small` or `regular` plus a one-line
   reason; hint only). If you still disagree after they overrule, one line of
   dissent.

### Auto-fix path

When a follow-up meets the auto-fix bar at file time:

1. Open a GitHub issue.
2. Apply **`approved`** and **`auto-fix`**. Do not apply `known-open` or
   `deferred`.
3. Prefer a type label when obvious.
4. Title describes the work; no status parentheticals.
5. Body should state the problem, acceptance criteria, and (when known) the
   source issue (`Found while fixing #N`) plus a one-line reason the bar holds.

If unsure whether the bar holds, use the parking path.

### Auto-fix bar

The bar definition lives in the generic `gh-fix-issues` skill ("Auto-fix bar
(default)"). This repo uses that default without override. Intent in four
words: clear outcome, small scope, safe zone, not blocked.

The same bar governs retrofit: an unblock pass may promote an existing
`known-open` issue to `approved` + `auto-fix` when the bar holds, with a
comment stating the one-line bar reason.

## Agent mutation rules

| Action | Allowed? |
| --- | --- |
| Add / remove `needs-info` | Yes |
| File follow-ups with `known-open` | Yes |
| File follow-ups with `approved` + `auto-fix` when the auto-fix bar holds | Yes |
| Retrofit `approved` + `auto-fix` on an existing `known-open` issue when the bar holds | Yes |
| Normalize trusted body/comment → `approved` + clear `known-open` and `deferred` | Yes |
| Normalize trusted body/comment → `deferred` on `known-open` | Yes |
| Set `approved` with no trusted signal | **No** (exception: the auto-fix bar, at file time or unblock retrofit; dictation filing in the operator's session) |
| Set `deferred` with no trusted signal | **No** |
| Add `auto-fix` to an existing issue without the bar | **No** |
| Set type when filing a clear follow-up | Yes |
| Close fixed issues; strip `needs-info` on close | Yes |
| Invent new labels | **No** (update this file first) |

## Related

- [Docs index](README.md)
- [Game spec](game-spec.md)
- [Phaser migration plan](phaser-migration-plan.md)
