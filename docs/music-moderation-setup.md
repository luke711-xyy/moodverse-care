# Music MVP 举报审核接口

举报记录目前由用户侧 `/api/me/reports` 创建。此说明只涉及内部审核 API；它不提供自动删帖、封号或读取被举报对象私密正文的能力。

## 配置审核员

在独立的 `moodverse-music-staging` Pages Preview 环境设置 `MUSIC_MODERATOR_EMAILS`，值为经过 Moodverse 邮箱验证码验证的审核员邮箱，用英文逗号、分号或空格分隔。匹配忽略大小写。未设置、或值中没有有效邮箱时，审核 API 返回 404 并保持关闭。

仅将该变量放在隔离的 staging 环境；不要为了验证而将审核员名单写进客户端、`wrangler.toml` 或公开仓库配置。账号仍须先完成正常邮箱登录。保持 `MUSIC_ALLOW_LEGACY_ACCESS_AUTH` 未设置，除非处于单独批准的私有迁移环境。

## API

- `GET /api/admin/music-reports` 默认返回最早的 50 条 `open` 举报。可用 `status=open|reviewing|actioned|dismissed|all` 筛选，`limit=1..100` 调整单页上限，`offset=0..1000000` 做有界分页。响应含 `hasMore`。
- `PATCH /api/admin/music-reports/:id` 接受且只接受 `{ "status": "reviewing" | "actioned" | "dismissed" }`，请求必须同源。`open` 可转入三种状态；`reviewing` 可转为 `actioned` 或 `dismissed`；终态不可再改。重复提交当前状态是无副作用的幂等成功。

队列只返回举报目标类型与 ID、举报原因、举报人主动填写的 detail、状态和时间；不返回账户邮箱、目标正文或其他私密内容。每次有效状态转换会写入独立审核记录，保留前后状态、审核员用户 ID 与时间。删除举报人账号会随举报一并删除其审核记录；删除审核员账号会将审核员 ID 置空。

`actioned` 仅表示团队已在系统外完成必要处置并记录结果；接口自身不会删除内容、限制账号、撤销分享或向举报人宣称已作出处置。团队应在受控审核流程中核对目标，并按赛事演示所需保留最少数据。审核队列现可从已授权审核员的“设置 → 打开审核队列”进入；审核员入口通过服务端白名单探测显示，服务端 API 仍独立执行鉴权。控制台只展示举报说明和必要元数据，不加载目标正文；当前没有自动内容审查或生产环境审核配置。

## 本地验证

在 SQLite 测试夹具中，`tests/music-moderation-api.test.ts` 覆盖审核员白名单、未授权拒绝、私密目标内容不外泄、有界分页、同源状态转换和审核轨迹；`tests/music-api.test.ts` 与 `tests/music-app.test.tsx` 覆盖同源客户端、白名单入口、元数据展示与审核状态更新；`tests/music-schema.test.ts` 覆盖增量迁移与 `schema.sql` 镜像。部署 staging D1 前按顺序应用至 `migrations/0017_music_report_triage.sql`，并在确认数据库目标后单独执行跨账号验收。
