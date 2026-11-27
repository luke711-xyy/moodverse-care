import AVFoundation
import Speech

func speechPermission(_ value: SFSpeechRecognizerAuthorizationStatus) -> String {
    switch value {
    case .authorized: return "authorized"
    case .denied: return "denied"
    case .restricted: return "restricted"
    case .notDetermined: return "notDetermined"
    @unknown default: return "unknown"
    }
}
func micPermission(_ value: AVAuthorizationStatus) -> String {
    switch value {
    case .authorized: return "authorized"
    case .denied: return "denied"
    case .restricted: return "restricted"
    case .notDetermined: return "notDetermined"
    @unknown default: return "unknown"
    }
}
func speechPermissionCode(_ status: SFSpeechRecognizerAuthorizationStatus) -> String? {
    switch status {
    case .authorized: return nil
    case .notDetermined: return "SPEECH_PERMISSION_REQUIRED"
    case .restricted, .denied: return "SPEECH_PERMISSION_DENIED"
    @unknown default: return "SPEECH_PERMISSION_DENIED"
    }
}
func microphonePermissionCode(_ status: AVAuthorizationStatus) -> String? {
    switch status {
    case .authorized: return nil
    case .notDetermined: return "MIC_PERMISSION_REQUIRED"
    case .restricted, .denied: return "MIC_PERMISSION_DENIED"
    @unknown default: return "MIC_PERMISSION_DENIED"
    }
}
