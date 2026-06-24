"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { signOut, useSession } from "next-auth/react"

interface NavItem {
  name: string
  href: string
  children?: { name: string; href: string }[]
}

interface NavGroup {
  name: string
  items: NavItem[]
}

type NavEntry = NavItem | NavGroup

function isGroup(entry: NavEntry): entry is NavGroup {
  return "items" in entry
}

const navigation: NavEntry[] = [
  { name: "Dashboard", href: "/" },
  {
    name: "CRM",
    items: [
      { name: "Leads", href: "/leads" },
      { name: "Messages", href: "/conversations" },
      { name: "Appointments", href: "/appointments" },
      { name: "Customers", href: "/customers" },
    ],
  },
  {
    name: "Stock",
    items: [
      { name: "Inventory", href: "/inventory" },
      { name: "Purchases", href: "/purchases" },
      { name: "Invoices", href: "/documents/invoices/new" },
      { name: "Memos", href: "/documents/memos/new" },
      { name: "Stock Documents", href: "/documents", children: [
        { name: "Transfer", href: "/documents/invoices/new?type=transfer" },
        { name: "Insert Stock", href: "/inventory/import" },
      ]},
      { name: "Categories", href: "/categories" },
      { name: "Brands & Stones", href: "/brands" },
    ],
  },
  { name: "Reports", href: "/reports" },
  { name: "Compensation", href: "/compensation" },
]

function DropdownMenu({ group, pathname }: { group: NavGroup; pathname: string }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const isActive = group.items.some(i => pathname === i.href || pathname.startsWith(i.href + "/"))

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", handle)
    return () => document.removeEventListener("mousedown", handle)
  }, [])

  return (
    <div ref={ref} className="relative inline-flex items-center">
      <button
        onClick={() => setOpen(!open)}
        className={`inline-flex items-center gap-1 px-1 pt-1 border-b-2 text-sm font-medium h-full ${
          isActive
            ? "border-blue-500 text-gray-900"
            : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700"
        }`}
      >
        {group.name}
        <svg className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 w-48 bg-white rounded-md shadow-lg border border-gray-200 py-1 z-50">
          {group.items.map(item => (
            <div key={item.name}>
              <Link
                href={item.href}
                onClick={() => setOpen(false)}
                className={`block px-4 py-2 text-sm ${
                  pathname === item.href || pathname.startsWith(item.href + "/")
                    ? "bg-blue-50 text-blue-700 font-medium"
                    : "text-gray-700 hover:bg-gray-50"
                }`}
              >
                {item.name}
              </Link>
              {item.children?.map(child => (
                <Link
                  key={child.name}
                  href={child.href}
                  onClick={() => setOpen(false)}
                  className={`block pl-8 pr-4 py-1.5 text-xs ${
                    pathname === child.href || pathname.startsWith(child.href + "/")
                      ? "bg-blue-50 text-blue-700 font-medium"
                      : "text-gray-500 hover:bg-gray-50 hover:text-gray-700"
                  }`}
                >
                  {child.name}
                </Link>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function Navbar() {
  const pathname = usePathname()
  const { data: session } = useSession()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  return (
    <nav className="bg-white shadow">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex">
            <div className="flex-shrink-0 flex items-center">
              <span className="text-xl font-bold text-gray-900">ATX Gold</span>
            </div>
            {/* Desktop navigation */}
            <div className="hidden sm:ml-6 sm:flex sm:space-x-8">
              {navigation.map(entry =>
                isGroup(entry) ? (
                  <DropdownMenu key={entry.name} group={entry} pathname={pathname} />
                ) : (
                  <Link
                    key={entry.name}
                    href={entry.href}
                    className={`inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium ${
                      pathname === entry.href
                        ? "border-blue-500 text-gray-900"
                        : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700"
                    }`}
                  >
                    {entry.name}
                  </Link>
                )
              )}
            </div>
          </div>

          {/* Desktop user info */}
          <div className="hidden sm:flex sm:items-center">
            <span className="text-sm text-gray-500 mr-4">
              {session?.user?.name || session?.user?.email}
            </span>
            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              Sign out
            </button>
          </div>

          {/* Mobile hamburger button */}
          <div className="flex items-center sm:hidden">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="inline-flex items-center justify-center p-2 rounded-md text-gray-500 hover:text-gray-700 hover:bg-gray-100"
            >
              {mobileMenuOpen ? (
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileMenuOpen && (
        <div className="sm:hidden border-t border-gray-200">
          <div className="pt-2 pb-3 space-y-1">
            {navigation.map(entry =>
              isGroup(entry) ? (
                <div key={entry.name}>
                  <div className="pl-4 pr-4 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                    {entry.name}
                  </div>
                  {entry.items.map(item => (
                    <Link
                      key={item.name}
                      href={item.href}
                      onClick={() => setMobileMenuOpen(false)}
                      className={`block pl-8 pr-4 py-3 text-base font-medium ${
                        pathname === item.href || pathname.startsWith(item.href + "/")
                          ? "bg-blue-50 border-l-4 border-blue-500 text-blue-700"
                          : "border-l-4 border-transparent text-gray-500 hover:bg-gray-50 hover:text-gray-700"
                      }`}
                    >
                      {item.name}
                    </Link>
                  ))}
                </div>
              ) : (
                <Link
                  key={entry.name}
                  href={entry.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`block pl-4 pr-4 py-3 text-base font-medium ${
                    pathname === entry.href
                      ? "bg-blue-50 border-l-4 border-blue-500 text-blue-700"
                      : "border-l-4 border-transparent text-gray-500 hover:bg-gray-50 hover:text-gray-700"
                  }`}
                >
                  {entry.name}
                </Link>
              )
            )}
          </div>
          <div className="pt-3 pb-3 border-t border-gray-200 px-4">
            <div className="text-sm text-gray-500 mb-2">
              {session?.user?.name || session?.user?.email}
            </div>
            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="text-sm text-red-600 hover:text-red-800"
            >
              Sign out
            </button>
          </div>
        </div>
      )}
    </nav>
  )
}
