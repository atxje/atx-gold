"use client"

import { useEffect, useState } from "react"

export interface DiamondData {
  shape: string
  caratWeight: string
  color: string
  clarity: string
  lab: string
  certNumber: string
  cutGrade: string
  polish: string
  symmetry: string
  fluorescence: string
  measurements: string
  costPerCarat: string
  rapPrice: string
  rapDiscount: string
  notes: string
}

const SHAPES = ["Round", "Princess", "Cushion", "Oval", "Emerald", "Pear", "Marquise", "Radiant", "Asscher", "Heart", "Other"]
const COLORS = ["D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O-P", "Q-R", "S-Z", "Fancy"]
const CLARITIES = ["FL", "IF", "VVS1", "VVS2", "VS1", "VS2", "SI1", "SI2", "I1", "I2", "I3"]
const LABS = ["", "GIA", "AGS", "IGI", "EGL", "HRD", "Other"]
const GRADES = ["", "Excellent", "Very Good", "Good", "Fair", "Poor"]
const FLUORESCENCE = ["", "None", "Faint", "Medium", "Strong", "Very Strong"]

const empty: DiamondData = {
  shape: "", caratWeight: "", color: "", clarity: "", lab: "", certNumber: "",
  cutGrade: "", polish: "", symmetry: "", fluorescence: "", measurements: "",
  costPerCarat: "", rapPrice: "", rapDiscount: "", notes: "",
}

interface Props {
  open: boolean
  onClose: () => void
  onSave: (data: DiamondData) => void
  initial?: Partial<DiamondData>
  /** Total cost from parent form — used for bidirectional calc */
  totalCost?: number
}

const labelClass = "block text-xs font-medium text-gray-600 mb-1"
const inputClass = "w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
const selectClass = inputClass

export function DiamondModal({ open, onClose, onSave, initial, totalCost }: Props) {
  const [data, setData] = useState<DiamondData>({ ...empty })
  const [pricingMode, setPricingMode] = useState<"manual" | "rap">("manual")

  useEffect(() => {
    if (open) {
      setData({ ...empty, ...initial })
      setPricingMode(initial?.rapDiscount ? "rap" : "manual")
    }
  }, [open, initial])

  function set(field: keyof DiamondData, value: string) {
    setData(prev => {
      const next = { ...prev, [field]: value }

      // Bidirectional calc: costPerCarat ↔ totalCost
      if (field === "costPerCarat" && next.caratWeight) {
        // Don't override parent totalCost from here — parent handles it
      }
      if (field === "caratWeight" && next.costPerCarat) {
        // recalc is done by parent
      }

      // Rap discount calc
      if (pricingMode === "rap") {
        const rap = parseFloat(next.rapPrice)
        const disc = parseFloat(next.rapDiscount)
        const ct = parseFloat(next.caratWeight)
        if (rap > 0 && !isNaN(disc) && ct > 0) {
          const pricePerCt = rap * (1 + disc / 100)
          next.costPerCarat = pricePerCt.toFixed(2)
        }
      }

      return next
    })
  }

  if (!open) return null

  const ct = parseFloat(data.caratWeight) || 0
  const cpc = parseFloat(data.costPerCarat) || 0
  const calculatedTotal = ct > 0 && cpc > 0 ? ct * cpc : null

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
          <h3 className="text-lg font-semibold">Diamond Details</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
        </div>

        <div className="px-6 py-4 space-y-4">
          {/* Row 1: Shape, Carat, Color, Clarity */}
          <div className="grid grid-cols-4 gap-3">
            <div>
              <label className={labelClass}>Shape</label>
              <select value={data.shape} onChange={e => set("shape", e.target.value)} className={selectClass}>
                <option value="">Select...</option>
                {SHAPES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>Size (ct)</label>
              <input type="number" step="0.01" value={data.caratWeight} onChange={e => set("caratWeight", e.target.value)}
                className={inputClass} placeholder="0.00" />
            </div>
            <div>
              <label className={labelClass}>Color</label>
              <select value={data.color} onChange={e => set("color", e.target.value)} className={selectClass}>
                <option value="">Select...</option>
                {COLORS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>Clarity</label>
              <select value={data.clarity} onChange={e => set("clarity", e.target.value)} className={selectClass}>
                <option value="">Select...</option>
                {CLARITIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          {/* Row 2: Cut, Polish, Symmetry, Fluorescence */}
          <div className="grid grid-cols-4 gap-3">
            <div>
              <label className={labelClass}>Cut Grade</label>
              <select value={data.cutGrade} onChange={e => set("cutGrade", e.target.value)} className={selectClass}>
                {GRADES.map(g => <option key={g} value={g}>{g || "Select..."}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>Polish</label>
              <select value={data.polish} onChange={e => set("polish", e.target.value)} className={selectClass}>
                {GRADES.map(g => <option key={g} value={g}>{g || "Select..."}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>Symmetry</label>
              <select value={data.symmetry} onChange={e => set("symmetry", e.target.value)} className={selectClass}>
                {GRADES.map(g => <option key={g} value={g}>{g || "Select..."}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>Fluorescence</label>
              <select value={data.fluorescence} onChange={e => set("fluorescence", e.target.value)} className={selectClass}>
                {FLUORESCENCE.map(f => <option key={f} value={f}>{f || "Select..."}</option>)}
              </select>
            </div>
          </div>

          {/* Row 3: Lab, Cert#, Measurements */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={labelClass}>Lab</label>
              <select value={data.lab} onChange={e => set("lab", e.target.value)} className={selectClass}>
                {LABS.map(l => <option key={l} value={l}>{l || "None"}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>Cert #</label>
              <input value={data.certNumber} onChange={e => set("certNumber", e.target.value)}
                className={inputClass} placeholder="Certificate number" />
            </div>
            <div>
              <label className={labelClass}>Measurements</label>
              <input value={data.measurements} onChange={e => set("measurements", e.target.value)}
                className={inputClass} placeholder="e.g. 6.5 x 6.5 x 4.0" />
            </div>
          </div>

          {/* Pricing */}
          <div className="border-t pt-4">
            <div className="flex items-center gap-4 mb-3">
              <span className="text-sm font-medium text-gray-700">Pricing Method:</span>
              <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                <input type="radio" checked={pricingMode === "manual"} onChange={() => setPricingMode("manual")} />
                Manual
              </label>
              <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                <input type="radio" checked={pricingMode === "rap"} onChange={() => setPricingMode("rap")} />
                Rap Discount
              </label>
            </div>

            {pricingMode === "manual" ? (
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className={labelClass}>Cost / Carat</label>
                  <input type="number" step="0.01" value={data.costPerCarat} onChange={e => set("costPerCarat", e.target.value)}
                    className={inputClass} placeholder="$0.00" />
                </div>
                <div>
                  <label className={labelClass}>Size (ct)</label>
                  <input type="number" step="0.01" value={data.caratWeight} readOnly
                    className={inputClass + " bg-gray-50"} />
                </div>
                <div>
                  <label className={labelClass}>Total Cost</label>
                  <div className="px-2 py-1.5 text-sm bg-gray-50 border rounded text-gray-700 font-medium">
                    {calculatedTotal !== null ? `$${calculatedTotal.toFixed(2)}` : "—"}
                  </div>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-4 gap-3">
                <div>
                  <label className={labelClass}>Rap Price / ct</label>
                  <input type="number" step="1" value={data.rapPrice} onChange={e => set("rapPrice", e.target.value)}
                    className={inputClass} placeholder="$0" />
                </div>
                <div>
                  <label className={labelClass}>Discount %</label>
                  <input type="number" step="0.1" value={data.rapDiscount} onChange={e => set("rapDiscount", e.target.value)}
                    className={inputClass} placeholder="e.g. -35" />
                </div>
                <div>
                  <label className={labelClass}>Cost / Carat</label>
                  <div className="px-2 py-1.5 text-sm bg-gray-50 border rounded text-gray-700 font-medium">
                    {data.costPerCarat ? `$${parseFloat(data.costPerCarat).toFixed(2)}` : "—"}
                  </div>
                </div>
                <div>
                  <label className={labelClass}>Total Cost</label>
                  <div className="px-2 py-1.5 text-sm bg-gray-50 border rounded text-gray-700 font-medium">
                    {calculatedTotal !== null ? `$${calculatedTotal.toFixed(2)}` : "—"}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Notes */}
          <div>
            <label className={labelClass}>Notes</label>
            <textarea value={data.notes} onChange={e => set("notes", e.target.value)}
              className={inputClass + " h-16 resize-none"} placeholder="Optional notes..." />
          </div>
        </div>

        <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-2">
          <button onClick={onClose}
            className="px-4 py-2 border border-gray-300 text-gray-600 rounded text-sm hover:bg-gray-50">
            Cancel
          </button>
          <button onClick={() => onSave(data)}
            className="px-4 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700">
            Save Details
          </button>
        </div>
      </div>
    </div>
  )
}
