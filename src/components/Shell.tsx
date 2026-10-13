"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Icon } from "./Icon";

export interface NavItem {
  href: string;
  label: string;
  icon: string;
  badge?: number;
}
export interface NavSection {
  title: string;
  items: NavItem[];
}

function isActive(path: string, href: string, all: string[]) {
  if (path === href) return true;
  if (!path.startsWith(href + "/")) return false;
  // Prefer the most specific match (e.g. /roster/import over /roster).
  return !all.some((h) => h !== href && h.startsWith(href + "/") && (path === h || path.startsWith(h + "/")));
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
  useEffect(() => setOpen(false), [path]);
  const all = sections.flatMap((s) => s.items.map((i) => i.href));
  const current = sections.flatMap((s) => s.items).find((i) => isActive(path, i.href, all));

  return (
    <div className="shell">
      {open && <div className="scrim" onClick={() => setOpen(false)} />}
      <aside className={`sidebar ${open ? "open" : ""}`}>
        <Link href="/dashboard" className="brand">
          <span className="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </span>
          <span>
            <span className="brand-name">{brand}</span>
            <span className="brand-tag">{tagline}</span>
          </span>
        </Link>
        <nav className="nav" aria-label="Main">
          {sections
            .filter((s) => s.items.length)
            .map((s) => (
              <div key={s.title} className="nav-group">
                <div className="nav-section">{s.title}</div>
                {s.items.map((i) => {
                  const active = isActive(path, i.href, all);
                  return (
                    <Link key={i.href} href={i.href} className={active ? "active" : ""} aria-current={active ? "page" : undefined}>
                      <Icon name={i.icon} size={17} />
                      <span className="nav-label">{i.label}</span>
                      {!!i.badge && <span className="nav-badge">{i.badge}</span>}
                    </Link>
                  );
                })}
              </div>
            ))}
        </nav>
        <div className="sidebar-foot">Attendance &amp; Roster · v1.0</div>
      </aside>
      <div className="main">
        <header className="topbar">
          <button className="icon-btn menu-toggle" onClick={() => setOpen((o) => !o)} aria-label="Open menu">
            <Icon name="menu" />
          </button>
          <div className="topbar-title">{current?.label ?? ""}</div>
          <div className="topbar-actions">{topbar}</div>
        </header>
        <main className="content">{children}</main>
      </div>
    </div>
  );
}
