# MOSIC

macOS 客户端启动后进入 MOSIC 官网。驾驶舱、播放、星球、Moment、好友与漂流瓶都与浏览器使用同一个站点。新用户的副驾显示「未配置」。每位听众为自己的设备选择模型并确认接入。选择本机模型时，由当前设备上的模型处理对话。选择远程 API、Codex 或 GitHub Copilot 订阅时，由对应提供方处理消息和近期上下文。

桌面连接会向 MOSIC 查询音乐或星球候选，只提交曲风、速度等筛选条件和当前曲目或星球 ID。驾驶舱的桌面模型记录按音乐宇宙身份保存在本机。独立离线电台另存自己的聊天记录。当前对话显示本地日期当天的消息，可在「历史记录」按日、周、月、年查看以往记录，或在对应设置中清空。离线电台查询同歌星球时使用曲目 ID 与已配对的设备凭据。播放在线音源时会向音乐服务请求音频。

## 安装和连接

Apple Silicon 用户可从 [MOSIC 桌面下载页](https://moodverse-care.pages.dev/desktop/) 获取 MOSIC.app，将其移入「应用程序」后打开即可进入驾驶舱。升级继续使用已有的本机资料、登录分区和钥匙串。已选择模型的本机连接可沿用。旧版只留下默认本机地址、尚未选择模型的配置会显示「未配置」。源码使用 Node 24 及 npm。可在本目录运行以下命令。

```sh
npm ci
sh speech/build.sh
npm start
```

### 用本机模型

在副驾的「设置与记忆」中复制本机模型配置提示词，交给这台电脑上的 Agent。Mac 应用的本机连接设置里也有同一份提示词。

1. Agent 先列出已安装的本地模型，请你确认完整模型 ID。若需要安装，它可以用 llmfit 检查硬件，列出量化版本、下载大小和内存用量，由你选定后再从 Ollama 等模型库下载。
2. Agent 检查本机的 `/v1/models` 和 `/v1/chat/completions`。例如 Ollama 常用 `http://127.0.0.1:11434/v1`，LM Studio 常用 `http://127.0.0.1:1234/v1`。
3. 网页版选择「此浏览器的本机模型」，填入验证过的地址和模型 ID 并点击「验证并连接本机模型」。本地服务需要允许来自正式站 `https://moodverse-care.pages.dev` 的浏览器访问。聊天记录保存在当前浏览器。
4. Mac 应用按 **⌘,** 进入本机连接设置，选择「本机模型」、填写地址和模型 ID，勾选允许驾驶舱使用并保存。也可以交给 Agent 按提示词中的 MOSIC 命令接入。

### 用自己的 API 或订阅

- **第三方 API。** 选择「自定义 API」，填写服务商的 HTTPS 接口与 API Key，并按接口文档选择 OpenAI Chat Completions、OpenAI Responses 或 Anthropic Messages。需要其他 JSON 请求格式时，选「自定义 JSON」，配置密钥请求头、请求体模板和回复文本字段。模板支持 `{{model}}`、`{{prompt}}`、`{{messages}}` 和 `{{system}}`。网页 API 密钥保存在当前页面会话内，发送时由 MOSIC 转到所选接口。使用 Mac 本机连接时，主进程直接请求所选接口，凭据由 Electron safeStorage 与 macOS 钥匙串保护。
- **Codex 订阅。** 在这台 Mac 安装官方 Codex CLI，在终端运行 `codex login` 并使用 ChatGPT 登录。按 **⌘,** 选择「Codex CLI · ChatGPT 订阅」和「读取可用模型」，选「Codex 自动选择」或指定模型后保存。每次对话都通过本机 CLI 发起，使用该登录账户的订阅额度。已有旧版 ChatGPT 授权的用户可以继续使用原连接。
- **GitHub Copilot 订阅。** 安装官方 GitHub Copilot CLI 并运行 `copilot login`，使用已开通 Copilot 的 GitHub 账户登录。在 Mac 连接设置中选择「GitHub Copilot CLI · Copilot 订阅」，读取账户可用的模型，选择自动或指定模型并保存。当前消息和最近最多十条历史由 GitHub Copilot 处理，计入该账户的额度。MOSIC 通过 CLI 的本机 SDK 接口建立仅文本会话，CLI 管理登录凭据。此版本已用 CLI 1.0.117 核对接入协议。[GitHub 官方登录说明](https://docs.github.com/en/copilot/how-tos/copilot-sdk/auth/authenticate)
- **本机对讲。** 麦克风和中文本机语音识别资源由 macOS 提供。按住说话时查看实时转写，松手后可以校对，点「发送」才会交给所选模型。

## Claude Code 与其他 MCP 客户端

在可运行 Node 24 的终端里，将下面的绝对路径换成下载并解压的本目录。

```sh
claude mcp add --transport stdio mosic -- node "/绝对路径/mosic/src/mcp.mjs"
```

支持查询音乐、搜索同歌星球和准备介绍草稿。要查询同歌星球，请先在网页版「设置 → 连接桌面副驾」生成一次性配对码。通过以下命令输入该码，令牌只写入你指定的新文件。任何时候都可从网页断开设备。

```sh
node src/mcp.mjs --pair "/绝对路径/mosic-device.token"
claude mcp add --transport stdio mosic -e MOSIC_DEVICE_TOKEN_FILE="/绝对路径/mosic-device.token" -- node "/绝对路径/mosic/src/mcp.mjs"
```

## 验证和打包

```sh
npm test
npm run package:mac
```

构建需要 macOS、Xcode 命令行工具和可取得 Electron 发行版的网络。构建产物为 `dist/mosic-source.zip` 和 `dist/mosic-macos-arm64.zip`，分别解压为 `mosic/` 和 `MOSIC.app`。本地构建使用 ad-hoc 签名。桌面端新增代码采用 MIT 许可。第三方运行时保留各自许可证。

## 桌面驾驶舱

应用启动后打开正式 MOSIC 宇宙，驾驶舱、星球、歌曲、Moment、好友与漂流瓶都使用同一个网页和 API。此窗口的登录状态保存在桌面专用浏览器分区。站点无法连接时应用会打开离线电台，已保存的目录和对话可在本机查看，播放在线音源仍需要网络。

使用菜单「航行 → 本机副驾与连接设置」（⌘,）选择模型、勾选「允许音乐宇宙中的副驾使用这条模型连接」并保存。在应用内的网页副驾选择「此设备的 MOSIC 连接」后，当前回合交由本机主进程调用该模型。主进程向 MOSIC 同源 API 取得有权查看的曲目或星球候选，将结果卡返回驾驶舱。桌面 API 密钥和旧版授权由主进程使用，订阅登录由用户本机的 Codex 或 GitHub Copilot CLI 管理。本机电台单独保存私人对话。可以在本机设置中随时关闭此连接。

开发版可通过 `MOSIC_DESKTOP_DEV_ORIGIN=http://127.0.0.1:端口` 验证本地前端；发行版固定连接正式域名。⌘1 返回音乐宇宙，⌘2 打开离线电台。
