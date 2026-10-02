export const INVITE_TOKEN_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
export const INVITE_TOKEN_LENGTH = 8

export const inviteTokenInput = (raw: string): string =>
  raw
    .toUpperCase()
    .split('')
    .filter((char) => INVITE_TOKEN_ALPHABET.includes(char))
    .join('')
    .slice(0, INVITE_TOKEN_LENGTH)

export const normalizeInviteToken = (raw: string): string | null => {
  const token = inviteTokenInput(raw.trim())
  if (token.length !== INVITE_TOKEN_LENGTH) return null
  return token
}
