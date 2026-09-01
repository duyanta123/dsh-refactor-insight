# dsh-refactor-insight

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![DeepSeek Harness](https://img.shields.io/badge/DeepSeek%20Harness-plugin-4c1d95)](https://github.com/topics/dsh-plugin)
[![version](https://img.shields.io/badge/version-0.1.1-green)](CHANGELOG.md)

DSH 技能插件：把代码库的坏味道转成**带定位、优先级和依赖顺序的可执行重构计划**——结构健康体检，而非 diff 审查。

`Turn codebase smells into an executable, priority-ordered refactoring plan.`

## 能力（v0）
六条确定性坏味道规则（阈值均可参数覆盖，零依赖启发式）：
- **超长文件**（默认 > 400 行）
- **深嵌套**（默认最大缩进 / 花括号深度 > 5）
- **TODO/FIXME 密度**（噪音指标，输出每千行计数）
- **长函数**（Python 缩进块 / JS-TS 花括号配对 / Go 函数声明，函数体 > 80 行）
- **上帝对象**（类方法数 > 10 或类体行数 > 300 / Go 接收者方法数）
- **高耦合模块**（复用 `arch-profile --deps` 输出，按入度/出度识别 hub 模块 + Tarjan 环检测）
- 只输出计划、不自动改代码；高风险重构项由 LLM 标注、须人工确认。

脚本只给硬事实（确定性扫描），严重度 / 成本 / 建议动作由 LLM 精修真误报后标注推断。

## 快速开始

**在 DSH 中使用**

1. 安装插件：`dsh plugin --profile web add github:duyanta123/dsh-refactor-insight`
   - 发布 v0.1.0 tag 后，可改为 `github:duyanta123/dsh-refactor-insight#v0.1.0` 锁定版本。
2. 使用：对 Agent 说「用 refactor-insight 体检 /path/to/repo」
3. 输出：按 `docs/refactor-plan-template.md` 生成 `REFACTOR-PLAN.md`。

**只跑诊断 CLI（零依赖，不经过 DSH 也能跑）**

```bash
# 六条规则诊断
node scripts/refactor-smell.mjs <repo_path>

# 复用 arch-profile 的依赖输出做高耦合/环检测
node scripts/arch-profile.mjs <repo_path> --deps > deps.json
node scripts/refactor-smell.mjs <repo_path> --deps-json deps.json
```

主要参数：`--max-lines`、`--max-func-lines`、`--max-nesting`、`--max-methods`、`--max-class-lines`、`--max-coupling`、`--max-depth`、`--include-dirs`、`--exclude-dirs`。

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

## 目录结构

```text
dsh-refactor-insight/
├── package.json                  # npm 包 + dsh.bundle.patch
├── cordis.patch.yml              # DSH bundle patch
├── plugin/index.js               # ESM 入口，注册 skills/ 为技能根
├── skills/refactor-runbook/SKILL.md  # 技能 frontmatter + 阶段执行 runbook
├── docs/refactor-plan-template.md    # 输出报告骨架
├── scripts/arch-profile.mjs      # 复用：probe/scan/deps/entry（零依赖）
├── scripts/refactor-smell.mjs    # 坏味道诊断器（六条规则，--deps-json 复用 arch-profile deps）
└── test/                         # node --test 测试 + fixtures
```

## 本地开发

1. profile 的 package.json 加 `"dsh-refactor-insight": "file:<本地路径>/dsh-refactor-insight"`，bundles 加 `"dsh-refactor-insight"`。
2. 测试：`npm test`
3. 打包检查：`npm pack --dry-run`

## 输出

- `REFACTOR-PLAN.md`：结构化重构计划（按 `docs/refactor-plan-template.md` 骨架）