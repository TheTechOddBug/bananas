import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  ScreenRecorder,
  downloadRecording,
  pickRecordingMimeType,
  screenRecordingFilename,
} from './screenRecorder'

class FakeTrack {
  kind: string
  id: string
  readyState = 'live'
  stop = vi.fn(() => {
    this.readyState = 'ended'
  })

  constructor(kind: string, id: string) {
    this.kind = kind
    this.id = id
  }

  clone(): FakeTrack {
    return new FakeTrack(this.kind, `${this.id}-clone`)
  }
}

class FakeStream {
  tracks: FakeTrack[]

  constructor(tracks: FakeTrack[]) {
    this.tracks = tracks
  }

  getAudioTracks(): FakeTrack[] {
    return this.tracks.filter((track) => track.kind === 'audio')
  }

  getTracks(): FakeTrack[] {
    return this.tracks
  }
}

class FakeSource {
  stream: FakeStream
  disconnected = false

  constructor(stream: FakeStream) {
    this.stream = stream
  }

  connect(): void {}

  disconnect(): void {
    this.disconnected = true
  }
}

class FakeDestination {
  stream = new FakeStream([new FakeTrack('audio', 'mix')])
}

class FakeAudioContext {
  static latest: FakeAudioContext | null = null
  closed = false
  sources: FakeSource[] = []
  destinationNode = new FakeDestination()

  constructor() {
    FakeAudioContext.latest = this
  }

  resume(): Promise<void> {
    return Promise.resolve()
  }

  close(): Promise<void> {
    this.closed = true
    return Promise.resolve()
  }

  createMediaStreamDestination(): FakeDestination {
    return this.destinationNode
  }

  createMediaStreamSource(stream: FakeStream): FakeSource {
    const source = new FakeSource(stream)
    this.sources.push(source)
    return source
  }
}

class FakeMediaRecorder {
  static instances: FakeMediaRecorder[] = []
  static supported = (mime: string): boolean => mime.includes('vp8')
  state = 'inactive'
  mimeType: string
  stream: FakeStream
  private listeners = new Map<string, Array<(event?: { data: Blob }) => void>>()

  constructor(stream: FakeStream, options?: { mimeType?: string }) {
    this.stream = stream
    this.mimeType = options?.mimeType ?? ''
    FakeMediaRecorder.instances.push(this)
  }

  static isTypeSupported(mime: string): boolean {
    return FakeMediaRecorder.supported(mime)
  }

  addEventListener(type: string, listener: (event?: { data: Blob }) => void): void {
    const existing = this.listeners.get(type) ?? []
    existing.push(listener)
    this.listeners.set(type, existing)
  }

  start(timeslice?: number): void {
    this.state = 'recording'
    this.timeslice = timeslice
  }

  timeslice?: number

  stop(): void {
    this.state = 'inactive'
    const data = { data: new Blob(['frame'], { type: this.mimeType }) }
    for (const listener of this.listeners.get('dataavailable') ?? []) listener(data)
    for (const listener of this.listeners.get('stop') ?? []) listener()
  }
}

describe('screen recording mime and filename', () => {
  it('prefers vp9, then vp8, then plain webm', () => {
    expect(pickRecordingMimeType((mime) => mime.includes('vp9'))).toBe('video/webm;codecs=vp9,opus')
    expect(pickRecordingMimeType((mime) => mime.includes('vp8'))).toBe('video/webm;codecs=vp8,opus')
    expect(pickRecordingMimeType(() => false)).toBe('video/webm')
  })

  it('names the file with the local timestamp', () => {
    expect(screenRecordingFilename(new Date(2026, 9, 3, 10, 5, 7))).toBe(
      'kiwi-screen-20261003-100507.webm',
    )
  })
})

describe('ScreenRecorder', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    FakeMediaRecorder.instances = []
    FakeAudioContext.latest = null
  })

  const install = (): void => {
    vi.stubGlobal('MediaStream', FakeStream)
    vi.stubGlobal('MediaRecorder', FakeMediaRecorder)
    vi.stubGlobal('AudioContext', FakeAudioContext)
  }

  it('mixes peer audio in and out without stopping the screen track', async () => {
    install()
    const video = new FakeTrack('video', 'screen')
    const peer = new FakeTrack('audio', 'peer')
    const recorder = new ScreenRecorder()
    recorder.start(video as unknown as MediaStreamTrack)

    const started = FakeMediaRecorder.instances[0]
    expect(started?.state).toBe('recording')
    expect(started?.mimeType).toBe('video/webm;codecs=vp8,opus')
    expect(started?.timeslice).toBe(1000)
    expect(started?.stream.tracks.map((track) => track.id)).toEqual(['screen', 'mix'])

    recorder.setPeerAudio('peer-1', new FakeStream([peer]) as unknown as MediaStream)
    const source = FakeAudioContext.latest?.sources[0]
    const clone = source?.stream.tracks[0]
    expect(clone?.id).toBe('peer-clone')
    expect(peer.stop).not.toHaveBeenCalled()

    recorder.setPeerAudio('peer-1', null)
    expect(source?.disconnected).toBe(true)
    expect(clone?.stop).toHaveBeenCalledOnce()
    expect(peer.stop).not.toHaveBeenCalled()
    expect(video.stop).not.toHaveBeenCalled()

    const blob = await recorder.stop()
    expect(blob.size).toBeGreaterThan(0)
    expect(blob.type).toContain('webm')
    expect(video.stop).not.toHaveBeenCalled()
    expect(FakeAudioContext.latest?.closed).toBe(true)
  })

  it('renames a mixed peer without cloning again', () => {
    install()
    const recorder = new ScreenRecorder()
    recorder.start(new FakeTrack('video', 'screen') as unknown as MediaStreamTrack)
    recorder.setPeerAudio(
      'pending',
      new FakeStream([new FakeTrack('audio', 'peer')]) as unknown as MediaStream,
    )
    recorder.renamePeer('pending', 'remote')
    expect(FakeAudioContext.latest?.sources).toHaveLength(1)
    recorder.setPeerAudio('remote', null)
    expect(FakeAudioContext.latest?.sources[0]?.disconnected).toBe(true)
  })
})

describe('downloadRecording', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('clicks a download anchor and revokes the object url later', () => {
    vi.useFakeTimers()
    const click = vi.fn()
    const anchor = { href: '', download: '', click, remove: vi.fn() }
    const revokeObjectURL = vi.fn()
    vi.stubGlobal('document', {
      createElement: () => anchor,
      body: { appendChild: vi.fn() },
    })
    vi.stubGlobal('URL', {
      createObjectURL: () => 'blob:kiwi',
      revokeObjectURL,
    })
    downloadRecording(new Blob(['x'], { type: 'video/webm' }), new Date(2026, 0, 2, 3, 4, 5))
    expect(anchor.download).toBe('kiwi-screen-20260102-030405.webm')
    expect(anchor.href).toBe('blob:kiwi')
    expect(click).toHaveBeenCalledOnce()
    expect(revokeObjectURL).not.toHaveBeenCalled()
    vi.advanceTimersByTime(10_000)
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:kiwi')
  })
})
