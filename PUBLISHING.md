# Publishing

## Pre-publish checklist

- [ ] `node --test test/refactor-smell.test.mjs` 全绿（25 例）
- [ ] `node --check scripts/refactor-smell.mjs` 通过
- [ ] `node --check scripts/arch-profile.mjs` 通过
- [ ] `node --check plugin/index.js` 通过
- [ ] `npm run test:compat` 通过（DSH 0.1.2-rc.1 / Node 22.19+；临时 profile add、dump-config、启动 smoke test）
- [ ] `npm pack --dry-run` 通过
- [ ] README / CHANGELOG / `docs/refactor-plan-template.md` / `skills/refactor-runbook/SKILL.md` 已同步本轮变更
- [ ] `package.json` 版本号已按 semver 更新
- [ ] `git tag vX.Y.Z` 已创建并推送

## Publish steps

```bash
# 1. 本地验证
npm test

# 2. 打 tag 并发布 GitHub Release
git tag v0.1.0
git push origin v0.1.0
gh release create v0.1.0 --title v0.1.0 --notes "See CHANGELOG.md"

# 3. 分发登记
#   - awesome-dsh-plugin data YAML：Git & Engineering / Code Review 分类
#   - awesome-deepseek-harness 条目
#   - Oh-My-DSH 自动同步

# 4. 安装验证
dsh plugin --profile web add github:duyanta123/dsh-refactor-insight#v0.1.0
```

既有 Node 18/22 CI 仅代表独立诊断脚本回归；最新 DSH 0.1.2-rc.1 宿主要求 Node >=22.19。

## Distribution

- DSH bundle patch：`cordis.patch.yml`（与 `package.json` 的 `dsh.bundle.patch` 配合使用）
- npm files：以 `package.json` 的 `files` 白名单为准（`plugin/`、`scripts/`、`skills/`、`docs/`、README、CHANGELOG、LICENSE、PUBLISHING）
- 红线：本包只发布只读诊断技能，不包含任何自动改码工具。
