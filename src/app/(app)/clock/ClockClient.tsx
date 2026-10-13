"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { clockPunch, ClockPayload } from "@/app/actions/clock";
import { useT } from "@/lib/i18n/client";

type PunchType = ClockPayload["type"];
const QUEUE_KEY = "salamat.offlinePunches";
const DEVICE_KEY = "salamat.deviceId";

function readQueue(): ClockPayload[] {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) ?? "[]");
  } catch {
    return [];
  }
}
function writeQueue(q: ClockPayload[]) {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
  } catch {
    /* storage unavailable */
  }
}
function deviceId(): string {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    return "unknown";
  }
}

function getPosition(): Promise<GeolocationPosition | null> {
  return new Promise((resolve) => {
    if (!("geolocation" in navigator)) return resolve(null);
    navigator.geolocation.getCurrentPosition(resolve, () => resolve(null), { enableHighAccuracy: true, timeout: 10_000, maximumAge: 0 });
  });
}

export function ClockClient({ suggested, selfieAvailable, tz }: { suggested: PunchType; selfieAvailable: boolean; tz: string }) {
  const { t } = useT();
  const [now, setNow] = useState<Date | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: string; text: string } | null>(null);
  const [queued, setQueued] = useState(0);
  const [selfie, setSelfie] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const flush = useCallback(async () => {
    const q = readQueue();
    if (!q.length || !navigator.onLine) return;
    const left: ClockPayload[] = [];
    for (const p of q) {
      const r = await clockPunch(p).catch(() => ({ error: "network" }));
      if (r.error === "network") left.push(p);
      else if (r.error) setMsg({ tone: "danger", text: `Queued punch rejected: ${r.error}` });
    }
    writeQueue(left);
    setQueued(left.length);
    if (q.length !== left.length) setMsg({ tone: "ok", text: `Synced ${q.length - left.length} offline punch(es).` });
  }, []);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    setQueued(readQueue().length);
    flush();
    window.addEventListener("online", flush);
    return () => {
      clearInterval(id);
      window.removeEventListener("online", flush);
    };
  }, [flush]);

  async function punch(type: PunchType) {
    setBusy(true);
    setMsg({ tone: "info", text: t("clock.locating") });
    const pos = await getPosition();
    const payload: ClockPayload = {
      type,
      lat: pos?.coords.latitude ?? null,
      lng: pos?.coords.longitude ?? null,
      selfie,
      deviceId: deviceId(),
    };
    if (!navigator.onLine) {
      const q = [...readQueue(), { ...payload, offline: true, clientTime: new Date().toISOString() }];
      writeQueue(q);
      setQueued(q.length);
      setMsg({ tone: "warn", text: t("clock.offlineQueued") });
      setBusy(false);
      return;
    }
    try {
      const r = await clockPunch(payload);
      setMsg(r.error ? { tone: "danger", text: r.error } : { tone: "ok", text: r.ok! });
      if (r.ok) setSelfie(null);
    } catch {
      const q = [...readQueue(), { ...payload, offline: true, clientTime: new Date().toISOString() }];
      writeQueue(q);
      setQueued(q.length);
      setMsg({ tone: "warn", text: t("clock.offlineQueued") });
    }
    setBusy(false);
  }

  function onSelfie(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const img = new Image();
    const url = URL.createObjectURL(f);
    img.onload = () => {
      const scale = Math.min(1, 640 / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = img.width * scale;
      c.height = img.height * scale;
      c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
      setSelfie(c.toDataURL("image/jpeg", 0.8));
      URL.revokeObjectURL(url);
    };
    img.src = url;
  }

  const time = now?.toLocaleTimeString("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", second: "2-digit" }) ?? "--:--:--";
  const order: PunchType[] = [suggested, ...(["IN", "OUT", "BREAK_START", "BREAK_END"] as PunchType[]).filter((x) => x !== suggested)];
  const label: Record<PunchType, string> = { IN: t("clock.in"), OUT: t("clock.out"), BREAK_START: t("clock.breakStart"), BREAK_END: t("clock.breakEnd") };

  return (
    <div className="card stack center" style={{ maxWidth: 480, margin: "0 auto" }}>
      <div className="clock-face" suppressHydrationWarning>{time}</div>
      <small className="muted">{tz}</small>
      <button className="primary big" style={{ justifyContent: "center" }} disabled={busy} onClick={() => punch(order[0])}>
        {label[order[0]]}
      </button>
      <div className="row" style={{ justifyContent: "center" }}>
        {order.slice(1).map((ty) => (
          <button key={ty} className="small" disabled={busy} onClick={() => punch(ty)}>{label[ty]}</button>
        ))}
      </div>
      {selfieAvailable && (
        <div className="stack" style={{ alignItems: "center" }}>
          <input ref={fileRef} type="file" accept="image/*" capture="user" onChange={onSelfie} hidden />
          <button type="button" className="small" onClick={() => fileRef.current?.click()}>📷 {t("clock.selfie")}{selfie ? " ✓" : ""}</button>
          {selfie && <img src={selfie} alt="Selfie preview" style={{ width: 96, height: 96, objectFit: "cover", borderRadius: 8 }} />}
        </div>
      )}
      {msg && <div className={`alert ${msg.tone}`}>{msg.text}</div>}
      {queued > 0 && <div className="alert warn">{queued} punch(es) waiting to sync.</div>}
      <small className="muted">{t("clock.consent")}</small>
    </div>
  );
}
