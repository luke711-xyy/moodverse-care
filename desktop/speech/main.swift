import AVFoundation
import Darwin
import Foundation
import Speech

// The parent process receives only complete JSON lines. Microphone data never
// leaves the audio engine / on-device recognition request or reaches the log.
func emit(_ fields: [String: String]) {
    guard var data = try? JSONSerialization.data(withJSONObject: fields) else { return }
    data.append(0x0A)
    FileHandle.standardOutput.write(data)
}

final class Intercom {
    enum Phase { case starting, recording, waitingForRelease, finishing, closed }
    private var phase: Phase = .starting
    private let prompt: Bool
    private let recognizer: SFSpeechRecognizer?
    private let engine = AVAudioEngine()
    private var installedTap = false
    private var request: SFSpeechAudioBufferRecognitionRequest?
    private var task: SFSpeechRecognitionTask?
    private var deadline: DispatchWorkItem?
    private var finalText = ""

    init(prompt: Bool, locale: String) {
        self.prompt = prompt
        recognizer = SFSpeechRecognizer(locale: Locale(identifier: locale))
    }

    func start() {
        setDeadline(seconds: 90) { self.fail("PERMISSION_TIMEOUT", "等待系统授权超时。") }
        let current = SFSpeechRecognizer.authorizationStatus()
        if current == .notDetermined && prompt {
            SFSpeechRecognizer.requestAuthorization { status in
                DispatchQueue.main.async { self.checkSpeech(status) }
            }
        } else {
            checkSpeech(current)
        }
    }

    private func checkSpeech(_ status: SFSpeechRecognizerAuthorizationStatus) {
        guard phase == .starting else { return }
        if let code = speechPermissionCode(status) {
            fail(code, "请在系统设置的「隐私与安全性 → 语音识别」中允许 MOSIC 使用语音识别。")
            return
        }
        guard let recognizer, recognizer.supportsOnDeviceRecognition else {
            fail("OFFLINE_RECOGNITION_UNAVAILABLE", "此 Mac 尚未提供此语言的本地识别。请检查系统听写语言，或输入文字。")
            return
        }
        let access = AVCaptureDevice.authorizationStatus(for: .audio)
        if access == .notDetermined && prompt {
            AVCaptureDevice.requestAccess(for: .audio) { _ in
                DispatchQueue.main.async { self.checkMicrophone(AVCaptureDevice.authorizationStatus(for: .audio)) }
            }
        } else { checkMicrophone(access) }
    }

    private func checkMicrophone(_ status: AVAuthorizationStatus) {
        guard phase == .starting else { return }
        if let code = microphonePermissionCode(status) {
            fail(code, "请在系统设置的「隐私与安全性 → 麦克风」中允许 MOSIC 使用麦克风。")
            return
        }
        guard let recognizer, recognizer.supportsOnDeviceRecognition, recognizer.isAvailable else {
            fail("OFFLINE_RECOGNITION_UNAVAILABLE", "本机语音识别服务暂不可用。")
            return
        }
        guard AVCaptureDevice.default(for: .audio) != nil else {
            fail("MIC_UNAVAILABLE", "没有可用的输入设备。")
            return
        }
        let audioRequest = SFSpeechAudioBufferRecognitionRequest()
        audioRequest.requiresOnDeviceRecognition = true
        audioRequest.shouldReportPartialResults = false
        audioRequest.taskHint = .dictation
        request = audioRequest
        let node = engine.inputNode
        let format = node.outputFormat(forBus: 0)
        guard format.sampleRate > 0 && format.channelCount > 0 else {
            fail("MIC_UNAVAILABLE", "麦克风暂时无法收音。")
            return
        }
        node.installTap(onBus: 0, bufferSize: 1024, format: format) { buffer, _ in
            audioRequest.append(buffer)
        }
        installedTap = true
        task = recognizer.recognitionTask(with: audioRequest) { result, error in
            // The callback can arrive after cancel or after endAudio().
            DispatchQueue.main.async {
                if self.phase == .closed || self.phase == .waitingForRelease { return }
                if let result, result.isFinal {
                    self.finalText = result.bestTranscription.formattedString.trimmingCharacters(in: .whitespacesAndNewlines)
                    if self.phase == .finishing { self.deliver() }
                    else { self.stopInput(); self.phase = .waitingForRelease }
                } else if error != nil {
                    self.fail("RECOGNITION_FAILED", "本机没有得到有效转写，请再试一次。")
                }
            }
        }
        engine.prepare()
        do { try engine.start() } catch {
            fail("MIC_UNAVAILABLE", "未能启动麦克风。")
            return
        }
        phase = .recording
        emit(["type": "ready"])
        setDeadline(seconds: 45) { self.fail("RECORDING_TIMEOUT", "对讲已超时，请按键重新录音。") }
    }

    func finish() {
        switch phase {
        case .starting: cancel()
        case .recording:
            phase = .finishing
            stopInput()
            setDeadline(seconds: 8) { self.fail("TRANSCRIPTION_TIMEOUT", "本机转写超时。") }
        case .waitingForRelease: deliver()
        case .finishing, .closed: break
        }
    }

    func disconnect() {
        // stdin.end("finish\n") is supported. Keep the final recognition result
        // alive after the parent closes stdin following a finish command.
        if phase != .finishing { cancel() }
    }

    private func deliver() {
        if finalText.isEmpty { fail("NO_SPEECH", "没有听清，请再说一次。"); return }
        close(["type": "text", "text": finalText], 0)
    }

    func cancel() { close(["type": "cancelled"], 0) }
    func fail(_ code: String, _ message: String) {
        close(["type": "error", "code": code, "message": message], 1)
    }

    private func stopInput() {
        if installedTap {
            engine.stop()
            engine.inputNode.removeTap(onBus: 0)
            installedTap = false
            request?.endAudio()
        }
    }

    private func close(_ result: [String: String], _ code: Int32) {
        guard phase != .closed else { return }
        phase = .closed
        deadline?.cancel()
        stopInput()
        task?.cancel()
        emit(result)
        exit(code)
    }

    private func setDeadline(seconds: Double, _ action: @escaping () -> Void) {
        deadline?.cancel()
        let timer = DispatchWorkItem(block: action)
        deadline = timer
        DispatchQueue.main.asyncAfter(deadline: .now() + seconds, execute: timer)
    }
}

let arguments = Array(CommandLine.arguments.dropFirst())
if arguments.contains("--status") {
    let recognizer = SFSpeechRecognizer(locale: Locale(identifier: "zh-CN"))
    emit(["type": "status", "speech": speechPermission(SFSpeechRecognizer.authorizationStatus()),
          "microphone": micPermission(AVCaptureDevice.authorizationStatus(for: .audio)),
          "onDevice": recognizer?.supportsOnDeviceRecognition == true ? "supported" : "unavailable"])
    exit(0)
}
guard arguments.allSatisfy({ $0 == "--no-prompt" }) else {
    emit(["type": "error", "code": "INVALID_ARGUMENT", "message": "Unrecognized argument."])
    exit(2)
}

let intercom = Intercom(prompt: !arguments.contains("--no-prompt"), locale: "zh-CN")
signal(SIGTERM, SIG_IGN)
signal(SIGINT, SIG_IGN)
let termination = DispatchSource.makeSignalSource(signal: SIGTERM, queue: .main)
let interruption = DispatchSource.makeSignalSource(signal: SIGINT, queue: .main)
for source in [termination, interruption] {
    source.setEventHandler { intercom.cancel() }
    source.resume()
}
DispatchQueue.global(qos: .userInitiated).async {
    while let line = readLine() {
        DispatchQueue.main.async {
            switch line {
            case "finish": intercom.finish()
            case "cancel": intercom.cancel()
            default: intercom.fail("INVALID_COMMAND", "Unknown microphone command.")
            }
        }
    }
    DispatchQueue.main.async { intercom.disconnect() }
}
// Let a cancellation already queued on stdin take effect before asking for access.
DispatchQueue.main.asyncAfter(deadline: .now() + .milliseconds(60)) { intercom.start() }
RunLoop.main.run()
