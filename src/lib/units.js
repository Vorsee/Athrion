// Weights are stored in lb everywhere (weight_lb, logged sets). The person's
// unit only changes what is shown and how typed values are read.
import { createContext, useContext } from 'react'

export const LB_PER_KG = 2.20462

const UnitContext = createContext('lb')
export const UnitProvider = UnitContext.Provider

// lb -> the display unit, rounded to 0.1
export function fromLb(lb, unit) {
  if (lb == null || lb === '') return lb
  const n = unit === 'kg' ? Number(lb) / LB_PER_KG : Number(lb)
  return Math.round(n * 10) / 10
}

// a value typed in the display unit -> lb
export function toLb(value, unit) {
  const n = Number(value)
  if (!Number.isFinite(n)) return n
  return unit === 'kg' ? Math.round(n * LB_PER_KG * 100) / 100 : n
}

export function fmtWeight(lb, unit) {
  return `${fromLb(lb, unit)} ${unit}`
}

export function useUnit() {
  const unit = useContext(UnitContext)
  return {
    unit,
    fromLb: lb => fromLb(lb, unit),
    toLb: v => toLb(v, unit),
    fmt: lb => fmtWeight(lb, unit),
    fmtVolume: lb => `${Math.round(fromLb(lb, unit)).toLocaleString()} ${unit}`, // weight x reps totals
  }
}
