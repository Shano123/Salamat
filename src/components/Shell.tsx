"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

export interface NavItem {
  href: string;
  label: string;
  badge?: number;
}
export interface NavSection {
  title: string;
  items: NavItem[];
}

export function Shell({
  sections,
  brand,
  tagline,
  topbar,
  children,
}: {
  sections: NavSection[];
  brand: string;
  tagline: string;
  topbar: React.ReactNode;
  children: React.ReactNode;
}) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  return (
    <div className="shell">
      <aside className={`sidebar ${open ? "open" : ""}`} onClick={() => setOpen(false)}>
        <div className="brand">
          <div className="brand-mark">S</div>
          <div>
            <strong>{brand}</strong>
            <small className="muted">{tagline}</small>
          </div>
        </div>
        <nav className="nav" aria-label="Main">
          {sections
            .filter((s) => s.items.length)
            .map((s) => (
              <div key={s.title}>
                <div className="nav-section">{s.title}</div>
                {s.items.map((i) => (
                  <Link key={i.href} href={i.href} className={path === i.href || path.startsWith(i.href + "/") ? "active" : ""}>
                    <span>{i.label}</span>
                    {!!i.badge && <span className="badge warn">{i.badge}</span>}
                  </Link>
                ))}
              </div>
            ))}
        </nav>
      </aside>
      <div className="main">
        <header className="topbar">
          <button className="menu-toggle small" onClick={() => setOpen((o) => !o)} aria-label="Menu">☰</button>
          {topbar}
        </header>
        <main className="content">{children}</main>
      </div>
    </div>
  );
}
