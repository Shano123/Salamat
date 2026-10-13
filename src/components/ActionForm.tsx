"use client";
import { useActionState, useEffect, useRef } from "react";

export type ActionState = { ok?: string; error?: string; data?: unknown } | null;
type Action = (prev: ActionState, fd: FormData) => Promise<ActionState>;

export function ActionForm({
  action,
  children,
  className,
  resetOnSuccess = false,
  confirm,
  onDone,
}: {
  action: Action;
  children: React.ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
  confirm?: string;
  onDone?: (s: ActionState) => void;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok && resetOnSuccess) ref.current?.reset();
    if (state) onDone?.(state);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);
  return (
    <form
      ref={ref}
      action={formAction}
      className={className}
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      <fieldset disabled={pending} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
        {children}
      </fieldset>
      {state?.error && <div className="alert danger" style={{ marginTop: 10 }} role="alert">{state.error}</div>}
      {state?.ok && <div className="alert ok" style={{ marginTop: 10 }} role="status">{state.ok}</div>}
    </form>
  );
}
