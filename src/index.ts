/**
 * dsh-file-comment — Host (Node) entry.
 *
 * Pure client-side plugin: all logic lives in the browser bundle (./client).
 * This module exists so the plugin loader can import the package and register
 * it in the composed plugin tree. The host apply is a no-op.
 */
import type { Context } from '@deepseek-ai/cordis'

/** Plugin id — must be unique within the composed plugin tree. */
export const name = 'dsh-file-comment'

/** No host-side dependencies. */
export const inject: string[] = []

/** No host-side services needed; the browser bundle does all the work. */
export function apply(_ctx: Context): void {
  // Intentionally empty — client plugin only.
}
