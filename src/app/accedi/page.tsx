"use client";

import { useState, type FormEvent } from "react";
import { ArrowRight, Eye, EyeOff, LoaderCircle } from "lucide-react";
import { BasisMark } from "@/components/BasisMark";
import { authClient } from "@/lib/auth-client";

type Mode = "accedi" | "registrati";

export default function Accedi() {
  const [mode, setMode] = useState<Mode>("accedi");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isSignup = mode === "registrati";

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = isSignup
        ? await authClient.signUp.email({ name: name.trim() || email.split("@")[0], email: email.trim(), password })
        : await authClient.signIn.email({ email: email.trim(), password });
      if (res.error) {
        setError(translate(res.error.message, res.error.status));
        return;
      }
      window.location.replace("/");
    } catch {
      setError("Connessione non riuscita. Controlla la rete e riprova.");
    } finally {
      setBusy(false);
    }
  };

  const switchMode = () => {
    setMode(isSignup ? "accedi" : "registrati");
    setError(null);
  };

  return (
    <div className="flex min-h-dvh flex-col px-6" style={{ paddingTop: "calc(env(safe-area-inset-top) + 10vh)", paddingBottom: "calc(env(safe-area-inset-bottom) + 24px)" }}>
      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col">
        <span className="w-fit overflow-hidden rounded-[15px] shadow-[0_0_0_1px_var(--sep),0_10px_30px_rgb(0_0_0/0.22)]">
          <BasisMark size={60} />
        </span>

        <h1 className="mt-8 text-[34px] font-semibold leading-[1.1] tracking-[-0.04em]">{isSignup ? "Crea il tuo account" : "Bentornato"}</h1>
        <p className="mt-2 text-[16px] leading-snug text-mut">
          {isSignup ? "Il tuo patrimonio, il tuo prezzo medio, le tue tasse. Tutto in un posto." : "Accedi per vedere il tuo patrimonio."}
        </p>

        <form onSubmit={submit} className="mt-9" noValidate>
          <div className="overflow-hidden rounded-[16px] bg-panel">
            {isSignup && (
              <Field label="Nome" htmlFor="name">
                <input id="name" autoComplete="given-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Come ti chiami" className={inputCls} />
              </Field>
            )}
            <Field label="Email" htmlFor="email">
              <input
                id="email"
                type="email"
                inputMode="email"
                autoComplete="email"
                autoCapitalize="none"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nome@esempio.it"
                className={inputCls}
              />
            </Field>
            <Field label="Password" htmlFor="password">
              <div className="flex items-center">
                <input
                  id="password"
                  type={show ? "text" : "password"}
                  autoComplete={isSignup ? "new-password" : "current-password"}
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={isSignup ? "Almeno 8 caratteri" : "La tua password"}
                  className={inputCls}
                />
                <button
                  type="button"
                  onClick={() => setShow(!show)}
                  aria-label={show ? "Nascondi password" : "Mostra password"}
                  className="hit relative -mr-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-mut active:bg-chip"
                >
                  {show ? <EyeOff size={19} /> : <Eye size={19} />}
                </button>
              </div>
            </Field>
          </div>

          <p role="alert" className={`min-h-[22px] px-1 pt-2.5 text-[14px] text-dn transition-opacity ${error ? "opacity-100" : "opacity-0"}`}>
            {error}
          </p>

          <button
            type="submit"
            disabled={busy || !email || password.length < (isSignup ? 8 : 1)}
            className="mt-3 flex h-[56px] w-full items-center justify-center gap-2 rounded-[16px] bg-ink text-[17px] font-semibold text-bg transition-opacity active:opacity-80 disabled:opacity-40"
          >
            {busy ? <LoaderCircle size={20} className="animate-spin" /> : isSignup ? "Crea account" : "Accedi"}
            {!busy && <ArrowRight size={19} strokeWidth={2.4} />}
          </button>
        </form>

        <div className="mt-auto pt-10 text-center text-[15px] text-mut">
          {isSignup ? "Hai già un account?" : "Prima volta qui?"}{" "}
          <button onClick={switchMode} className="hit relative font-semibold text-ink underline-offset-4 active:underline">
            {isSignup ? "Accedi" : "Crea un account"}
          </button>
        </div>
      </div>
    </div>
  );
}

const inputCls = "h-7 w-full min-w-0 bg-transparent text-[17px] text-ink outline-none placeholder:text-faint";

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="block border-b border-sep px-4 pb-2.5 pt-3 last:border-0 focus-within:bg-panel-2">
      <span className="block text-[12px] font-medium text-mut">{label}</span>
      <span className="mt-0.5 block">{children}</span>
    </label>
  );
}

function translate(message: string | undefined, status: number) {
  const m = (message ?? "").toLowerCase();
  if (status === 403 || m.includes("registrazioni")) return message ?? "Registrazioni chiuse.";
  if (m.includes("invalid email or password") || status === 401) return "Email o password non corrette.";
  if (m.includes("already exists") || m.includes("user already")) return "Esiste già un account con questa email. Accedi.";
  if (m.includes("password too short")) return "La password deve avere almeno 8 caratteri.";
  if (m.includes("invalid email")) return "Controlla l'indirizzo email.";
  if (status === 503) return "Accesso non ancora configurato sul server.";
  if (status === 429) return "Troppi tentativi. Riprova tra poco.";
  return message || "Qualcosa è andato storto. Riprova.";
}
