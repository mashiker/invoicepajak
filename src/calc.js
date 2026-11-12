/**
 * calc.js — Indonesian Tax Engine for Invoice
 * Tarif per MEMORY.md 2026: PPN 12%, PPh 23 2%, PPh 22 0.5% (marketplace), PPh Final 4(2) 2.5%/7.5%
 *
 * Prinsip:
 *  - DPP PPN = total tagihan (inclusive). PPN = DPP × 12%. Tarif efektif = 10/11 × 12% = 10,909% dari gross.
 *    Tapi sesuai PMK 131/2024, sejak Jan 2025 tarif PPN = 12%, DPP = 10/11 × gross.
 *    Untuk invoice jasa/barang biasa, harga biasanya sudah inclusive PPN → kita decompose.
 *  - PPh dipungut pemotong (oleh buyer) berdasarkan DPP (bukan + PPN).
 *  - Net Payable = (DPP + PPN) − total PPh yang dipotong.
 */

export const TAX_RATES = {
  ppn: 0.12,             // PPN 12% (UU HPP + PMK 131/2024, efektif Jan 2025)
  pph23: 0.02,           // PPh 23 jasa konsultan/manajemen/teknik (Pasal 23)
  pph22Marketplace: 0.005, // PPh 22 marketplace 0,5% (PMK 81/2024 skrg PMK 37/2025)
  pphFinal42Building: 0.025, // PPh Final 4(2) sewa bangunan = 2,5% × DPP
  pphFinal42Land: 0.075,    // PPh Final 4(2) sewa tanah = 7,5% × DPP
}

/**
 * Hitung PPN dari gross (inclusive).
 * Rumus: DPP = gross / (1 + tarif)  →  untuk PPN 12%: DPP = gross / 1.12
 * (Catatan: fraksi 10/11 hanya valid buat PPN 10% era lama. Untuk 12% pakai gross/1.12.)
 *
 * @param {number} gross - total bruto line items (qty × harga satuan, sudah termasuk PPN)
 * @param {boolean} isPkp - apakah penjual PKP (pengusaha kena pajak)
 * @returns {{ dpp: number, ppn: number, rate: number }}
 */
export function calcPpn(gross, isPkp = true) {
  if (gross <= 0) return { dpp: 0, ppn: 0, rate: TAX_RATES.ppn }
  // Non-PKP: tidak kenai PPN, tapi DPP = gross (nilai transaksi tetap dasar potong PPh)
  if (!isPkp) return { dpp: round2(gross), ppn: 0, rate: TAX_RATES.ppn }
  const dpp = round2(gross / (1 + TAX_RATES.ppn))
  const ppn = round2(gross - dpp)
  return { dpp, ppn, rate: TAX_RATES.ppn }
}

/**
 * Hitung subtotal dari line items.
 * @param {Array<{qty:number, price:number}>} items
 * @returns {number}
 */
export function calcSubtotal(items) {
  if (!Array.isArray(items)) return 0
  return round2(items.reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.price) || 0), 0))
}

/**
 * Hitung PPh berdasarkan config & tipe item.
 * PPh dihitung dari DPP (bukan gross+PPN).
 *
 * @param {number} dpp - Dasar Pengenaan Pajak (hasil calcPpn.dpp)
 * @param {object} cfg - { pph23:boolean, pph22Marketplace:boolean, pphFinal42:'none'|'building'|'land', customPph?:Array }
 * @returns {{ pph23:number, pph22:number, pphFinal42:number, custom:Array, total:number, breakdown:Array }}
 */
export function calcPph(dpp, cfg = {}) {
  const out = { pph23: 0, pph22: 0, pphFinal42: 0, custom: [], total: 0, breakdown: [] }
  if (dpp <= 0) return out

  if (cfg.pph23) {
    out.pph23 = round2(dpp * TAX_RATES.pph23)
    out.breakdown.push({ label: 'PPh 23 (2%) — jasa', amount: out.pph23 })
  }
  if (cfg.pph22Marketplace) {
    out.pph22 = round2(dpp * TAX_RATES.pph22Marketplace)
    out.breakdown.push({ label: 'PPh 22 (0,5%) — marketplace', amount: out.pph22 })
  }
  if (cfg.pphFinal42 === 'building') {
    out.pphFinal42 = round2(dpp * TAX_RATES.pphFinal42Building)
    out.breakdown.push({ label: 'PPh Final 4(2) (2,5%) — sewa bangunan', amount: out.pphFinal42 })
  } else if (cfg.pphFinal42 === 'land') {
    out.pphFinal42 = round2(dpp * TAX_RATES.pphFinal42Land)
    out.breakdown.push({ label: 'PPh Final 4(2) (7,5%) — sewa tanah', amount: out.pphFinal42 })
  }

  // Custom PPh entries — user-defined (nama + tarif bebas)
  if (Array.isArray(cfg.customPph)) {
    for (const cp of cfg.customPph) {
      if (!cp.enabled) continue
      const ratePct = Number(cp.rate) || 0
      if (ratePct === 0) continue
      // rate bisa diisi sebagai persen (2 = 2%) atau desimal (0.02). Auto-detect: kalau <= 1, treat as fraction.
      const fraction = ratePct <= 1 ? ratePct : ratePct / 100
      const amount = round2(dpp * fraction)
      if (amount <= 0) continue
      out.custom.push({ id: cp.id, label: cp.label, rate: ratePct, amount })
      const rateLabel = ratePct <= 1 ? `${(ratePct * 100).toFixed(ratePct * 100 % 1 === 0 ? 0 : 2)}%` : `${ratePct}%`
      out.breakdown.push({ label: `${cp.label} (${rateLabel})`, amount, isCustom: true })
    }
  }

  out.total = round2(out.pph23 + out.pph22 + out.pphFinal42 + out.custom.reduce((s, c) => s + c.amount, 0))
  return out
}

/**
 * Compute full invoice totals.
 * @param {Array} items - line items { qty, price, type:'jasa'|'barang' }
 * @param {object} taxCfg - { isPkp:boolean, pph23:boolean, pph22Marketplace:boolean, pphFinal42:string }
 * @returns {object} { subtotal, dpp, ppn, pph:{...}, grossTotal, totalPph, netPayable }
 */
export function computeTotals(items, taxCfg = {}) {
  if (!Array.isArray(items)) items = []
    const subtotal = calcSubtotal(items)
  const isPkp = taxCfg.isPkp !== false
  const { dpp, ppn } = calcPpn(subtotal, isPkp)

  // Aggregate PPh config: item-type-based defaults + explicit overrides + custom PPh
  const cfg = {
    pph23: taxCfg.pph23 ?? items.some(i => i.type === 'jasa'),
    pph22Marketplace: taxCfg.pph22Marketplace ?? items.some(i => i.type === 'barang' && i.isMarketplace),
    pphFinal42: taxCfg.pphFinal42 ?? 'none',
    customPph: taxCfg.customPph ?? [],
  }
  const pph = calcPph(dpp, cfg)

  const grossTotal = round2(dpp + ppn)
  const netPayable = round2(grossTotal - pph.total)
  return { subtotal, dpp, ppn, pph, grossTotal, totalPph: pph.total, netPayable, isPkp }
}

/** Round to 2 decimal places, avoid float drift. */
export function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100
}

/** Format number ke Rupiah: 1500000 → "Rp 1.500.000" */
export function formatIDR(n) {
  const v = Number.isFinite(Number(n)) ? Number(n) : 0
  return 'Rp ' + new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(Math.round(v))
}
