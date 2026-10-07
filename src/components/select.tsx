"use client"

import React, { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"

// Drop-in replacement for <select> with keyboard-first behavior:
//   • Type to filter the list (e.g. "14" → 14K)
//   • ↑ / ↓ move the highlight
//   • Enter or Tab picks the highlighted option and moves to the next field
//   • Esc closes without changing anything
// It takes the same props as a native <select> (value / defaultValue /
// onChange(e => e.target.value) / name / required / disabled / className /
// <option> children), so existing code works unchanged.

interface Opt { value: string; label: string; disabled: boolean }

type SelectProps = {
  value?: string | number
  defaultValue?: string | number
  onChange?: (e: { target: { value: string; name?: string }; currentTarget: { value: string; name?: string } }) => void
  name?: string
  id?: string
  required?: boolean
  disabled?: boolean
  className?: string
  title?: string
  autoFocus?: boolean
  children?: React.ReactNode
  "aria-label"?: string
}

function textOf(node: React.ReactNode): string {
  if (node == null || typeof node === "boolean") return ""
  if (typeof node === "string" || typeof node === "number") return String(node)
  if (Array.isArray(node)) return node.map(textOf).join("")
  if (React.isValidElement(node)) return textOf((node.props as { children?: React.ReactNode }).children)
  return ""
}

function filterOptions(options: Opt[], q: string): Opt[] {
  if (!q) return options
  const starts = options.filter((o: Opt) => o.label.toLowerCase().startsWith(q))
  const contains = options.filter((o: Opt) => !o.label.toLowerCase().startsWith(q) && o.label.toLowerCase().includes(q))
  return [...starts, ...contains]
}

function collectOptions(children: React.ReactNode, out: Opt[] = []): Opt[] {
  React.Children.forEach(children, (child: React.ReactNode) => {
    if (!React.isValidElement(child)) return
    const props = child.props as { value?: string | number; children?: React.ReactNode; disabled?: boolean }
    if (child.type === "option") {
      const label = textOf(props.children)
      out.push({ value: props.value != null ? String(props.value) : label, label, disabled: !!props.disabled })
    } else if (props.children) {
      collectOptions(props.children, out) // fragments / groups
    }
  })
  return out
}

// Next (or previous) focusable field on the page, for Enter/Tab
function focusSibling(from: HTMLElement, backwards = false) {
  const all = Array.from(
    document.querySelectorAll<HTMLElement>("input, select, textarea, button, a[href], [tabindex]")
  ).filter(el =>
    !el.hasAttribute("disabled") && el.tabIndex >= 0 && el.offsetParent !== null &&
    !(el instanceof HTMLInputElement && el.type === "hidden")
  )
  const i = all.indexOf(from)
  const next = all[backwards ? i - 1 : i + 1]
  next?.focus()
  if (next instanceof HTMLInputElement && (next.type === "text" || next.type === "number" || next.type === "tel" || next.type === "email")) {
    try { next.select() } catch { /* some input types can't select */ }
  }
}

export function Select({
  value, defaultValue, onChange, name, id, required, disabled, className = "", title, autoFocus, children,
  "aria-label": ariaLabel,
}: SelectProps) {
  const options: Opt[] = useMemo(() => collectOptions(children), [children])
  const controlled = value !== undefined
  const [inner, setInner] = useState(defaultValue != null ? String(defaultValue) : (options[0]?.value ?? ""))
  const current = controlled ? String(value ?? "") : inner

  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [hi, setHi] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const listId = useId()
  // The list floats above the page (portal + fixed position) so scrolling
  // table containers can't clip it; it opens upward when there's no room below
  const [pos, setPos] = useState<{ left: number; top?: number; bottom?: number; minWidth: number; maxHeight: number } | null>(null)

  useLayoutEffect(() => {
    if (!open) return
    const place = () => {
      const r = inputRef.current?.getBoundingClientRect()
      if (!r) return
      const below = window.innerHeight - r.bottom - 8
      const above = r.top - 8
      const up = below < 200 && above > below
      const maxHeight = Math.max(120, Math.min(256, up ? above : below))
      const left = Math.min(r.left, window.innerWidth - Math.max(r.width, 160) - 8)
      setPos(up
        ? { left, bottom: window.innerHeight - r.top + 4, minWidth: r.width, maxHeight }
        : { left, top: r.bottom + 4, minWidth: r.width, maxHeight })
    }
    place()
    window.addEventListener("scroll", place, true)
    window.addEventListener("resize", place)
    return () => { window.removeEventListener("scroll", place, true); window.removeEventListener("resize", place) }
  }, [open])

  const selected = options.find(o => o.value === current)
  const q = query.trim().toLowerCase()
  const shown: Opt[] = useMemo(() => filterOptions(options, q), [options, q])

  // Open (or re-filter) and set the highlight in the same update, so fast
  // key presses never race a later highlight reset
  function openWith(nextQuery: string) {
    const nq = nextQuery.trim().toLowerCase()
    const list = filterOptions(options, nq)
    let i = nq ? -1 : list.findIndex(o => o.value === current)
    if (i < 0) i = list.findIndex(o => !o.disabled)
    setQuery(nextQuery)
    setHi(i)
    setOpen(true)
  }

  // Scroll the highlighted option into view
  useEffect(() => {
    if (!open || hi < 0) return
    listRef.current?.children[hi]?.scrollIntoView({ block: "nearest" })
  }, [open, hi])

  // Close when clicking elsewhere
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent | TouchEvent) => {
      const t = e.target as Node
      if (!wrapRef.current?.contains(t) && !listRef.current?.contains(t)) { setOpen(false); setQuery("") }
    }
    document.addEventListener("mousedown", onDown)
    document.addEventListener("touchstart", onDown)
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("touchstart", onDown) }
  }, [open])

  function choose(opt: Opt | undefined) {
    setOpen(false)
    setQuery("")
    if (!opt || opt.disabled || opt.value === current) return
    if (!controlled) setInner(opt.value)
    const target = { value: opt.value, name }
    onChange?.({ target, currentTarget: target })
  }

  function move(delta: number) {
    if (!shown.length) return
    let i = hi
    for (let n = 0; n < shown.length; n++) {
      i = (i + delta + shown.length) % shown.length
      if (!shown[i].disabled) break
    }
    setHi(i)
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (disabled) return
    const k = e.key
    if (!open) {
      if (k === "ArrowDown" || k === "ArrowUp" || k === " " || (k === "Enter" && !e.metaKey && !e.ctrlKey)) {
        e.preventDefault()
        openWith("")
        return
      }
      if (k.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault()
        openWith(k)
      }
      return
    }
    switch (k) {
      case "ArrowDown": e.preventDefault(); move(1); break
      case "ArrowUp": e.preventDefault(); move(-1); break
      case "Home": e.preventDefault(); setHi(0); break
      case "End": e.preventDefault(); setHi(shown.length - 1); break
      case "Escape": e.preventDefault(); setOpen(false); setQuery(""); break
      case "Enter":
        e.preventDefault() // never submit the form from a dropdown
        choose(shown[hi])
        focusSibling(e.currentTarget)
        break
      case "Tab":
        // Pick the highlighted option; the browser then moves focus as usual
        if (q || hi >= 0) choose(shown[hi])
        else { setOpen(false); setQuery("") }
        break
    }
  }

  // Layout classes (width, margins, grid/flex sizing) belong on the wrapper;
  // the look (border, padding, text) stays on the input itself
  const isLayout = (c: string) => /^(-?m[trblxy]?-|w-|min-w-|max-w-|flex-|grow|shrink|col-span-|basis-|self-|justify-self-|block$|inline-block$|hidden$|sm:|md:|lg:)/.test(c)
  const classes = className.split(/\s+/).filter(Boolean)
  const layout = classes.filter(isLayout)
  const inputClass = classes.filter(c => !isLayout(c)).join(" ")
  const hasWidth = layout.some(c => /^(w-|flex-1|grow|col-span-|block$)/.test(c.replace(/^(sm|md|lg):/, "")))
  const wrapClass = `${hasWidth ? "block" : "inline-block"} ${layout.filter(c => c !== "block").join(" ")}`

  const display = open ? query : (selected?.label ?? "")
  const placeholder = open ? (selected?.label || "Type to search…") : ""

  return (
    <div ref={wrapRef} className={`relative ${wrapClass}`}>
      <input
        ref={inputRef}
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-label={ariaLabel}
        title={title}
        autoFocus={autoFocus}
        autoComplete="off"
        spellCheck={false}
        disabled={disabled}
        readOnly={!open}
        value={display}
        placeholder={placeholder}
        onChange={e => openWith(e.target.value)}
        onKeyDown={onKeyDown}
        onMouseDown={() => { if (disabled) return; if (open) { setOpen(false); setQuery("") } else openWith("") }}
        className={`${inputClass} w-full pr-7 cursor-pointer text-left truncate ${disabled ? "opacity-60 cursor-not-allowed" : ""}`}
      />
      <span aria-hidden className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 text-[10px]">▼</span>

      {/* Keeps native form submission (FormData) and "required" checks working */}
      {name && <input type="hidden" name={name} value={current} />}
      {required && (
        <input tabIndex={-1} aria-hidden required value={current} onChange={() => {}}
          className="absolute inset-0 opacity-0 pointer-events-none"
          onFocus={() => inputRef.current?.focus()} />
      )}

      {open && pos && typeof document !== "undefined" && createPortal(
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          style={{ position: "fixed", left: pos.left, top: pos.top, bottom: pos.bottom, minWidth: pos.minWidth, maxHeight: pos.maxHeight }}
          className="z-[1000] w-max max-w-[22rem] overflow-auto rounded-md border border-gray-200 bg-white py-1 text-sm shadow-lg print:hidden"
        >
          {shown.length === 0 && <li className="px-3 py-1.5 text-gray-400">No matches</li>}
          {shown.map((o, i) => (
            <li
              key={`${o.value}-${i}`}
              role="option"
              aria-selected={o.value === current}
              onMouseDown={e => { e.preventDefault(); choose(o); inputRef.current?.focus() }}
              onMouseEnter={() => setHi(i)}
              className={[
                "px-3 py-1.5 cursor-pointer whitespace-nowrap",
                o.disabled ? "text-gray-300 cursor-not-allowed" : "",
                i === hi ? "bg-blue-600 text-white" : o.value === current ? "bg-blue-50 text-gray-900" : "text-gray-800",
                o.value === "" ? "italic" : "",
              ].join(" ")}
            >
              {o.label || " "}
            </li>
          ))}
        </ul>,
        document.body
      )}
    </div>
  )
}
