# dsh-refactor-insight

English | [简体中文](README.zh-CN.md)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![DeepSeek Harness](https://img.shields.io/badge/DeepSeek%20Harness-plugin-4c1d95)](https://github.com/topics/dsh-plugin)
[![CI](https://github.com/duyanta123/dsh-refactor-insight/actions/workflows/ci.yml/badge.svg)](https://github.com/duyanta123/dsh-refactor-insight/actions/workflows/ci.yml)
[![version](https://img.shields.io/badge/version-0.1.3-green)](CHANGELOG.md)

A DSH skill plugin: turns codebase smells into an **executable refactoring plan with locations, priorities, and dependency ordering** — a structural health check, not a diff review.

> Turn codebase smells into an executable, priority-ordered refactoring plan.

## Positioning

Complementary by design: arch-doc looks at whole-repo structure (understanding the current state), existing code-review tools look at PRs/diffs (gating changes), and this plugin looks at **whole-repo smells** (outputting an action plan).

It answers:
- Which files, functions, and classes exceed healthy thresholds (length / nesting / method count)?
- Which modules are too coupled, and are there dependency cycles?
- How should findings be prioritized by severity and fix cost?
- In what dependency order should the refactoring proceed?

Boundaries (red lines): **outputs a plan only — never modifies code automatically**; high-risk refactoring items are flagged by the LLM and require human confirmation. The script only yields hard facts (deterministic scanning, all six rule thresholds overridable); severity / cost / suggested actions are added by the LLM after pruning false positives, marked as inference.

## Capabilities (v0)

Six deterministic smell rules (zero-dependency heuristics):

- **Oversized files** (default > 400 lines)
- **Long functions** (Python indent blocks / JS-TS brace pairing / Go function declarations; body > 80 lines)
- **Deep nesting** (default max indent / brace depth > 5)
- **God objects** (> 10 class methods or class body > 300 lines / Go receiver method count)
- **Highly coupled modules** (reuses `arch-profile --deps` output; hub modules by in/out degree + Tarjan cycle detection)
- **TODO/FIXME density** (noise metric, reported per 1k lines)

## Installation

As a DSH plugin (recommended):

```bash
dsh plugin --profile web add "github:duyanta123/dsh-refactor-insight#v0.1.3"
```

Or from npm:

```bash
npm install dsh-refactor-insight
```

Compatibility tiers: the standalone diagnostic scripts (`refactor-smell.mjs` / `arch-profile.mjs`) run on Node.js >= 18; as a DSH 0.1.5-rc.2 plugin it is verified with Node.js >= 22.19. Run `npm run test:compat` to execute an isolated-profile add, dump-config, and startup smoke test.

Local development: add `"dsh-refactor-insight": "file:<local-path>/dsh-refactor-insight"` to the profile's package.json and `"dsh-refactor-insight"` to the bundles array.

## Quick Start

### 1. Use as a DSH skill

After installing, restart the profile and tell the agent:

```text
Use refactor-insight to health-check /path/to/repo
```

The skill runs a four-phase runbook (intake → scan → diagnose → prioritize & orchestrate) and generates `REFACTOR-PLAN.md` following the [docs/refactor-plan-template.md](docs/refactor-plan-template.md) skeleton.

### 2. Run only the diagnostic CLI (zero dependencies, works without DSH)

```bash
# All six rules
node scripts/refactor-smell.mjs <repo_path>

# Reuse arch-profile's dependency output for coupling/cycle detection
node scripts/arch-profile.mjs <repo_path> --deps > deps.json
node scripts/refactor-smell.mjs <repo_path> --deps-json deps.json
```

## CLI Options

| Option | Default | Description |
| --- | --- | --- |
| `--max-lines <N>` | 400 | Oversized file threshold (lines) |
| `--max-func-lines <N>` | 80 | Long function threshold (body lines) |
| `--max-nesting <N>` | 5 | Deep nesting threshold (indent/brace depth) |
| `--max-methods <N>` | 10 | God object threshold (class method count) |
| `--max-class-lines <N>` | 300 | God object threshold (class body lines) |
| `--max-coupling <N>` | 4 | High-coupling threshold (in/out degree) |
| `--max-depth <N>` | 4 | Directory scan depth (1–10) |
| `--include-dirs <a,b>` | - | Analyze only these directories |
| `--exclude-dirs <a,b>` | - | Extra excluded directories |
| `--deps-json <file>` | - | Reuse `arch-profile --deps` output for coupling/cycle detection |

Sample output (excerpt):

```json
{
  "language": "javascript/typescript",
  "smells": [
    {
      "rule": "god-object",
      "type": "god_object",
      "path": "src/lib/GodService.js",
      "name": "GodService",
      "methods": 12,
      "threshold": 10,
      "severity": 2,
      "cost": "M"
    }
  ]
}
```

## Output

`REFACTOR-PLAN.md`: a structured refactoring plan with the fixed skeleton of summary → findings table (location/type/evidence/severity/cost/suggested action/risk) → priority ordering → dependency-ordered orchestration → appendix (rule thresholds, scan scope, generation time).

## Safety Boundaries

- **Plan only**: no diffs generated, no automatic code changes; high-risk items require human confirmation.
- **Read-only scanning**: the diagnostic scripts have zero dependencies, no subprocesses, no network, and never modify the target repo's source.
- **Facts vs. inference**: the script emits hard facts; severity/cost/suggestions added by the LLM are always marked as inference.

## Troubleshooting

**No coupling/cycle findings?**
That rule needs a dependency graph as input: run `node scripts/arch-profile.mjs <repo_path> --deps > deps.json` first, then pass it via `--deps-json deps.json` (see Quick Start).

**The findings include false positives?**
By design: the script emits deterministic hard facts, and false-positive pruning is the LLM's job in the runbook phase (checked one by one with added context); when using the CLI alone, judge by the `severity` and `evidence` fields.

**Many TODO/FIXME density findings?**
That rule is a noise metric (per-1k-line counts only) and does not require action; it carries the lowest weight in plan ordering.

**Old sessions won't open after upgrading the DSH host to 0.1.5.x?**
The Session format V3 migration is irreversible and is host behavior; back up session logs before upgrading the host (see the 0.1.3 entry in [CHANGELOG.md](CHANGELOG.md)).

## Documentation

- [docs/refactor-plan-template.md](docs/refactor-plan-template.md) — the `REFACTOR-PLAN.md` output skeleton
- [CHANGELOG.md](CHANGELOG.md) — release notes
- [PLUGIN-MAINTENANCE.md](PLUGIN-MAINTENANCE.md) — repo maintenance runbook
- [DSH-REFACTOR-INSIGHT-开发计划.md](DSH-REFACTOR-INSIGHT-开发计划.md) — design decisions and iteration history

## License

[MIT](./LICENSE)
