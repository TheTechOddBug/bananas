export const RECORDING_MIME_CANDIDATES = [
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
] as const

export type ScreenRecordingNotice = 'saved' | 'failed'
export type ScreenRecordingStart = 'started' | 'unavailable' | 'failed'

const defaultMimeSupported = (mime: string): boolean => {
  const recorder = globalThis.MediaRecorder
  if (!recorder?.isTypeSupported) return mime === 'video/webm'
  return recorder.isTypeSupported(mime)
}

export const pickRecordingMimeType = (
  isTypeSupported: (mime: string) => boolean = defaultMimeSupported,
): string => {
  for (const mime of RECORDING_MIME_CANDIDATES) {
    try {
      if (isTypeSupported(mime)) return mime
    } catch {
      // A broken probe should fall through to the next candidate.
    }
  }
  return 'video/webm'
}

const pad = (value: number): string => String(value).padStart(2, '0')

export const screenRecordingFilename = (date: Date): string => {
  const day = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`
  const time = `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
  return `kiwi-screen-${day}-${time}.webm`
}

export const downloadBlob = (blob: Blob, filename: string): void => {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body?.appendChild(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

export const downloadRecording = (blob: Blob, date = new Date()): void => {
  downloadBlob(blob, screenRecordingFilename(date))
}

type MixedPeer = {
  node: MediaStreamAudioSourceNode
  clones: MediaStreamTrack[]
}

const audioContextCtor = (): typeof AudioContext => {
  const ctor =
    globalThis.AudioContext ??
    (globalThis as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!ctor) throw new Error('AudioContext unavailable')
  return ctor
}

/**
 * Records one screen-share video track plus a mix of remote peer audio.
 * Cloned audio tracks feed the mixer so playback elements keep their originals.
 * stop() never stops the live video track.
 */
export class ScreenRecorder {
  private recorder: MediaRecorder | null = null
  private chunks: Blob[] = []
  private audioContext: AudioContext | null = null
  private destination: MediaStreamAudioDestinationNode | null = null
  private peers = new Map<string, MixedPeer>()
  private stopPromise: Promise<Blob> | null = null

  get active(): boolean {
    return this.recorder?.state === 'recording'
  }

  start(videoTrack: MediaStreamTrack): void {
    if (this.recorder) throw new Error('already recording')
    if (videoTrack.readyState === 'ended') throw new Error('video track ended')
    const AudioContextCtor = audioContextCtor()
    this.audioContext = new AudioContextCtor()
    void this.audioContext.resume?.()
    this.destination = this.audioContext.createMediaStreamDestination()
    const tracks: MediaStreamTrack[] = [videoTrack]
    const mixed = this.destination.stream.getAudioTracks()[0]
    if (mixed) tracks.push(mixed)
    const mimeType = pickRecordingMimeType()
    this.chunks = []
    this.recorder = new MediaRecorder(new MediaStream(tracks), { mimeType })
    this.recorder.addEventListener('dataavailable', (event: BlobEvent) => {
      if (event.data.size > 0) this.chunks.push(event.data)
    })
    this.recorder.start(1000)
  }

  setPeerAudio(peerId: string, stream: MediaStream | null): void {
    this.removePeer(peerId)
    if (!stream || !this.audioContext || !this.destination) return
    const live = stream.getAudioTracks().filter((track) => track.readyState === 'live')
    if (!live.length) return
    const clones = live.map((track) => track.clone())
    const node = this.audioContext.createMediaStreamSource(new MediaStream(clones))
    node.connect(this.destination)
    this.peers.set(peerId, { node, clones })
  }

  renamePeer(fromId: string, toId: string): void {
    if (fromId === toId) return
    const existing = this.peers.get(fromId)
    if (!existing) return
    this.removePeer(toId)
    this.peers.delete(fromId)
    this.peers.set(toId, existing)
  }

  stop(): Promise<Blob> {
    if (this.stopPromise) return this.stopPromise
    this.stopPromise = this.finish()
    return this.stopPromise
  }

  private finish(): Promise<Blob> {
    const recorder = this.recorder
    const mime = recorder?.mimeType || 'video/webm'
    return new Promise((resolve, reject) => {
      let settled = false
      const pack = (failed: boolean): void => {
        if (settled) return
        settled = true
        this.releaseMixer()
        this.recorder = null
        const blob = new Blob(this.chunks, { type: mime })
        this.chunks = []
        if (failed && blob.size === 0) {
          reject(new Error('recording failed'))
          return
        }
        resolve(blob)
      }
      if (!recorder || recorder.state === 'inactive') {
        pack(false)
        return
      }
      recorder.addEventListener('stop', () => pack(false), { once: true })
      recorder.addEventListener('error', () => pack(true), { once: true })
      try {
        recorder.stop()
      } catch (error) {
        if (settled) return
        if (this.chunks.length) {
          pack(false)
          return
        }
        settled = true
        this.releaseMixer()
        this.recorder = null
        reject(error instanceof Error ? error : new Error('recording failed'))
      }
    })
  }

  private removePeer(peerId: string): void {
    const existing = this.peers.get(peerId)
    if (!existing) return
    existing.node.disconnect()
    for (const clone of existing.clones) clone.stop()
    this.peers.delete(peerId)
  }

  private releaseMixer(): void {
    for (const peerId of [...this.peers.keys()]) this.removePeer(peerId)
    this.destination = null
    const context = this.audioContext
    this.audioContext = null
    void context?.close()
  }
}
