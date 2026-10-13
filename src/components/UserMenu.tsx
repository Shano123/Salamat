import Link from "next/link";
import { logout } from "@/app/actions/session";
import { Icon } from "./Icon";

export function UserMenu({ name, email, role, delegate }: { name: string; email: string; role: string; delegate: boolean }) {
  const initials = name
    .replace(/^Dr\.?\s+/i, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
  return (
    <details className="user-menu">
      <summary>
        <span className="avatar" aria-hidden="true">{initials || "U"}</span>
        <span className="user-meta">
          <span className="user-name">{name}</span>
          <span className="user-role">{role}{delegate ? " · acting delegate" : ""}</span>
        </span>
        <Icon name="chevronDown" size={16} />
      </summary>
      <div className="menu-pop" role="menu">
        <div className="menu-head">
          <strong>{name}</strong>
          <span>{email}</span>
        </div>
        <Link href="/account" role="menuitem"><Icon name="key" size={16} /> My account</Link>
        <Link href="/notifications" role="menuitem"><Icon name="bell" size={16} /> Notifications</Link>
        <form action={logout}>
          <button type="submit" role="menuitem"><Icon name="logout" size={16} /> Sign out</button>
        </form>
      </div>
    </details>
  );
}
