# 音乐版正式域名发布

2026-10-09 用户要求把当前音乐驾驶舱版本部署到正式网站。正式域名为
<https://moodverse-care.pages.dev>，Pages 项目为 `moodverse-care`，发布分支为
`main`；不意味着合并 Git 旧 `main`。

使用 `wrangler.music-production.pages.toml`。旧 `wrangler.toml` 保留原情绪版
数据库配置，不用于音乐版发布。旧 `moodverse-care-db` 不迁移、不删除。

为快速落地，正式站与音乐 staging 暂时共用 `moodverse-music-staging-db`
及现有 scheduler，保留当前曲库、虚拟星球和瓶调度；**staging 的数据写入也会
影响正式站**。两个域名的匿名登录 cookie 独立，不自动跨域继承账号。本次没有
导入旧情绪记录，也没有复制私人账号数据到另一数据库。

正式音乐版使用独立 `mv_music_session` cookie，避免覆盖旧情绪版的
`mv_session`；staging 保持现有 cookie 名。旧站匿名身份仍保留在原数据库。

构建通过后，在临时目录使用标准配置名发布：

```sh
taskReleaseDir=$(mktemp -d /tmp/moodverse-music-production.XXXXXX)
cp -R dist functions src "$taskReleaseDir/"
cp care-templates.ts package.json "$taskReleaseDir/"
cp wrangler.music-production.pages.toml "$taskReleaseDir/wrangler.toml"
npx wrangler pages deploy dist --cwd "$taskReleaseDir" \
  --project-name moodverse-care --branch main \
  --commit-hash "$(git rev-parse HEAD)" --commit-dirty=false
```

后续普通界面迭代以构建、相关关键路径冒烟、发布后页面/资源正常加载为验收，
不再每次执行全量测试或多轮截图。涉及权限、数据一致性或不可逆操作时才增加
针对性检查。此策略也记录在根目录 `AGENTS.md`。

本次发布前的旧版 Production 部署为
`2cdecfc3-ef00-4da9-8948-aa35545057d0`，不可变地址
<https://2cdecfc3.moodverse-care.pages.dev>；旧数据库完整保留，可用于回退。
