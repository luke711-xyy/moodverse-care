# MOSIC 本地中文对讲

在 macOS 运行 `sh desktop/speech/build.sh`，使用 Xcode Command Line Tools 为本机架构编译 `desktop/dist/speech/mosic-speech`。Electron 通过 stdin/stdout 与子进程通信。发布包应把这个可执行文件放入主进程读取的 Resources 路径，并在应用的 Info.plist 中填写这里的两个用途说明。签名时一并签署小工具。

首次按下对讲键时启动子进程。工具依次检查系统语音识别授权、中文本地识别支持和麦克风权限。在本地识别可用的设备上，每次请求都启用 `requiresOnDeviceRecognition`。录音保存在内存中，最长收音 45 秒。对子进程写入的每个命令、从 stdout 读出的每条 JSON 均以换行结尾。

| 事件或命令 | 行为 |
| --- | --- |
| `{"type":"ready"}` | 已开始收音。 |
| `{"type":"partial","text":"…"}` | 本次听写的完整临时文本。用新文本替换上一条假设，保留原有草稿。 |
| 写入 `finish` | 停止收音，等待最终识别结果，最多八秒。获得授权之前松开会结束此次对讲。 |
| `{"type":"text","text":"…"}` | 将最终文本留在输入框中等待用户修改、发送，进程退出。 |
| 写入 `cancel`、发送 SIGTERM，或在 finish 前关闭 stdin | 释放麦克风，返回 `{"type":"cancelled"}` 并退出。 |
| `{"type":"error","code":"…","message":"…"}` | 向用户显示 message，退出码为 1。权限、输入设备、离线识别和超时各有错误码。 |

## 验证

从仓库根目录运行下列命令，检查当前权限和本地识别支持。状态检查不弹窗、不收音。没有授予权限时返回 `notDetermined`、`denied` 或 `restricted`。

```sh
sh desktop/speech/build.sh
desktop/dist/speech/mosic-speech --status
xcrun swiftc desktop/speech/Authorization.swift desktop/speech/PermissionTests.swift -o /tmp/mosic-permission-tests
/tmp/mosic-permission-tests
printf 'cancel\n' | desktop/dist/speech/mosic-speech --no-prompt
```

最后一项应返回 `cancelled`。两个权限的已允许、未决、拒绝和受限分支均有独立断言。在状态显示尚未允许语音识别时，交互式运行 `desktop/dist/speech/mosic-speech --no-prompt` 应返回 `SPEECH_PERMISSION_REQUIRED`；已拒绝则返回 `SPEECH_PERMISSION_DENIED`。

验证真实口述时，从打包的 MOSIC 应用按下对讲键，处理系统权限提示，等待收音指示再说话。检查录音时草稿是否逐字更新，松开后是否只有一条最终结果。核对草稿后点「发送」，此时才应出现副驾回复。录音中取消时应立即释放麦克风，输入或输出设备断开时应给出失败提示。可在系统设置的「隐私与安全性」里检查当前应用的麦克风和语音识别授权。开发机与签名后的应用可能对应不同的系统授权记录。

苹果文档说明了本地支持检查和权限用途说明。[本机识别开关](https://developer.apple.com/documentation/speech/sfspeechrecognitionrequest/requiresondevicerecognition) · [语音识别权限](https://developer.apple.com/documentation/speech/asking-permission-to-use-speech-recognition)
