# 验证记录

日期：2026-11-03，Asia/Singapore。

## 已执行

- 配置与浏览器适配实现前分别运行测试，确认缺失实现时失败；实现后通过。
- `pnpm verify`：格式、ESLint 和 49 项测试全部通过。浏览器测试使用真正 Chromium；CLI 测试启动独立 Node 子进程，通过临时 HTTPS 站点验证退出码与 Actions Summary。
- Node.js 24.22.2：完整测试套件 49 项通过；本机 Node.js 22.21.0 同样通过。
- `pnpm install --frozen-lockfile --ignore-scripts`：锁文件一致。
- `pnpm audit --audit-level=moderate --registry=https://registry.npmjs.org`：没有已知漏洞。ESLint 的 minimatch 间接依赖通过有注释的 override 锁定修复版本。
- `actionlint` 1.7.12：三个工作流通过语法与表达式检查。
- `git diff --check`：通过；项目文件未发现真实账号。`.env`、本地会话与临时验证文件均不纳入版本控制。
- 对照官方 GitHub 标签核对 checkout、setup-node、setup-go、pnpm/action-setup 的完整 SHA。

## 独立审查与回归

全新上下文的只读分支审查发现两项 Important，均完成修复：

1. 表单按钮覆盖提交地址／方法／目标：四项测试在修复前失败，修复后阻止付费地址、外部地址、GET 覆盖和新窗口提交；有效的免费 POST 覆盖仍可正常执行。
2. 技术失败误判业务拒绝：登录失效、网络超时、原因不明的失败和否定成功提示在修复前被错误判定；修复后返回技术错误。CLI 对登录失效和网络超时提示的测试从退出 `0` 的失败状态变为退出 `1`。明确的续期时间限制和今日已续费仍正常成功。

没有未修复的 Critical／Important，没有延期处理的 Minor 或搁置项。

## 真实站点与运行边界

真实浏览器 UI 已成功登录网站，从服务器列表发现免费延期入口，检查零费用表单并点击提交，站点返回“今日已经续费过了！”。没有创建付费订单，没有变更机器配置，没有保存页面、截图、Cookie 或登录会话。

携带真实凭据的最终 CLI 执行被当前环境自动批准检查拒绝（`blocked by policy`），具体原因未提供。改用仅向子进程传递环境的方式也被拒绝，之后未再尝试。最终 CLI 已通过本地站点验证，但不声称已在真实站点执行最终 CLI。

按用户要求仅本地原子提交，未推送。GitHub 托管 runner 上的网络可达性、真实凭据登录及工作流保活 API 权限，需要用户把代码放入仓库、配置 Secrets／Variables 后手动执行一次 Auto Sign 和 Keep Scheduled Workflows Active 验证；本次不声称这些远程工作流已经运行。
