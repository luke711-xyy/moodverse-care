# MOSIC Copilot

macOS 客户端启动后进入 MOSIC 官网。驾驶舱、播放、星球、Moment、好友与漂流瓶都与浏览器使用同一个站点。默认的平台副驾把对话发给 MOSIC 服务处理并保存。切换到桌面连接后，由所选模型处理消息和近期上下文。Ollama、LM Studio 等本机服务在电脑上推理，OpenAI、Anthropic 和已授权的 ChatGPT 套餐会收到发给它们的内容。

桌面连接会向 MOSIC 查询音乐或星球候选，只提交曲风、速度等筛选条件和当前曲目或星球 ID。驾驶舱的桌面模型记录按音乐宇宙身份保存在本机。独立离线电台另存自己的聊天记录。当前对话显示本地日期当天的消息，可在「历史记录」按日、周、月、年查看以往记录，或在对应设置中清空。离线电台查询同歌星球时使用曲目 ID 与已配对的设备凭据。播放在线音源时会向音乐服务请求音频。

## 安装和连接

Apple Silicon 用户可从 [MOSIC 桌面下载页](https://moodverse-care.pages.dev/desktop/) 获取应用。源码使用 Node 24 及 npm。在本目录运行：

```sh
npm ci
sh speech/build.sh
npm start
```

本地模型默认连接 Ollama 的 http://127.0.0.1:11434/v1。使用 LM Studio 时在它的 Developer 页面启动本地服务，将地址改为 http://127.0.0.1:1234/v1。在「连接设置」里读取模型并选择，随后在右侧获取电台曲目或输入艺人名搜索。语音需要 macOS 的中文本机识别与语音资源，首次使用由系统询问。按住「按住说话」时，识别结果会逐步填入输入框。松开后可校对文字，点「发送」才会交给所选模型。副驾回复以文字显示。个人凭据使用 Electron safeStorage 与 macOS 钥匙串保护。

ChatGPT 套餐登录在系统浏览器完成。可按账号切换、重新授权、断开或打开套餐用量页面。订阅模式只用于此客户端内使用者主动发起的对话。Claude 也可以通过本人的 Console API Key 在此使用。

## Claude Code 与其他 MCP 客户端

在可运行 Node 24 的终端里，将下面的绝对路径换成下载并解压的本目录。

```sh
claude mcp add --transport stdio mosic -- node "/绝对路径/desktop/src/mcp.mjs"
```

支持查询音乐、搜索同歌星球和准备介绍草稿。要查询同歌星球，请先在网页版「设置 → 连接桌面副驾」生成一次性配对码。通过以下命令输入该码，令牌只写入你指定的新文件。任何时候都可从网页断开设备。

```sh
node src/mcp.mjs --pair "/绝对路径/mosic-device.token"
claude mcp add --transport stdio mosic -e MOSIC_DEVICE_TOKEN_FILE="/绝对路径/mosic-device.token" -- node "/绝对路径/desktop/src/mcp.mjs"
```

## 验证和打包

```sh
npm test
npm run package:mac
```

构建需要 macOS、Xcode 命令行工具和可取得 Electron 发行版的网络。生成的源码包与 Apple Silicon 应用 ZIP 位于 dist/。本地构建使用 ad-hoc 签名。桌面端新增代码采用 MIT 许可。第三方运行时保留各自许可证。

## 桌面驾驶舱

应用启动后打开正式 MOSIC 宇宙，驾驶舱、星球、歌曲、Moment、好友与漂流瓶都使用同一个网页和 API。此窗口的登录状态保存在桌面专用浏览器分区。站点无法连接时应用会打开离线电台，已保存的目录和对话可在本机查看，播放在线音源仍需要网络。

使用菜单「航行 → 本机副驾与连接设置」（⌘,）选择模型、勾选「允许音乐宇宙中的副驾使用这条模型连接」并保存。在网页副驾内选择桌面连接后，当前回合交由本机主进程调用该模型。主进程向 MOSIC 同源 API 取得有权查看的曲目或星球候选，将结果卡返回驾驶舱。密钥与订阅令牌仅由主进程使用。本机电台保存的私人对话与凭据不会提供给网页。可以在本机设置中随时关闭此连接。

开发版可通过 `MOSIC_DESKTOP_DEV_ORIGIN=http://127.0.0.1:端口` 验证本地前端；发行版固定连接正式域名。⌘1 返回音乐宇宙，⌘2 打开离线电台。
