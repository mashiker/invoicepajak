import { describe, it, expect } from 'vitest'
import { calcPpn, calcSubtotal, calcPph, computeTotals, round2, TAX_RATES } from './calc.js'

describe('round2', () => {
  it('membulatkan ke 2 desimal tanpa float drift', () => {
    expect(round2(0.1 + 0.2)).toBe(0.3)
    expect(round2(10.005)).toBe(10.01)
    expect(round2(1234.5678)).toBe(1234.57)
  })
})

describe('calcPpn', () => {
  it('menghitung DPP & PPN dari gross inclusive (12%, DPP=gross/1.12)', () => {
    // Gross 1.120.000 inclusive → DPP 1.000.000, PPN 120.000
    const r = calcPpn(1_120_000, true)
    expect(r.dpp).toBe(1_000_000)
    expect(r.ppn).toBe(120_000)
    expect(r.rate).toBe(0.12)
    expect(round2(r.dpp + r.ppn)).toBe(1_120_000) // harus balik ke gross
  })

  it('non-PKP: DPP = gross (nilai transaksi), PPN = 0', () => {
    const r = calcPpn(1_000_000, false)
    expect(r.dpp).toBe(1_000_000) // DPP tetap = nilai transaksi (dasar potong PPh)
    expect(r.ppn).toBe(0)
  })

  it('return 0 kalau gross negatif/0', () => {
    expect(calcPpn(0, true).dpp).toBe(0)
    expect(calcPpn(-100, true).dpp).toBe(0)
  })

  it('tarif PPN = 12% sesuai 2026', () => {
    expect(TAX_RATES.ppn).toBe(0.12)
  })
})

describe('calcSubtotal', () => {
  it('menjumlah qty × price', () => {
    const items = [
      { qty: 2, price: 500_000 },
      { qty: 1, price: 1_200_000 },
      { qty: 0.5, price: 800_000 },
    ]
    // 1.000.000 + 1.200.000 + 400.000 = 2.600.000
    expect(calcSubtotal(items)).toBe(2_600_000)
  })

  it('handle array kosong / invalid', () => {
    expect(calcSubtotal([])).toBe(0)
    expect(calcSubtotal(null)).toBe(0)
    expect(calcSubtotal([{ qty: 'x', price: undefined }])).toBe(0)
  })
})

describe('calcPph', () => {
  const dpp = 1_000_000

  it('PPh 23 (2%) buat jasa', () => {
    const r = calcPph(dpp, { pph23: true })
    expect(r.pph23).toBe(20_000)
    expect(r.total).toBe(20_000)
    expect(r.breakdown).toHaveLength(1)
  })

  it('PPh 22 (0,5%) buat marketplace', () => {
    const r = calcPph(dpp, { pph22Marketplace: true })
    expect(r.pph22).toBe(5_000)
  })

  it('PPh Final 4(2) sewa bangunan 2,5%', () => {
    const r = calcPph(dpp, { pphFinal42: 'building' })
    expect(r.pphFinal42).toBe(25_000)
  })

  it('PPh Final 4(2) sewa tanah 7,5%', () => {
    const r = calcPph(dpp, { pphFinal42: 'land' })
    expect(r.pphFinal42).toBe(75_000)
  })

  it('bisa multiple pajak sekaligus', () => {
    const r = calcPph(dpp, { pph23: true, pph22Marketplace: true })
    expect(r.total).toBe(25_000) // 20k + 5k
    expect(r.breakdown).toHaveLength(2)
  })

  it('return 0 kalau dpp 0 atau cfg kosong', () => {
    expect(calcPph(0, { pph23: true }).total).toBe(0)
    expect(calcPph(dpp, {}).total).toBe(0)
  })

  it('custom PPh: user-defined nama & tarif (input dalam %)', () => {
    const r = calcPph(dpp, {
      customPph: [
        { id: '1', label: 'PPh 21', rate: 2, enabled: true },     // 2% → 20.000
        { id: '2', label: 'PPh 22 Impor', rate: 2.5, enabled: true }, // 2,5% → 25.000
      ]
    })
    expect(r.custom).toHaveLength(2)
    expect(r.custom[0].amount).toBe(20_000)
    expect(r.custom[1].amount).toBe(25_000)
    expect(r.total).toBe(45_000)
    expect(r.breakdown).toHaveLength(2)
    expect(r.breakdown[0].isCustom).toBe(true)
  })

  it('custom PPh: skip yang disabled atau rate 0', () => {
    const r = calcPph(dpp, {
      customPph: [
        { id: '1', label: 'PPh 21', rate: 5, enabled: false },   // disabled → skip
        { id: '2', label: 'PPh 22', rate: 0, enabled: true },     // rate 0 → skip
        { id: '3', label: 'PPh 23', rate: 2, enabled: true },     // active → 20.000
      ]
    })
    expect(r.custom).toHaveLength(1)
    expect(r.total).toBe(20_000)
  })

  it('custom PPh: tarif <= 1 tetap persen (1 = 1%, 0.5 = 0,5%) — regresi issue #1', () => {
    const r1 = calcPph(dpp, {
      customPph: [{ id: '1', label: 'PPh', rate: 1, enabled: true }]
    })
    expect(r1.custom[0].amount).toBe(10_000) // 1% × 1jt = 10k (bukan 100%)

    const r2 = calcPph(dpp, {
      customPph: [{ id: '1', label: 'PPh Final UMKM', rate: 0.5, enabled: true }]
    })
    expect(r2.custom[0].amount).toBe(5_000) // 0,5% × 1jt = 5k (bukan 50%)
  })
})

describe('computeTotals — integration', () => {
  it('scenario: jasa konsultan 10jt, PKP, PPh 23 dipotong', () => {
    const items = [{ qty: 1, price: 11_200_000, type: 'jasa' }] // gross inclusive
    const totals = computeTotals(items, { isPkp: true, pph23: true })

    // DPP = 11.200.000 / 1.12 = 10.000.000
    expect(totals.dpp).toBe(10_000_000)
    // PPN = 12% × DPP = 1.200.000
    expect(totals.ppn).toBe(1_200_000)
    // gross total = DPP + PPN = 11.200.000
    expect(totals.grossTotal).toBe(11_200_000)
    // PPh 23 = 2% × DPP = 200.000
    expect(totals.totalPph).toBe(200_000)
    // net payable = gross − PPh = 11.000.000
    expect(totals.netPayable).toBe(11_000_000)
  })

  it('scenario: barang marketplace, non-PKP, PPh 22 dipotong', () => {
    const items = [{ qty: 10, price: 100_000, type: 'barang', isMarketplace: true }]
    const totals = computeTotals(items, { isPkp: false, pph22Marketplace: true })
    // non-PKP → PPN 0, tapi DPP = subtotal (1.000.000)
    expect(totals.dpp).toBe(1_000_000)
    expect(totals.ppn).toBe(0)
    // PPh 22 = 0,5% × DPP = 5.000
    expect(totals.totalPph).toBe(5_000)
    // gross = DPP + PPN = 1.000.000; net = gross − PPh = 995.000
    expect(totals.netPayable).toBe(995_000)
  })

  it('auto-suggest PPh 23 kalau ada item jasa', () => {
    const items = [{ qty: 1, price: 1_120_000, type: 'jasa' }]
    const totals = computeTotals(items, {})
    expect(totals.pph.pph23).toBeGreaterThan(0)
  })

  it('scenario: sewa tanah 56jt inclusive, PKP, PPh Final 7,5%', () => {
    const items = [{ qty: 1, price: 56_000_000, type: 'jasa' }] // sewa, anggap jasa
    const totals = computeTotals(items, { isPkp: true, pphFinal42: 'land' })
    // DPP = 56.000.000 / 1.12 = 50.000.000
    expect(totals.dpp).toBe(50_000_000)
    // PPh Final 7,5% × DPP = 3.750.000
    expect(totals.pph.pphFinal42).toBe(3_750_000)
  })
})
