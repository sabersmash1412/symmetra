"use client";

import { Mail, ShieldCheck } from "lucide-react";
import { FormEvent, useState } from "react";
import { hasSupabaseConfig, supabase } from "@/src/lib/supabase";

export function AuthView({ onLocalMode }: { onLocalMode: () => void }) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("");
  const [isSending, setIsSending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) {
      setStatus("Supabase is not configured. Use local mode for this device.");
      return;
    }

    setIsSending(true);
    setStatus("");
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: typeof window === "undefined" ? undefined : window.location.origin
      }
    });
    setIsSending(false);
    setStatus(error ? error.message : "Check your email for the sign-in link.");
  }

  return (
    <main className="auth-screen">
      <section className="auth-card">
        <div className="app-mark">
          <ShieldCheck size={26} />
        </div>
        <p className="eyebrow">Symmetra Patient</p>
        <h1>Daily face symmetry progress tracking</h1>
        <p className="soft-copy">Sign in to sync your daily log. This app records progress values, not a diagnosis.</p>

        <form className="auth-form" onSubmit={submit}>
          <label htmlFor="email">Email</label>
          <div className="input-row">
            <Mail size={18} />
            <input
              id="email"
              inputMode="email"
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              required
              type="email"
              value={email}
            />
          </div>
          <button className="button primary full" disabled={isSending || !hasSupabaseConfig} type="submit">
            {isSending ? "Sending..." : "Send sign-in link"}
          </button>
        </form>

        {!hasSupabaseConfig && <p className="notice">Add Supabase env vars to enable cloud sign-in.</p>}
        {status && <p className="notice">{status}</p>}

        <button className="button ghost full" type="button" onClick={onLocalMode}>
          Continue on this device
        </button>
      </section>
    </main>
  );
}
