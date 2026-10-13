"use client";
import { useEffect, useState } from "react";
import { kioskPunch } from "../actions/kiosk";

type Step = "emp" | "pin";

export function KioskClient({ token, branch }: { token: string; branch: string }) {
  const [step, setStep] = useState<Step>("emp");
  const [emp, setEmp] = useState("");
  const [pin, setPin] = useState("");
  const [msg, setMsg] = useState<{ tone: string; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState<string>("");

  useEffect(() => {
    const tick = () => setNow(new Date().toLocaleTimeString("en-GB", { timeZone: "Asia/Riyadh" }));
    tick();
    const id = setInterval(tick, 1000);
    // QR codes on badges encode "EMP:<employeeNo>"; a USB/camera scanner types it in.
    const params = new URLSearchParams(window.location.search);
    const scanned = params.get("emp");
    if (scanned) {
      setEmp(scanned);
      setStep("pin");
    }
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!msg) return;
    const id = setTimeout(() => setMsg(null), 6000);
    return () => clearTimeout(id);
  }, [msg]);

  const value = step === "emp" ? emp : pin;
  const set = step === "emp" ? setEmp : setPin;

  async function submit() {
    if (step === "emp") {
      const no = emp.replace(/^EMP:/i, "").trim();
      if (!no) return;
      setEmp(no);
      setStep("pin");
      return;
    }
    setBusy(true);
    const r = await kioskPunch({ token, employeeNo: emp, pin });
    setMsg(r.error ? { tone: "danger", text: r.error } : { tone: "ok", text: r.ok! });
    setEmp("");
    setPin("");
    setStep("emp");
    setBusy(false);
  }

  return (
    <div className="card stack center" style={{ width: 360 }}>
      <strong>{branch}</strong>
      <div className="clock-face">{now}</div>
      <label>
        {step === "emp" ? "Employee number (or scan badge QR)" : "PIN"}
        <input
          autoFocus
          inputMode="numeric"
          type={step === "pin" ? "password" : "text"}
          value={value}
          onChange={(e) => set(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          style={{ fontSize: 22, textAlign: "center" }}
        />
      </label>
      <div className="pinpad">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9", "⌫", "0", "✓"].map((k) => (
          <button
            key={k}
            disabled={busy}
            className={k === "✓" ? "primary" : ""}
            onClick={() => (k === "⌫" ? set(value.slice(0, -1)) : k === "✓" ? submit() : set(value + k))}
          >
            {k}
          </button>
        ))}
      </div>
      {step === "pin" && <button className="small" onClick={() => { setStep("emp"); setPin(""); }}>Cancel</button>}
      {msg && <div className={`alert ${msg.tone}`} style={{ fontSize: 16 }}>{msg.text}</div>}
    </div>
  );
}
