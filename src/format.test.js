import { describe, it, expect } from 'vitest'
import { formatDateID, terbilang } from './format.js'

describe('terbilang — regresi issue #3', () => {
  it('membulatkan seperti formatIDR, bukan floor (122.767,86 → ...tujuh ratus enam puluh delapan)', () => {
    expect(terbilang(122_767.86)).toBe('seratus dua puluh dua ribu tujuh ratus enam puluh delapan')
  })

  it('skala triliun: 1.000.000.000.000 → "satu triliun"', () => {
    expect(terbilang(1_000_000_000_000)).toBe('satu triliun')
    expect(terbilang(2_500_000_000_000)).toBe('dua triliun lima ratus milyar')
  })
})

describe('formatDateID — regresi issue #3', () => {
  it('bulan di luar 1-12 dikembalikan apa adanya', () => {
    expect(formatDateID('2026-13-01')).toBe('2026-13-01')
  })

  it('tanggal valid tetap diformat', () => {
    expect(formatDateID('2026-06-24')).toBe('24 Juni 2026')
  })
})
