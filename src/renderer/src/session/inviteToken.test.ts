import { describe, expect, it } from 'vitest'
import { inviteTokenInput, normalizeInviteToken } from './inviteToken'

describe('normalizeInviteToken', () => {
  it('uppercases a valid code and rejects anything else', () => {
    expect(normalizeInviteToken(' ab23efgh ')).toBe('AB23EFGH')
    expect(normalizeInviteToken('ab23efg0')).toBeNull()
    expect(normalizeInviteToken('SHORT')).toBeNull()
    expect(inviteTokenInput('o0i1ab')).toBe('AB')
  })
})
