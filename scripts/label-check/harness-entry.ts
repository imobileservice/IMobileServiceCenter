// Renders the REAL label sheet builder used by the app, so what Chrome prints here
// is byte-for-byte what the Print button produces.
import { buildLabelSheetHtml, composeModelLabelName, type LabelProduct } from '@/lib/labels/label-sheet'

const params = new URLSearchParams(location.search)
const qty = parseInt(params.get('qty') || '3', 10)
const mode = (params.get('mode') || 'thermal') as 'thermal' | 'a4'

const base: LabelProduct[] = [
  { id: '1', name: 'Samsung A10s On Off Ribbon', barcode: '000232', price: 1200 },
  { id: '2', name: 'iPhone 12 Pro Max Display Original', barcode: '000233', price: 45000 },
  { id: '3', name: 'Very Long Product Name That Should Truncate Cleanly Here', barcode: '000234', price: 999999 },
]

/**
 * One physical display that fits several phones, printed for a specific model.
 * Every one of these carries barcode 000235 - only the printed name changes, so
 * they all scan back to the same SKU and the same stock pool.
 */
const multiFit: LabelProduct = {
  id: '4',
  name: 'Redmi Note 8 Display',
  barcode: '000235',
  brand: 'Redmi',
  model: 'Note 8',
}

const perModel: LabelProduct[] = ['Note 8T', 'Note 9S', 'Note 10 Pro Max 5G Special'].map(
  (model, i) => ({
    ...multiFit,
    id: `4-${i}`,
    name: composeModelLabelName(multiFit, model),
  })
)

// Mimic the modal's spool: `qty` copies of the first product, then one of each other.
const items: LabelProduct[] = [
  ...Array.from({ length: qty }, () => base[0]),
  ...base.slice(1),
  ...perModel,
]

const html = buildLabelSheetHtml(items, mode)
document.open()
document.write(html)
document.close()

// ?view=proof blows the stickers up on screen so a human (or a screenshot) can
// eyeball the actual layout. Print geometry is untouched.
if (params.get('view') === 'proof') {
  const s = document.createElement('style')
  s.textContent = `
    body { background:#888; padding:12px; }
    .grid { display:flex; flex-direction:column; gap:12px; align-items:flex-start; }
    .label {
      transform: scale(6); transform-origin: top left;
      outline: 0.2mm solid red;           /* physical sticker edge */
      margin: 0 0 ${25 * 5}mm 0;
    }
    .inner { outline: 0.15mm dashed #06c; }  /* safe area */
  `
  document.head.appendChild(s)
}
