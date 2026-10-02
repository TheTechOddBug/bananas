export type IceCandidateKind = 'host' | 'srflx' | 'relay' | 'prflx'

export type IceProtocol = 'udp' | 'tcp' | 'unknown'

export type IceAddressFamily = 'ipv4' | 'ipv6' | 'unknown'

export type IceCandidateEvidence = {
  type: IceCandidateKind
  protocol: IceProtocol
  addressFamily: IceAddressFamily
}

export type IceServerError = {
  url: string
  code: number
  text: string
}

export type IceFailureEvidence = {
  candidates: readonly IceCandidateEvidence[]
  serverErrors: readonly IceServerError[]
  gatheringTimedOut: boolean
}

export type IceFailureReason =
  | { kind: 'auth'; url: string; code: number }
  | { kind: 'unreachable'; url: string; code: number }
  | { kind: 'gathering-timeout' }
  | { kind: 'host-only' }
  | { kind: 'need-turn' }
  | { kind: 'relay-failed' }
  | { kind: 'no-candidates' }
  | { kind: 'unknown' }

export type SelectedPairEvidence = {
  local: IceCandidateEvidence
  remote: IceCandidateEvidence
}

type CandidateLike =
  | {
      candidate?: string
      type?: string | null
      protocol?: string | null
      address?: string | null
    }
  | null
  | undefined

type StatsReportLike = {
  forEach: (callback: (stat: Record<string, unknown>) => void) => void
}

const AUTH_CODES = new Set([401, 403, 438])

const isTurnUrl = (url: string): boolean => /^turns?:/i.test(url)

const labelPart = (value: string): string => value.charAt(0).toUpperCase() + value.slice(1)

const candidateBody = (candidate: CandidateLike): string => {
  const line = candidate?.candidate?.trim() ?? ''
  const body = line.startsWith('a=') ? line.slice(2) : line
  return body.startsWith('candidate:') ? body.slice('candidate:'.length) : ''
}

const candidateParts = (candidate: CandidateLike): string[] => candidateBody(candidate).split(/\s+/)

const asKind = (value: string | null | undefined): IceCandidateKind | null => {
  if (value === 'host' || value === 'srflx' || value === 'relay' || value === 'prflx') return value
  return null
}

const asProtocol = (value: string | null | undefined): IceProtocol | null => {
  const protocol = value?.toLowerCase()
  if (protocol === 'udp' || protocol === 'tcp') return protocol
  return null
}

export const iceAddressFamily = (address: string | null | undefined): IceAddressFamily => {
  if (!address || address.endsWith('.local')) return 'unknown'
  if (address.includes(':')) return 'ipv6'
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(address)) return 'ipv4'
  return 'unknown'
}

export const iceCandidateKind = (candidate: CandidateLike): IceCandidateKind | null => {
  const fromField = asKind(candidate?.type)
  if (fromField) return fromField
  const parts = candidateParts(candidate)
  const typIndex = parts.indexOf('typ')
  return asKind(typIndex >= 0 ? parts[typIndex + 1] : undefined)
}

export const iceCandidateEvidence = (candidate: CandidateLike): IceCandidateEvidence | null => {
  const type = iceCandidateKind(candidate)
  if (!type) return null
  const parts = candidateParts(candidate)
  const protocol = asProtocol(candidate?.protocol) ?? asProtocol(parts[2]) ?? 'unknown'
  const address = candidate?.address || parts[4] || null
  return { type, protocol, addressFamily: iceAddressFamily(address) }
}

export const candidateSummary = (
  candidates: readonly IceCandidateEvidence[],
): Record<string, number> => {
  const counts: Record<string, number> = {}
  for (const candidate of candidates) {
    const key = `${candidate.type}${labelPart(candidate.protocol)}${labelPart(candidate.addressFamily)}`
    counts[key] = (counts[key] ?? 0) + 1
  }
  return counts
}

export const sanitizeIceServerUrl = (url: string): string => {
  const match = /^(turns?:)(\/\/)?([^/?#]*)(.*)$/i.exec(url.trim())
  if (!match) return url.trim()
  const [, scheme, slashes = '', authority, rest] = match
  const at = authority.lastIndexOf('@')
  const host = at >= 0 ? authority.slice(at + 1) : authority
  return `${scheme}${slashes}${host}${rest}`
}

export const isTcpTurnUrl = (url: string): boolean => {
  if (!isTurnUrl(url)) return false
  return /(?:^|[?&])transport=tcp(?:&|$)/i.test(url)
}

const pickServer = (
  errors: readonly IceServerError[],
  pred: (error: IceServerError) => boolean,
): IceServerError | undefined => {
  const matches = errors.filter(pred)
  return matches.find((error) => isTurnUrl(error.url)) ?? matches[0]
}

const pickUnreachableServer = (errors: readonly IceServerError[]): IceServerError | undefined => {
  const nonTcp = errors.filter((error) => !isTcpTurnUrl(error.url))
  return pickServer(nonTcp.length > 0 ? nonTcp : errors, () => true)
}

export const connectionFailureForState = (
  state: string,
  failure: IceFailureReason | null = null,
): IceFailureReason | null => (state === 'failed' ? failure : null)

export const summarizeIceFailure = (evidence: IceFailureEvidence): IceFailureReason => {
  const auth = pickServer(evidence.serverErrors, (error) => AUTH_CODES.has(error.code))
  if (auth) return { kind: 'auth', url: auth.url, code: auth.code }

  const types = new Set(evidence.candidates.map((candidate) => candidate.type))
  const publicOrRelay = types.has('srflx') || types.has('relay')
  if (evidence.gatheringTimedOut && !publicOrRelay) return { kind: 'gathering-timeout' }
  if (types.size === 0) {
    const unreachable = pickUnreachableServer(evidence.serverErrors)
    if (unreachable) return { kind: 'unreachable', url: unreachable.url, code: unreachable.code }
    return { kind: 'no-candidates' }
  }
  if (types.has('relay')) return { kind: 'relay-failed' }
  if (types.has('srflx')) return { kind: 'need-turn' }
  if (types.has('host') || types.has('prflx')) return { kind: 'host-only' }
  return { kind: 'unknown' }
}

const statString = (stat: Record<string, unknown>, key: string): string | undefined => {
  const value = stat[key]
  return typeof value === 'string' ? value : undefined
}

const sideFromStat = (stat: Record<string, unknown> | undefined): IceCandidateEvidence | null => {
  if (!stat) return null
  const type = asKind(statString(stat, 'candidateType'))
  if (!type) return null
  return {
    type,
    protocol: asProtocol(statString(stat, 'protocol')) ?? 'unknown',
    addressFamily: iceAddressFamily(statString(stat, 'address') ?? statString(stat, 'ip')),
  }
}

export const selectedPairEvidence = (
  report: StatsReportLike | null | undefined,
): SelectedPairEvidence | null => {
  if (!report || typeof report.forEach !== 'function') return null
  const stats: Array<Record<string, unknown>> = []
  report.forEach((stat) => {
    stats.push(stat)
  })
  const byId = new Map<string, Record<string, unknown>>()
  for (const stat of stats) {
    const id = statString(stat, 'id')
    if (id) byId.set(id, stat)
  }
  const nominated = stats.find(
    (stat) =>
      stat.type === 'candidate-pair' && stat.nominated === true && stat.state === 'succeeded',
  )
  const selected = stats.find((stat) => stat.type === 'candidate-pair' && stat.selected === true)
  const transport = stats.find(
    (stat) => stat.type === 'transport' && typeof stat.selectedCandidatePairId === 'string',
  )
  const fromTransport = transport
    ? byId.get(statString(transport, 'selectedCandidatePairId') ?? '')
    : undefined
  const pair = nominated ?? selected ?? fromTransport
  if (!pair || pair.type !== 'candidate-pair') return null
  const local = sideFromStat(byId.get(statString(pair, 'localCandidateId') ?? ''))
  const remote = sideFromStat(byId.get(statString(pair, 'remoteCandidateId') ?? ''))
  if (!local || !remote) return null
  return { local, remote }
}

export const isWebRtcSdpError = (error: unknown): boolean => {
  if (typeof DOMException !== 'undefined' && error instanceof DOMException) return true
  if (!(error instanceof Error)) return false
  return /setRemoteDescription|setLocalDescription|RTCPeerConnection|SessionDescription/i.test(
    error.message,
  )
}
