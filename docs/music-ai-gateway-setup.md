# Moodverse 本地 AI 网关部署指南

本指南说明如何在 Apple Silicon Mac 上运行 Moodverse 的本地模型服务，并让 Cloudflare Pages 在通过 Access 后安全调用它。它是配置手册，不表示 Cloudflare Tunnel、Access、Pages secrets 或真实模型权重已经配置完成；当前项目仍应使用独立的音乐 MVP staging 环境，不要部署到旧的 Moodverse 正式域名。

## 请求与信任边界

```text
浏览器 → Cloudflare Pages Functions / D1 → Cloudflare Access → Tunnel → Mac 上的 127.0.0.1:8080
                                                  │                    │
                                   Service Token 两个请求头       独立 Bearer 密钥
```

- Pages/D1 负责登录、星球权限、隐私筛选、撞歌候选资格、任务状态和模型结果校验。模型只负责受限的星球视觉生成、候选排序与文本嵌入，不决定谁有权访问谁。
- Composer 视觉结果采用 schema 2：在调色板、氛围、运动和粒子密度之外，只能从当前程序地形组件中选择山脉、盆地、峡谷、断崖的数量；Cloudflare 与客户端都校验整数范围，随机种子仍决定具体位置和形状，模型不能生成任意资产或几何。
- Rank 模型只返回服务端给定的候选 `planetId` 与分数；网关依据候选的 `matchSource` 派生 `reasonCode`，Pages 再校验候选 ID、分数和原因码。网关 Rank 响应使用 `{ model, ranking }`，原因码不是模型输出字段。
- 浏览器不直接调用本地 AI 服务，也不能读取任何 AI、Tunnel 或 Access 凭据。
- Tunnel 的公开主机名必须由 Access Self-hosted 应用保护，并只给 Pages 使用的 Service Token 配置 `Service Auth` 策略。不要为网关添加面向访客的 Allow 或 Bypass 规则。
- Access 凭据与源站 Bearer 是两种独立的凭据：`CF-Access-Client-Id` / `CF-Access-Client-Secret` 通过 Cloudflare Access；`Authorization: Bearer …` 由本地网关校验。Pages 只有在这三项都配置时才会调用模型。
- 网关只监听回环地址，健康接口不代表模型已加载。`/v1/*` 任一失败都不应改变服务端候选过滤或隐私规则。

## 1. Mac 运行环境

需要 Apple Silicon Mac、Python 3.11 或更高版本、`uv`、可用的网络连接，以及足够的磁盘空间和统一内存。模型 ID 当前为：

- 视觉生成与排序：`mlx-community/Qwen3.5-4B-MLX-4bit`，由 `mlx-vlm` 按需加载。
- 文本嵌入：`mlx-community/Qwen3-Embedding-0.6B-8bit`，由 `mlx-embeddings` 按需加载。

在仓库的 `services/moodverse-ai` 目录安装 Python 依赖：

```sh
cd services/moodverse-ai
uv sync
```

`uv sync` 安装 Python 软件依赖；模型权重由第一次对应推理请求触发下载，不属于当前测试或构建步骤。首次请求可能明显更慢。若 Mac 内存、磁盘或网络不足，不要反复发起请求，先检查模型缓存与系统资源。

Hugging Face Hub 默认把仓库缓存放在 `~/.cache/huggingface/hub`。启动网关前可以设置 `HF_HOME` 或 `HF_HUB_CACHE`，将权重放到容量充足的本机磁盘；路径变更需在启动服务之前设置。公开模型通常不需要 Hub token。不要把缓存目录加入 Git。

## 2. 本机启动与密钥

首次启动前，生成一个高熵随机的 `MUSIC_AI_GATEWAY_TOKEN`，并将同一个值存入密码管理器和 staging Pages 的加密 Secret。不要复用 Cloudflare API Token、Tunnel token、Access Client Secret 或用户登录密钥。

建议从仓库外、权限为仅当前用户可读的本地密钥文件或密码管理器向 shell 环境加载密钥；不要把真实值写入命令历史、`wrangler.toml`、仓库中的 `.env`、聊天、截图或客户端代码。运行时变量：

```sh
export MUSIC_AI_HOST=127.0.0.1
export MUSIC_AI_PORT=8080
# MUSIC_AI_GATEWAY_TOKEN 从本机密码管理器或仓库外的受限文件加载
# 从仓库根目录打开此终端，或另开终端后先切回仓库根目录
cd services/moodverse-ai
uv run python -m moodverse_ai
```

网关默认也只绑定 `127.0.0.1:8080`；代码会拒绝非回环地址。`MUSIC_AI_TEXT_MODEL_ID`、`MUSIC_AI_EMBED_MODEL_ID` 可用于覆盖模型 ID，默认值见本指南开头。服务启动后，本机检查：

```sh
curl --fail --silent http://127.0.0.1:8080/healthz
```

预期返回 `{"status":"ready"}`。这只确认 HTTP 服务就绪，不证明 MLX 可用、权重已下载或推理成功。

## 3. Cloudflare Tunnel 与 Access

Cloudflare 当前对多数使用场景推荐 remotely-managed Tunnel。以下配置动作应由有相应 Cloudflare 域名和 Zero Trust 权限的项目管理员完成；本次代码改动没有创建 Tunnel、DNS 记录或 Access 应用。为避免公开 origin 短暂处于无 Access 保护状态，先创建 Access 应用和 Service Auth policy，再添加 Tunnel 的 Published Application route。

1. 在 **Access controls → Service credentials → Service Tokens** 创建专用 Service Token。将 Client ID 和 Client Secret 安全保存；Client Secret 创建时只显示一次，遗失时应轮换或重建。为 token 设定合理的有效期和轮换责任人。
2. 在 **Access controls → Applications** 为 `ai-gateway.<你的域名>` 创建 Self-hosted 应用，添加 `Service Auth` policy，`Include → Service Token` 只选择刚创建的 token。确认没有更宽泛的 Bypass/Allow 规则。Cloudflare 建议先建 Access 应用、再配置 Tunnel route。
3. 在 **Networks → Tunnels** 创建专用 remotely-managed Tunnel，并在运行 AI 网关的 Mac 上添加 connector；Tunnel token 只保存在本机安全位置，不放进仓库或 Pages。然后为 Tunnel 添加只用于本服务的 Published Application route：`ai-gateway.<你的域名>` → `http://127.0.0.1:8080`。使用单独 hostname，不要把开发机上的其它端口加入 Tunnel。若使用 locally-managed Tunnel，ingress 规则必须以 catch-all `http_status:404` 收尾。
4. 检查 Tunnel connector 健康状态；再用 Pages 将发送的 Access Service Token 通过 Access 调用 `https://ai-gateway.<你的域名>/healthz`。确认 Access 拒绝无 token 请求、允许该 Service Token 请求。之后 POST 推理还需要独立的源站 Bearer。

**不要**在没有 Access 保护的情况下把 8080 端口直接映射到公网。Tunnel token、Access Service Token 和网关 Bearer 都应使用不同的随机值，并分别撤销/轮换。

## 4. Pages staging 环境配置

只在 `moodverse-music-staging` Pages 项目的 Preview（staging 分支）环境配置以下值。不要在 Production 或旧的 `moodverse-care` 正式项目中配置这些变量与 Secrets。

普通变量（不是秘密）：

| Pages 变量 | 示例值 |
| --- | --- |
| `MUSIC_AI_GATEWAY_URL` | `https://ai-gateway.<你的域名>/v1/planet/compose` |
| `MUSIC_AI_SONG_PORTAL_URL` | `https://ai-gateway.<你的域名>/v1/song-portal/rank` |
| `MUSIC_AI_EMBEDDING_URL` | `https://ai-gateway.<你的域名>/v1/embed` |

使用 Pages **Settings → Variables and Secrets** 中的加密 Secret 添加：

| Secret | 来源 |
| --- | --- |
| `MUSIC_AI_ACCESS_CLIENT_ID` | Cloudflare Access Service Token Client ID |
| `MUSIC_AI_ACCESS_CLIENT_SECRET` | 同一个 Service Token 的 Client Secret |
| `MUSIC_AI_GATEWAY_TOKEN` | 与 Mac 本地网关完全相同的独立 Bearer 密钥 |

不要把 secret 放在 `wrangler.toml` 的 `[vars]`、Vite `VITE_*` 变量或前端状态中。修改 Pages secret 后按 Cloudflare 要求重新部署相应环境，之后再验证 Functions 读取到了配置。Cloudflare 的 [Pages bindings/secrets 指南](https://developers.cloudflare.com/pages/functions/bindings/)说明了环境变量与加密 Secret 的差别；Tunnel、Service Token 与 Access policy 的创建流程参考 [Tunnel quick start](https://developers.cloudflare.com/tunnel/get-started/)、[Publish a self-hosted application](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/self-hosted-public-app/)、[Access policies](https://developers.cloudflare.com/cloudflare-one/access-controls/policies/) 和 [Service Tokens](https://developers.cloudflare.com/cloudflare-one/access-controls/service-credentials/service-tokens/)。

## 5. 模型缓存、预热与健康检查

运行中的模型按需加载，视觉模型和嵌入模型是分别首次加载的。Hugging Face 默认缓存路径以及 `HF_HOME` / `HF_HUB_CACHE` 的覆盖方式见 [Hugging Face Hub 环境变量文档](https://huggingface.co/docs/huggingface_hub/main/package_reference/environment_variables)。保留缓存可以避免每次启动重复下载；缓存中模型文件较大，清理前先确认不再需要，权重升级前记录使用的模型 ID。

嵌入服务另有一个仅驻留内存的复用缓存：只缓存 Pages 已筛选的 `planet:<id>` / `user:<id>` 候选向量，不缓存查询向量；键只包含文本 SHA-256、模型请求 ID 和 schema 版本，不保留 Moment 原文，也不写入磁盘。缓存最多 512 项，闲置 30 分钟后过期；每项同时记录实际模型名/版本，网关发现批内版本不一致时会重算整批。无效输出不会写入缓存，停止或重启网关会清空缓存。缓存用于减少重复候选文本的 MLX 推理，不替代 Pages 的公开状态、屏蔽关系或候选资格检查。

可以用无隐私的合成文本预热嵌入模型：

```sh
curl --fail --silent http://127.0.0.1:8080/v1/embed \
  -H "Authorization: Bearer ${MUSIC_AI_GATEWAY_TOKEN}" \
  -H 'Content-Type: application/json' \
  --data '{"schemaVersion":1,"model":"qwen3-embedding:0.6b","inputs":[{"id":"warmup","text":"一段用于本地服务预热的合成测试文本。"}]}'
```

响应应含 `model` 及与输入 ID 对应、维度一致且非零的 embedding。要预热视觉模型，使用 staging 的专用测试账号和已选曲目调用 Composer；排序模型与 Composer 共用文本生成模型，也可以通过 staging 的精确歌曲匹配流程验证。不要把真实私密 Moment 或个人资料复制进手工 smoke 请求。

一次完整验收应记录 Compose、Rank、Embed 是否返回有效模型名/版本、首次冷启动耗时、后续热请求耗时、Mac 内存峰值与结果任务状态。当前本机合成请求测得文本模型冷启动约 30 秒；Song Portal Rank 与 Composer 的 Pages 调用截止时间均设为 45 秒，以覆盖此冷启动并留出请求开销。Cloudflare Workers 官方说明：入站 HTTP 请求在客户端保持连接时没有硬性 wall-time 上限，单次 subrequest 也没有固定时限；应用仍使用 45 秒主动截止时间，避免无界等待。上线前需在隔离 staging 重新测量，不能把单次本机样例当作延迟 SLO。[Workers limits](https://developers.cloudflare.com/workers/platform/limits/)

## 6. 离线、睡眠与关闭

- Mac 睡眠、断网、Tunnel connector 停止或模型不可用时，Pages 无法完成本地推理。恢复条件是 Mac 唤醒且联网、AI 网关运行、Tunnel/Access 健康；恢复后再重试失败任务。
- Composer 未配置完整密钥时不会排队；运行中请求失败会将任务标记失败，并保留先前星球视觉。撞歌排序与随机漫游使用稳定规则兜底，漂流瓶继续使用词面排序，不会因 AI 离线而泄露内容或绕过 D1 资格筛选。
- 不需要为了模型服务永久关闭 Mac 睡眠。需要在线提供模型时，手动保持 Mac 唤醒并运行 gateway 与 Tunnel connector；无人使用后分别在终端按 `Ctrl-C` 停止本地 gateway 和 connector。
- 终止服务不会自动删除模型缓存、Tunnel/DNS 或 Access 配置。移除这些资源是独立的管理员操作。

## 7. 隐私与日志边界

- Composer 只接收选定歌曲的受限 metadata 和公开 Moment；私密 Moment、邮箱、认证凭据和音乐播放 URL 不进入 prompt。
- 精确同歌候选先由 Pages/D1 筛选；模型只对已有候选排序，不得添加候选、推断访问权限或把推断当成听歌事实。
- Discovery 与瓶子嵌入只接收后端筛选出的可用公开音乐信号。私人星球、私密 Moment、已屏蔽或不接收的人不能通过模型输出重新加入候选。
- gateway 不把请求体写入 stdout；不要额外打开包含请求正文的代理访问日志。候选向量缓存只保留有期限的内存向量与内容摘要，查询和原始 Moment 文本不落盘。对外只返回受约束的模型输出，Pages 再做 schema/候选校验后才保存。
- 发现 Bearer 泄露时，先在本机与 staging Pages 同步轮换 `MUSIC_AI_GATEWAY_TOKEN`，并检查 Access Service Token 是否也需要单独轮换；二者不是同一个凭据。

## 当前部署状态

截至 2026-10-01，本机已通过 `uv sync --python 3.11` 安装 MLX 运行依赖，Python 网关测试 34 项通过。真实的 `Qwen3-Embedding-0.6B-8bit` 权重已下载；通过 loopback HTTP 网关 `POST /v1/embed` 发送两条合成文本，带正确 Bearer 时返回两个非零的 1024 维向量，输入 ID 与响应 ID 一致；不带 Bearer 的请求返回 `401 UNAUTHORIZED`。

真实的 `Qwen3.5-4B-MLX-4bit`（约 3.03GB）权重已下载，并通过本机 loopback HTTP 网关完成合成 Composer 与 Rank 请求。Composer schema 2 的地形数量参数已连到地形网格、表面纹理、河流、湖泊、植被和涂鸦贴附采样；在相同星球种子下仍可复现。新 schema 的真实模型 HTTP smoke 返回了通过严格校验的中文摘要、`#RRGGBB` 调色板及有界地形组件数量。Rank 冷启动样例 30.81 秒、热调用样例 7.94 秒。一次实际 Rank smoke 发现模型会把候选原因码填错；现在模型只返回候选 ID 和分数，网关按 `matchSource` 派生原因码。真实模型偶尔会用单元素 JSON 数组包裹 Rank 对象；网关现在只规范化这一种外层形状，之后仍严格校验字段、候选 ID 和分数。修复后真实 Rank HTTP 响应返回正确分数及服务端原因码，最近一次 HTTP 验证耗时 22.20 秒；响应形状为顶层 `model` 与 `ranking`。以上只证明当前 Mac 上的真实模型与本地 HTTP 鉴权路径可运行；没有使用真实用户内容，尚未测出完整的统一内存峰值，也不是 Cloudflare Pages 或跨账号端到端验收。

Cloudflare Tunnel、Access Service Auth policy、staging Pages hostname/secrets，以及 Email Service 发件域名与 API token 仍未配置或验证。本次没有创建 Cloudflare 资源、修改 DNS、部署 staging 或发送真实邮件。模型权重缓存位于仓库外的 Hugging Face 缓存目录，不会提交到 Git；候选向量缓存只存在于网关进程内，重启后清空。
