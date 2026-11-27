// Convert the microphone's native rate to mono PCM16. Leave the output silent.
class DictationProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this.block = new Int16Array(2048)
    this.length = 0
    this.sum = 0
    this.count = 0
    this.phase = 0
    this.finished = false
    this.port.onmessage = () => {
      this.finished = true
      this.flush()
      this.port.postMessage('finished')
    }
  }
  flush() {
    if (!this.length) return
    const samples = this.block.slice(0, this.length)
    this.port.postMessage(samples, [samples.buffer])
    this.length = 0
  }
  process(inputs) {
    if (this.finished) return false
    const input = inputs[0]?.[0]
    if (!input) return true
    for (const sample of input) {
      this.sum += sample
      this.count++
      this.phase += 16000
      if (this.phase < sampleRate) continue
      this.phase -= sampleRate
      this.block[this.length++] = Math.round(32767 * Math.max(-1, Math.min(1, this.sum / this.count)))
      this.sum = this.count = 0
      if (this.length === this.block.length) this.flush()
    }
    return true
  }
}
registerProcessor('mosic-dictation', DictationProcessor)
