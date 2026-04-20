"use client";

import { FormEvent, useState } from "react";
import { requestMagicLink } from "@/lib/supabase/auth";

type Status = "idle" | "loading" | "success" | "error";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState<string>("");

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus("loading");
    setMessage("");

    const { error } = await requestMagicLink(email.trim());

    if (error) {
      setStatus("error");
      setMessage(error.message || "Could not send magic link. Please try again.");
      return;
    }

    setStatus("success");
    setMessage("Magic link sent. Check your email to continue.");
  };

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md items-center px-6 py-16">
      <section className="w-full rounded-2xl border border-slate-800 bg-slate-900/60 p-6 shadow-lg shadow-black/20">
        <h1 className="text-2xl font-semibold tracking-tight">Login</h1>
        <p className="mt-2 text-sm text-slate-300">Sign in with a magic link to access the dashboard.</p>

        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <label htmlFor="email" className="block text-sm font-medium text-slate-200">
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@company.com"
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none"
          />

          <button
            type="submit"
            disabled={status === "loading"}
            className="w-full rounded-lg bg-cyan-500 px-4 py-2 text-sm font-medium text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {status === "loading" ? "Sending magic link..." : "Send magic link"}
          </button>
        </form>

        {message ? (
          <p
            className={`mt-4 rounded-md px-3 py-2 text-sm ${
              status === "success"
                ? "border border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                : "border border-rose-500/40 bg-rose-500/10 text-rose-300"
            }`}
          >
            {message}
          </p>
        ) : null}
      </section>
    </main>
  );
}
