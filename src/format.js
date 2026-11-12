/** format.js — helpers format Rupiah, tanggal ID, terbilang */

const idrFmt = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 })

export function formatIDR(n) {
  const v = Number.isFinite(Number(n)) ? Number(n) : 0
  return 'Rp ' + idrFmt.format(Math.round(v))
}

/** Format angka saja tanpa prefix "Rp" (untuk input fields) */
export function formatNumber(n) {
  return idrFmt.format(Number.isFinite(Number(n)) ? Math.round(Number(n)) : 0)
}

/** Parse string Rupiah/angka → number. "Rp 1.500.000" → 1500000 */
export function parseIDR(str) {
  if (typeof str !== 'string') return Number(str) || 0
  const digits = str.replace(/[^\d-]/g, '')
  return digits ? parseInt(digits, 10) : 0
}

const monthID = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
]

/** ISO (yyyy-mm-dd) → "24 Juni 2026" */
export function formatDateID(iso) {
  if (!iso) return ''
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d || m < 1 || m > 12 || d < 1 || d > 31) return iso
  return `${d} ${monthID[m - 1]} ${y}`
}

/** Terbilang angka → huruf Indonesia (0 - 999.999.999.999.999). */
export function terbilang(num) {
  num = Math.round(Math.abs(Number(num) || 0))
  if (num === 0) return 'nol'
  const satuan = ['', 'satu', 'dua', 'tiga', 'empat', 'lima', 'enam', 'tujuh', 'delapan', 'sembilan']

  function below1000(n) {
    if (n < 10) return satuan[n]
    if (n < 20) {
      if (n === 10) return 'sepuluh'
      if (n === 11) return 'sebelas'
      return satuan[n - 10] + ' belas'
    }
    if (n < 100) {
      return satuan[Math.floor(n / 10)] + ' puluh' + (n % 10 ? ' ' + satuan[n % 10] : '')
    }
    // 100-999
    const ratus = Math.floor(n / 100)
    const rest = n % 100
    let prefix = ratus === 1 ? 'seratus' : satuan[ratus] + ' ratus'
    if (rest) prefix += ' ' + below1000(rest)
    return prefix
  }

  const parts = []
  const triliun = Math.floor(num / 1_000_000_000_000)
  const milyar = Math.floor((num % 1_000_000_000_000) / 1_000_000_000)
  const juta = Math.floor((num % 1_000_000_000) / 1_000_000)
  const ribu = Math.floor((num % 1_000_000) / 1000)
  const sisa = num % 1000

  if (triliun) parts.push(below1000(triliun) + ' triliun')
      if (milyar) parts.push(below1000(milyar) + ' milyar')
  if (juta) parts.push(below1000(juta) + ' juta')
  if (ribu) {
    if (ribu === 1) parts.push('seribu')
    else parts.push(below1000(ribu) + ' ribu')
  }
  if (sisa) parts.push(below1000(sisa))
  return parts.join(' ').trim()
}
