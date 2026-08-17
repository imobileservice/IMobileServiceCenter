import { create } from "zustand"

/**
 * Holds the admin's own password for as long as the tab is open, so the screens
 * that read a credential back only have to ask once.
 *
 * Deliberately not persisted, and deliberately not in localStorage or a cookie:
 * an admin password written to disk would be a worse leak than the shop
 * passwords it unlocks. Closing the tab, signing out or a refresh all clear it,
 * and the next reveal asks again.
 *
 * This is a convenience over the server's check, never a replacement for it -
 * POST /suppliers/:id/portal-password re-verifies the password on every single
 * call, because the inventory API has no session of its own.
 */
interface AdminUnlockState {
  /** The confirmed admin password for this tab, or null if not confirmed yet. */
  password: string | null
  unlock: (password: string) => void
  clear: () => void
}

export const useAdminUnlock = create<AdminUnlockState>((set) => ({
  password: null,
  unlock: (password: string) => set({ password }),
  clear: () => set({ password: null }),
}))
