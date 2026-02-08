/**
 * Permission and hook types
 */

export interface PermissionConfig {
  allow: string[]
  deny: string[]
}

export interface HookConfig {
  hooks: {
    PreToolUse?: Array<{
      matcher?: string
      hooks: Array<{ type: 'command'; command: string }>
    }>
    PostToolUse?: Array<{
      matcher?: string
      hooks: Array<{ type: 'command'; command: string }>
    }>
    Stop?: Array<{
      hooks: Array<{ type: 'command'; command: string }>
    }>
  }
  permissions: PermissionConfig
}
