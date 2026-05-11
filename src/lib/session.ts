export const LOGOUT_REASON = {
  MANUAL: 'manual',
  TIMEOUT: 'timeout',
  EXPIRATION: 'expiration',
} as const

export type LogoutReason = (typeof LOGOUT_REASON)[keyof typeof LOGOUT_REASON]
