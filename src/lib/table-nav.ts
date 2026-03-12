import React from "react"

/**
 * Intercepts ArrowUp/Down on table inputs — prevents number value changes
 * and moves focus to the same column in the adjacent row instead.
 */
export function arrowNav(e: React.KeyboardEvent<HTMLInputElement>) {
  if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return
  e.preventDefault()
  const td = e.currentTarget.closest("td")
  const tr = e.currentTarget.closest("tr")
  if (!td || !tr) return
  const tds = Array.from(tr.querySelectorAll("td"))
  const tdIndex = tds.indexOf(td as HTMLTableCellElement)
  const tbody = tr.closest("tbody")
  if (!tbody) return
  const rows = Array.from(tbody.querySelectorAll("tr"))
  const rowIndex = rows.indexOf(tr as HTMLTableRowElement)
  const targetRow = e.key === "ArrowDown" ? rows[rowIndex + 1] : rows[rowIndex - 1]
  if (!targetRow) return
  const targetInput = (targetRow.querySelectorAll("td")[tdIndex])?.querySelector<HTMLInputElement>("input")
  targetInput?.focus()
}
