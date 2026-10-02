import { describe, expect, it, vi } from 'vitest'

vi.mock('../translations', () => ({
  L: {
    connection_failed: () => 'Connection failed',
    connection_invite_missing: () => 'invite missing',
    connection_ice_auth: ({ url, code }: { url: string; code: number }) => `auth ${url} ${code}`,
    connection_ice_unreachable: ({ url, code }: { url: string; code: number }) =>
      `unreachable ${url} ${code}`,
    connection_ice_tcp_unreachable: ({ url, code }: { url: string; code: number }) =>
      `TCP TURN ${url} ${code}`,
    connection_ice_gathering_timeout: () => 'gathering timeout',
    connection_ice_host_only: () => 'host only',
    connection_ice_need_turn: () => 'need turn',
    connection_ice_relay_failed: () => 'relay failed',
    connection_ice_no_candidates: () => 'no candidates',
    connection_ice_unknown: () => 'unknown',
  },
}))

import { iceFailureText } from './connectionFailureText'

describe('iceFailureText', () => {
  it('mentions TCP TURN only when the unreachable server is TCP TURN', () => {
    const tcp = iceFailureText({
      kind: 'unreachable',
      url: 'turn:turn.example:3478?transport=tcp',
      code: 701,
    })
    const stun = iceFailureText({
      kind: 'unreachable',
      url: 'stun:stun.example:19302',
      code: 701,
    })
    const relay = iceFailureText({ kind: 'relay-failed' })
    expect(tcp).toContain('TCP TURN')
    expect(stun).not.toContain('TCP TURN')
    expect(relay).not.toContain('TCP TURN')
    expect(tcp).toContain('turn:turn.example:3478?transport=tcp')
    expect(tcp).not.toContain('user:pass@')
  })
})
