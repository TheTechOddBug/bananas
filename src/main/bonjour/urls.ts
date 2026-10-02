export const BONJOUR_AUTH_PREFIX = 'kiwi://bonjour-auth'

export const isBonjourAuthUrl = (url: string): boolean =>
  url.startsWith(BONJOUR_AUTH_PREFIX) || url.startsWith('kiwi://bonjour/callback')

export const isKiwiSdpUrl = (url: string): boolean => {
  if (!url.startsWith('kiwi://') && !url.startsWith('bananas://')) return false
  return !isBonjourAuthUrl(url)
}

export const eventsWsUrl = (
  serverUrl: string,
  auth: { token?: string | null; desk?: string | null },
): string => {
  const base = serverUrl.replace(/\/$/, '')
  const url = new URL(`${base.replace(/^http/, 'ws')}/events`)
  if (auth.token) url.searchParams.set('token', auth.token)
  if (auth.desk) url.searchParams.set('desk', auth.desk)
  return url.toString()
}

export const tokenFromBonjourAuthUrl = (url: string): string | null => {
  try {
    const parsed = new URL(url)
    return parsed.searchParams.get('token')
  } catch {
    const match = /[?&]token=([^&]+)/.exec(url)
    return match ? decodeURIComponent(match[1]) : null
  }
}
