/**
 * The phone the shopper told us he owns, remembered for this browser session.
 *
 * A display stocked as "Samsung M02 Display" also fits an A02. The A02 owner
 * must see "Samsung A02 Display" everywhere he looks - product page, cart,
 * order - because that is the phone he came to fix. It is wording only: the
 * product id, the price and the single stock pool are identical either way.
 *
 * Session storage rather than the database on purpose:
 *   - it is a per-shopper display preference, not shop data;
 *   - it must not follow him to another device or another day;
 *   - it needs no migration and cannot corrupt an order if it goes missing.
 * Every read is guarded: private windows and blocked site data throw on access.
 */

const KEY = 'imobile.selected_phone_model'

export interface SelectedPhoneModel {
  id: string
  /** Model only, e.g. "A02" - the brand is added when composing a name. */
  name: string
  /** Brand + model, e.g. "Samsung A02" - for showing back to the shopper. */
  label: string
}

export const getSelectedPhoneModel = (): SelectedPhoneModel | null => {
  try {
    const raw = sessionStorage.getItem(KEY)
    if (!raw) return null

    const parsed = JSON.parse(raw)
    if (!parsed?.id || !parsed?.name) return null

    return { id: String(parsed.id), name: String(parsed.name), label: String(parsed.label || parsed.name) }
  } catch {
    return null
  }
}

export const setSelectedPhoneModel = (model: SelectedPhoneModel | null): void => {
  try {
    if (!model?.id) {
      sessionStorage.removeItem(KEY)
      return
    }
    sessionStorage.setItem(KEY, JSON.stringify(model))
  } catch {
    // Storage unavailable - the shopper simply sees the internal name.
  }
}
