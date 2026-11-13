# 150cn.com-auto-sign

有益网络免费挂机宝自动签到／延期，使用 Playwright 驱动 Chromium，通过网页登录和点击免费延期表单执行，支持 GitHub Actions 每日运行与手动触发。

[aff](https://www.150cn.com/?tid=442751) 实名换一个 0.1c 512m 31g(说的1g实际是30+1) 挂机宝可以自己 dd linux

**登录成功、正常完成续期尝试即为运行成功。** 延期成功、今日已续费、明确的未到续费时间提示，以及没有免费延期目标，均返回退出码 `0`；登录失败、需要额外验证、网络故障、HTTP 错误、页面改版、原因不明的失败或未知结果返回 `1`。不使用 `continue-on-error` 掩盖技术问题。

## GitHub Actions 配置

1. 将代码放入自己的 GitHub 仓库，或 Fork 后在 **Actions** 页面启用工作流。
2. 在 **Settings → Secrets and variables → Actions → Secrets** 添加以下 Repository Secrets：

   | Secret          | 含义                     |
   | --------------- | ------------------------ |
   | `SITE_USERNAME` | 网站用户名／手机号／邮箱 |
   | `SITE_PASSWORD` | 网站登录密码，保持原样   |

3. 在 **Actions → Auto Sign → Run workflow** 手动验证一次，在运行日志与 Summary 中查看结果。确保代码位于仓库默认分支，定时事件才会执行。

站点地址内置为 `https://www.150cn.com`，无需配置。只需提供上面的两个账号密码 Secrets，其他运行参数均可使用默认值。

### Telegram 推送

本地与 GitHub Actions 使用相同的环境变量名称；在 Actions 中配置为 Repository Secrets：

| Secret               | 含义                                                       |
| -------------------- | ---------------------------------------------------------- |
| `TELEGRAM_BOT_TOKEN` | Telegram Bot Token                                         |
| `TELEGRAM_CHAT_ID`   | 接收消息的用户、群组或频道 ID                              |
| `TELEGRAM_PROXY_URL` | 可选，仅用于 Telegram 的代理地址，支持 HTTP、HTTPS、SOCKS5 |

同时提供 Token 和 Chat ID 即启用通知，不配置则跳过。每次运行结束发送一条包含运行状态、登录和免费延期结果的脱敏摘要，登录或配置失败也会通知。通知使用纯文本并关闭链接预览，过长的摘要会截断，完整结果仍可在运行日志中查看。

通知失败会在日志和 Actions Summary 中明确提示，但保留签到本身的退出码，不会重新登录或重复提交延期，也不自动重发通知。请勿因为推送失败就重跑整个签到流程。

默认每天 **08:17（Asia/Singapore，与北京时间相同）** 运行，即 UTC `00:17`。修改时间请编辑 `.github/workflows/auto-sign.yml` 的 `schedule.cron`；GitHub 的 cron 不支持读取 Variables，可能有调度延迟，不能保证准点执行。每天运行可在三天续期窗口内保留重试余量；程序不会自动重试已提交的延期请求。

可选 Variables（未设置时使用默认值）：

| Variable              | 默认值  | 限制                                                                |
| --------------------- | ------- | ------------------------------------------------------------------- |
| `BROWSER_HEADLESS`    | `true`  | `true` / `false`；Actions 保持 `true`，`false` 用于有桌面的本地调试 |
| `BROWSER_TIMEOUT_MS`  | `30000` | 每次页面操作最长等待，整数 `1000`–`120000` 毫秒                     |
| `ACTION_DELAY_MIN_MS` | `500`   | 操作前随机间隔下限，整数 `0`–`60000` 毫秒                           |
| `ACTION_DELAY_MAX_MS` | `1500`  | 随机间隔上限，不小于下限，整数 `0`–`60000` 毫秒                     |

账号密码只在运行步骤注入，不提供代码内凭据回退；服务器 ID 从列表动态读取，无需配置。路径和选择器属于网站适配逻辑，站点改版时需要更新代码。

## 工作方式

- 每次创建独立浏览器会话，通过登录表单输入账号密码并点击登录，以管理中心地址和退出链接确认认证完成。
- 打开服务器列表，发现所有免费延期入口并按 ID 去重；不点击“付费续费”、不领取新机器、不操作已有机器的系统或配置。
- 每台提交前核对同源免费表单、服务器 ID、费用为零，以及按钮实际提交地址、方法和窗口，然后点击“服务器延期”。识别站点结果提示，并在多台机器间独立处理；一台发生技术问题时继续其余机器，最终运行仍报错。
- 日志与 Summary 只包含固定状态、数量和安全诊断，不输出网页原文、账号密码、Cookie、机器远程连接信息；不保存截图、HTML、trace 或登录会话。

浏览器操作与简短随机间隔用于按网页正常流程执行，不能保证不会触发站点验证。遇到验证码或额外身份验证会失败退出，需要自行登录处理后重新运行。

## 辅助工作流

| 文件                     | 用途                                                                                         |
| ------------------------ | -------------------------------------------------------------------------------------------- |
| `auto-sign.yml`          | 每日／手动签到，10 分钟超时，同仓库内串行运行                                                |
| `code-check.yml`         | push、PR 和手动触发，检查格式、lint、依赖漏洞、浏览器测试和 Actions 语法；不需要网站 Secrets |
| `keepalive.yml`          | 每月 1、15 日调用 GitHub API 重新启用自动签到与自身，不产生空提交                            |
| `.github/dependabot.yml` | 每周检查 npm 依赖及固定 SHA 的 GitHub Actions 更新                                           |

主工作流只有 `contents: read`；保活单独使用 `actions: write`。若仓库／组织策略限制令牌权限，保活可能被拒绝，日志会明确报错。GitHub 公共仓库连续 60 天无活动可能停用定时工作流；若两个定时工作流均已停用，需到 Actions 页面手动启用。保活不能恢复被管理员、组织策略或平台禁用的 Actions 服务。

这是直接由 Actions 运行的脚本，无发布构建产物，因此没有添加 Release 工作流。

## 本地运行

使用 Node.js 24（见 `.node-version`）和 `package.json` 中固定的 pnpm 版本：

```powershell
corepack enable
pnpm install --frozen-lockfile --ignore-scripts
pnpm exec playwright install chromium
Copy-Item .env.example .env
# 在 .env 中填写自己的账号密码，文件已加入 .gitignore。
pnpm start:local
```

Linux 首次安装浏览器使用 `pnpm exec playwright install --with-deps chromium`。已经通过进程环境提供配置时，直接运行 `pnpm start`。不要把密码写入脚本、工作流 YAML、命令行参数或提交历史。

本机现有 Codex 定时任务继续调用原来的入口：

```powershell
pwsh -NoProfile -File "$env:LOCALAPPDATA\150cn-auto-sign\run.ps1"
```

该入口委托给仓库中的 `scripts/run-local.ps1`：网站账号继续从当前 Windows 用户 DPAPI 加密的 `site-credential.xml` 读取；Telegram 配置优先使用当前进程环境，缺失时读取同名 Windows 用户环境变量，只在运行期间注入并在结束后恢复。没有显式提供 `TELEGRAM_PROXY_URL` 时，使用已启用的 Windows 系统 HTTP/HTTPS 代理，仅影响 Telegram 请求，不改变网站访问路径。不需要复制速维云项目的账号配置或在本项目保存 Telegram Token。

其他 Windows 机器如果已准备好自己的 DPAPI 凭据文件，也可直接运行 `pwsh -NoProfile -File scripts/run-local.ps1 -CredentialPath <凭据文件路径>`。普通的 `pnpm start` / `pnpm start:local` 使用进程环境或 `.env` 中相同的 Telegram 变量名称；代理需通过 `TELEGRAM_PROXY_URL` 显式提供。

## 开发验证

```sh
pnpm verify
pnpm audit --audit-level=high --registry=https://registry.npmjs.org
actionlint -shellcheck= -pyflakes= .github/workflows/*.yml
```

测试使用临时本地 HTTP／HTTPS 站点和真实 Chromium，覆盖正常登录、错误凭据、业务拒绝、零目标、多台与重复目标、技术失败、收费表单保护、一次提交语义、CLI 退出码和安全 Summary。HTTPS 测试证书在内存生成；仅测试启动钩子接受该临时证书，正式代码保持证书验证。

2026-11-03 已通过浏览器在真实站点验证登录及免费延期提交，站点返回“今日已经续费过了！”。最终 CLI 通过本地站点验证；携带真实凭据的 CLI 执行被当前环境自动批准检查拒绝（`blocked by policy`）。本地验证不等同于 GitHub 托管 runner 实测；本次按要求不推送，首次 Actions 实跑需要在仓库配置完成后手动触发。

排障时先看错误阶段：配置错误检查 Secrets／Variables；登录失败检查凭据和额外验证；HTTP／连接错误检查站点可达性；未知页面或结果需更新网站适配。技术故障后不确认原请求结果就不要盲目反复提交。
