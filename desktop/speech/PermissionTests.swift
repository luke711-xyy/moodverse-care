import AVFoundation
import Speech

@main
struct PermissionTests {
    static func main() {
        precondition(speechPermissionCode(.denied) == "SPEECH_PERMISSION_DENIED")
        precondition(speechPermissionCode(.restricted) == "SPEECH_PERMISSION_DENIED")
        precondition(speechPermissionCode(.notDetermined) == "SPEECH_PERMISSION_REQUIRED")
        precondition(speechPermissionCode(.authorized) == nil)
        precondition(microphonePermissionCode(.denied) == "MIC_PERMISSION_DENIED")
        precondition(microphonePermissionCode(.restricted) == "MIC_PERMISSION_DENIED")
        precondition(microphonePermissionCode(.notDetermined) == "MIC_PERMISSION_REQUIRED")
        precondition(microphonePermissionCode(.authorized) == nil)
        print("Permission state checks passed.")
    }
}
