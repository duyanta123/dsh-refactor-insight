# dsh-refactor-insight

[English](README.md) | 简体中文

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![DeepSeek Harness](https://img.shields.io/badge/DeepSeek%20Harness-plugin-4c1d95)](https://github.com/topics/dsh-plugin)
[![CI](https://github.com/duyanta123/dsh-refactor-insight/actions/workflows/ci.yml/badge.svg)](https://github.com/duyanta123/dsh-refactor-insight/actions/workflows/ci.yml)
[![version](https://img.shields.io/badge/version-0.1.3-green)](CHANGELOG.md)

DSH 技能插件：把代码库的坏味道转成**带定位、优先级和依赖顺序的可执行重构计划**——结构健康体检，而非 diff 审查。

> Turn codebase smells into an executable, priority-ordered refactoring plan.

## 定位

与同类工具错位互补：arch-doc 看整库结构（理解现状），现有 code review 类工具看 PR/diff（把关变更），本插件看**整库坏味道**（输出行动计划）。

它回答：
- 哪些文件、函数、类超出了健康阈值（长度 / 嵌套 / 方法数）？
- 哪些模块耦合过高、是否存在依赖环？
- 问题项的严重度和修复成本怎么排优先级？
- 重构应该按什么依赖顺序做？

边界（红线）：**只输出计划、不自动改代码**；高风险重构项由 LLM 标注、须人工确认。脚本只给硬事实（确定性扫描，六条规则阈值均可参数覆盖），严重度 / 成本 / 建议动作由 LLM 精修误报后标注推断。

## 能力（v0）

六条确定性坏味道规则（零依赖启发式）：

- **超长文件**（默认 > 400 行）
- **长函数**（Python 缩进块 / JS-TS 花括号配对 / Go 函数声明，函数体 > 80 行）
- **深嵌套**（默认最大缩进 / 花括号深度 > 5）
- **上帝对象**（类方法数 > 10 或类体行数 > 300 / Go 接收者方法数）
- **高耦合模块**（复用 `arch-profile --deps` 输出，按入度/出度识别 hub 模块 + Tarjan 环检测）
- **TODO/FIXME 密度**（噪音指标，输出每千行计数）

## 安装

作为 DSH 插件（推荐）：

```bash
dsh plugin --profile web add "github:duyanta123/dsh-refactor-insight#v0.1.3"
```

或从 npm 安装：

```bash
npm install dsh-refactor-insight
```

兼容性分层：独立诊断脚本（`refactor-smell.mjs` / `arch-profile.mjs`）可运行在 Node.js >= 18；作为 DSH 0.1.5-rc.2 插件验证统一使用 Node.js >= 22.19。运行 `npm run test:compat` 可执行隔离 profile 的 add、dump-config 和启动 smoke test。

本地开发：profile 的 package.json 加 `"dsh-refactor-insight": "file:<本地路径>/dsh-refactor-insight"`，bundles 加 `"dsh-refactor-insight"`。

## 快速开始

### 1. 作为 DSH 技能使用

安装后重启 profile，对 Agent 说：

```text
用 refactor-insight 体检 /path/to/repo
```

技能按四阶段 runbook 执行（受理 → 扫描 → 诊断 → 排序编排），按 [docs/refactor-plan-template.md](docs/refactor-plan-template.md) 骨架生成 `REFACTOR-PLAN.md`。

### 2. 只跑诊断 CLI（零依赖，不经过 DSH 也能跑）

```bash
# 六条规则诊断
node scripts/refactor-smell.mjs <repo_path>

# 复用 arch-profile 的依赖输出做高耦合/环检测
node scripts/arch-profile.mjs <repo_path> --deps > deps.json
node scripts/refactor-smell.mjs <repo_path> --deps-json deps.json
```

## CLI 参数

| 参数 | 默认 | 说明 |
| --- | --- | --- |
| `--max-lines <N>` | 400 | 超长文件阈值（行） |
| `--max-func-lines <N>` | 80 | 长函数阈值（函数体行数） |
| `--max-nesting <N>` | 5 | 深嵌套阈值（缩进/花括号深度） |
| `--max-methods <N>` | 10 | 上帝对象阈值（类方法数） |
| `--max-class-lines <N>` | 300 | 上帝对象阈值（类体行数） |
| `--max-coupling <N>` | 4 | 高耦合模块阈值（入度/出度） |
| `--max-depth <N>` | 4 | 目录扫描深度（1–10） |
| `--include-dirs <a,b>` | - | 只分析这些目录 |
| `--exclude-dirs <a,b>` | - | 额外排除目录 |
| `--deps-json <file>` | - | 复用 `arch-profile --deps` 的输出做耦合/环检测 |

示例输出（节选）：

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

## 输出

`REFACTOR-PLAN.md`：结构化重构计划，固定骨架为概览摘要 → 问题清单表（位置/类型/证据/严重度/成本/建议动作/风险）→ 优先级排序 → 依赖顺序编排 → 附录（规则阈值、扫描范围、生成时间）。

## 安全边界

- **只输出计划**：不生成 diff、不自动改代码；高风险重构项必须人工确认。
- **只读扫描**：诊断脚本零依赖、无子进程、无网络，不修改目标仓库源码。
- **事实与推断分离**：脚本输出硬事实，LLM 补充的严重度/成本/建议均标注为推断。

## 排障

**高耦合/环检测没有输出？**
该规则依赖依赖图输入：先跑 `node scripts/arch-profile.mjs <repo_path> --deps > deps.json`，再用 `--deps-json deps.json` 传入（见「快速开始」）。

**诊断结果里混着误报？**
设计如此：脚本只给确定性硬事实，误报精修交给 runbook 中的 LLM 阶段（逐条核对并补充上下文）；CLI 单独使用时以 `severity` 与 `evidence` 字段自行判断。

**TODO/FIXME 密度告警很多？**
该规则是噪音指标（仅输出每千行计数），不代表必须处理；在报告排序中权重最低。

**升级 DSH 宿主到 0.1.5 系后旧会话打不开？**
Session format V3 迁移不可逆，属宿主行为；升级宿主前请先备份会话日志（见 [CHANGELOG.md](CHANGELOG.md) 0.1.3 条目）。

## 文档

- [docs/refactor-plan-template.md](docs/refactor-plan-template.md) — `REFACTOR-PLAN.md` 输出骨架
- [CHANGELOG.md](CHANGELOG.md) — 版本变更记录
- [PLUGIN-MAINTENANCE.md](PLUGIN-MAINTENANCE.md) — 本仓维护规则
- [DSH-REFACTOR-INSIGHT-开发计划.md](DSH-REFACTOR-INSIGHT-开发计划.md) — 设计决策与迭代历史

## License

[MIT](./LICENSE)
