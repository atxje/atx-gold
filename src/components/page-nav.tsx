"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"

// The same row of shortcut buttons at the top of every page:
//   [← Back]  [Dashboard]  [related pages…]  [+ start the next one]
// "Back" appears on forms and detail pages; "Dashboard" is always there; the
// rest depend on the page. `primary` marks the "start a new one" shortcut.

export interface PageNavLink {
  label: string
  href: string
  primary?: boolean
}

const base = "inline-flex items-center gap-1 whitespace-nowrap px-3 py-1.5 rounded-md text-sm font-medium border transition-colors"
const plain = "border-gray-300 text-gray-700 bg-white hover:bg-gray-50"
const primaryCls = "border-amber-500 text-amber-700 bg-amber-50 hover:bg-amber-100"

export function PageNav({
  links = [],
  back = false,
  className = "mb-4",
}: {
  links?: (PageNavLink | null | false | undefined)[]
  back?: boolean
  className?: string
}) {
  const router = useRouter()
  return (
    <nav aria-label="Page shortcuts" className={`print:hidden flex flex-wrap items-center gap-2 ${className}`}>
      {back && (
        <button type="button" onClick={() => router.back()} className={`${base} ${plain}`}>
          <span aria-hidden>←</span> Back
        </button>
      )}
      <Link href="/" className={`${base} ${plain}`}>
        <span aria-hidden>⌂</span> Dashboard
      </Link>
      {links.map(l => l && (
        <Link key={l.href + l.label} href={l.href} className={`${base} ${l.primary ? primaryCls : plain}`}>
          {l.label}
        </Link>
      ))}
    </nav>
  )
}
