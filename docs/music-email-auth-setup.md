# Music MVP 邮箱验证码登录配置（暂不用于 Demo）

> Demo 当前不提供邮箱登录。Staging 默认将邮箱发码、验证和登出接口关闭（返回 `410 EMAIL_LOGIN_DISABLED`），首次访问由服务端分配随机匿名账号，并通过一年期 HttpOnly Cookie 在同一浏览器中延续。清除站点数据或更换浏览器后会得到新的账号，暂不支持跨设备找回。以下内容仅作为未来重新启用邮箱登录时的运维参考；不要为了演示而打开 `MUSIC_EMAIL_LOGIN_ENABLED`。

## Cloudflare 配置

当前应用运行在 Cloudflare Pages Functions，因此登录邮件通过 Cloudflare Email Service REST API 发送；官方说明 REST API 可从任意后端调用，不依赖 Workers 邮件绑定。Cloudflare Email Service 负责投递，不是身份提供方：验证码校验、账号关联和应用会话由 Moodverse Functions 管理。

1. 确认发件域名的 DNS 托管在 Cloudflare；在 Cloudflare Email Service 中为该域名完成 onboarding，并确认 SPF、DKIM、DMARC 记录已生效。
2. 创建仅包含 `Email Sending: Edit` 权限的 API Token，并准备 Cloudflare account ID。
3. 仅在独立的 `moodverse-music-staging` Pages 项目的 Preview（staging 分支）环境设置普通变量：
   - `MUSIC_EMAIL_ACCOUNT_ID`：Cloudflare account ID（32 位十六进制）
   - `MUSIC_EMAIL_FROM`：已完成 Email Service onboarding 的发件地址，例如 `login@example.com`
4. 仅在独立的 `moodverse-music-staging` Pages 项目的 Preview（staging 分支）环境设置加密 Secrets：
   - `MUSIC_EMAIL_API_TOKEN`：Email Sending API Token
   - `MUSIC_AUTH_SECRET`：至少 32 个字符的随机密钥，用于验证码与 IP 标识的 HMAC
5. 确认这些变量与 Secrets 写入的是 `moodverse-music-staging`，而不是原有 `moodverse-care` Pages 项目。登录页及 `/api/auth/*` 在登录前必须可访问；不要用 Cloudflare Access 把整个应用挡在邮箱验证码之前，应用私有 API 会自行验证 `mv_music_session`。
6. 全新隔离 staging 数据库应按 `docs/music-staging-setup.md` 使用 `schema.sql` 初始化，不要把完整旧库迁移链重复灌入空库。若维护的是由旧 schema 逐步升级的音乐 MVP 数据库，则按编号顺序执行尚未应用的增量迁移，至少覆盖 `0011_music_email_auth.sql` 至当前版本 `0017_music_report_triage.sql`，并在部署前核对目标数据库确为 staging。

内部举报队列的单独配置与权限边界见 [`docs/music-moderation-setup.md`](music-moderation-setup.md)。

演示账号使用与普通账号相同的邮箱验证码登录，不存在固定验证码、共享登录口令或绕过认证的演示入口。在 **Preview/staging** 可选配置普通变量 `MUSIC_DEMO_EMAIL`，值为团队实际控制、已完成邮箱验证的演示账号邮箱；匹配时，私有首页会显示“演示账号”标记。此变量不创建用户或演示数据，也不会让 API 返回邮箱地址。不要在 Production 配置该变量。演示账号产生的访问、好友、私信和漂流瓶记录必须来自真实操作，不能预置成虚构互动。

`MUSIC_ALLOW_LEGACY_ACCESS_AUTH` 默认必须保持未设置。它只为显式批准的私有过渡环境保留旧 Access 身份兼容，不是公开登录方式；Email 验证成功仍可按唯一、已验证邮箱关联旧 Access 账号，冲突时拒绝自动合并。

Cloudflare 官方参考：

- Email Service 发件设置：<https://developers.cloudflare.com/email-service/get-started/send-emails/>
- Email Sending REST API：<https://developers.cloudflare.com/email-service/api/send-emails/rest-api/>
- Email Service 定价与任意收件人规则：<https://developers.cloudflare.com/email-service/platform/pricing/>
- Pages Functions 绑定清单：<https://developers.cloudflare.com/pages/functions/bindings/>

Email Service 任意收件人发送依赖 Workers Paid 计划；完成 API 侧配置前，应用会安全地拒绝创建可用登录码，不会降级为固定码或匿名音乐账号。

按 Cloudflare 当前定价说明，向任意收件人发送要求 Workers Paid；每个账户每月含 3,000 封，超出后为每 1,000 封 $0.35。Email Sending 目前仍标记为 Beta。请在启用 Preview/Production 前确认该 Cloudflare 账户有资格使用并接受对应计费。

## 应用安全与限额

- OTP 为 6 位数字，10 分钟有效、单次使用，数据库仅保存 `MUSIC_AUTH_SECRET` HMAC 摘要。
- 每个邮箱每小时最多 3 次，单一来源 IP 每小时最多 10 次；同邮箱 60 秒冷却。
- 单个验证码最多尝试 5 次；重新发送会作废先前验证码。
- Cloudflare Email Sending 请求最多等待 10 秒；超时或投递未被接受时会作废本次验证码，用户可稍后重试。
- 邮箱验证后签发 30 天 HttpOnly、Secure、SameSite=Lax 会话；登出可撤销服务端会话。
- 登录前后统一返回文案，不在发码接口查询账号是否存在。若旧 Cloudflare Access 邮箱唯一映射到一个用户，首次邮箱验证会关联回原 user ID，避免迁移旧星球数据；多个旧用户共享同一邮箱时会拒绝自动合并。
- Email Sending API Token 和 HMAC Secret 只能配置在 Cloudflare 加密 Secrets，不要写入 `wrangler.toml`、客户端代码或仓库变量文件。

## 账号删除确认

设置页复用同一 Cloudflare Email Sending 配置发送短时删除验证码。删除请求必须来自同源、有效登录会话，并同时提交验证码和精确确认词 `DELETE`；验证码 10 分钟有效、单次使用，错误 5 次锁定，按账号/IP 限流。数据库只存 HMAC 摘要，投递失败会作废验证码。确认后删除账号及其级联关联资料，并撤销当前应用会话；针对内容的举报证据可按界面提示保留为不再关联登录身份的安全审查记录。该操作不可撤销，只能在已隔离且经批准的环境进行完整验收；本仓库实现不构成对生产数据执行删除。
