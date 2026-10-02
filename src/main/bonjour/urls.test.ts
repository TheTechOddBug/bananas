import { describe, expect, it } from 'vitest'
import { isBonjourAuthUrl, isKiwiSdpUrl, tokenFromBonjourAuthUrl, eventsWsUrl } from './urls'

describe('bonjour urls', () => {
  it('splits auth callbacks from sdp invites', () => {
    expect(isBonjourAuthUrl('kiwi://bonjour-auth?token=abc')).toBe(true)
    expect(isKiwiSdpUrl('kiwi://bonjour-auth?token=abc')).toBe(false)
    expect(isKiwiSdpUrl('kiwi://h/Kiwi/payload')).toBe(true)
    expect(isBonjourAuthUrl('kiwi://h/Kiwi/payload')).toBe(false)
    expect(tokenFromBonjourAuthUrl('kiwi://bonjour-auth?token=secret')).toBe('secret')
  })

  it('builds the live events websocket URL', () => {
    expect(eventsWsUrl('https://bonjour.p2p.kiwi/', { token: 'a+b' })).toBe(
      'wss://bonjour.p2p.kiwi/events?token=a%2Bb',
    )
    expect(eventsWsUrl('http://localhost:8787', { token: 'tok' })).toBe(
      'ws://localhost:8787/events?token=tok',
    )
    expect(eventsWsUrl('http://localhost:8787', { desk: 'desk-secret' })).toBe(
      'ws://localhost:8787/events?desk=desk-secret',
    )
  })
})
