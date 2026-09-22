"use client";

import { FormEvent, useState } from "react";
import { rememberCompanyVisit } from "@/lib/visitBeacon";

export function CompanyGate({ onUnlock }: { onUnlock: () => void }) {
  const [company, setCompany] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit(e: FormEvent) {
    e.preventDefault();
    const name = company.trim();
    if (!name) {
      setError("Company name is required.");
      return;
    }
    rememberCompanyVisit(name);
    onUnlock();
  }

  return (
    <div className="min-h-screen bg-bg text-ink flex items-center justify-center px-6">
      <form
        onSubmit={submit}
        className="w-full max-w-md border border-line-strong bg-bg-raised px-7 py-8"
      >
        <p className="font-mono text-[10px] tracking-[0.28em] uppercase text-signal">
          Issued to
        </p>
        <h1 className="font-display text-4xl md:text-5xl leading-[0.95] mt-3 mb-4">
          Name the desk.
        </h1>
        <p className="font-mono text-xs text-ink-dim leading-relaxed mb-7">
          The plate stays shut until a company is named. The visit is written down before the installer.
        </p>
        <label className="block">
          <span className="font-mono text-[10px] tracking-[0.18em] uppercase text-ink-dim">
            Company
          </span>
          <input
            autoFocus
            autoComplete="organization"
            value={company}
            placeholder="Company name"
            onChange={(e) => {
              setCompany(e.target.value);
              setError(null);
            }}
            className="mt-2 w-full bg-transparent border border-line px-3 py-3 font-mono text-sm text-ink outline-none focus:border-signal"
          />
        </label>
        {error ? <p className="mt-3 font-mono text-[11px] text-alert">{error}</p> : null}
        <button
          type="submit"
          disabled={!company.trim()}
          className="mt-6 w-full rounded-full bg-signal text-bg px-7 py-3 font-mono text-xs tracking-[0.14em] uppercase disabled:opacity-40"
        >
          Open the plate
        </button>
      </form>
    </div>
  );
}
