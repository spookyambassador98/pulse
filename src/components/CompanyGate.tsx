"use client";

import { FormEvent, useEffect, useState } from "react";
import { rememberCompanyVisit, savedIdentity } from "@/lib/visitBeacon";

export function CompanyGate({ onUnlock }: { onUnlock: () => void }) {
  const [company, setCompany] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const saved = savedIdentity();
    setCompany(saved.company);
    setName(saved.name);
    setRole(saved.role);
  }, []);

  function submit(e: FormEvent) {
    e.preventDefault();
    const value = company.trim();
    if (value.length < 2) {
      setError("Company name is required.");
      return;
    }
    rememberCompanyVisit(value, { name, role });
    onUnlock();
  }

  const field =
    "mt-2 w-full bg-transparent border border-line px-3 py-3 font-mono text-sm text-ink outline-none focus:border-signal";
  const caption = "font-mono text-[10px] tracking-[0.18em] uppercase text-ink-dim";

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
          <span className={caption}>Company</span>
          <input
            autoFocus
            autoComplete="organization"
            value={company}
            maxLength={80}
            placeholder="Company name"
            onChange={(e) => {
              setCompany(e.target.value);
              setError(null);
            }}
            className={field}
          />
        </label>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block">
            <span className={caption}>
              Name <span className="normal-case tracking-normal opacity-60">· optional</span>
            </span>
            <input
              autoComplete="name"
              value={name}
              maxLength={80}
              placeholder="Jane"
              onChange={(e) => setName(e.target.value)}
              className={field}
            />
          </label>
          <label className="block">
            <span className={caption}>
              Role <span className="normal-case tracking-normal opacity-60">· optional</span>
            </span>
            <input
              autoComplete="organization-title"
              value={role}
              maxLength={80}
              placeholder="Recruiter"
              onChange={(e) => setRole(e.target.value)}
              className={field}
            />
          </label>
        </div>
        {error ? <p className="mt-3 font-mono text-[11px] text-alert">{error}</p> : null}
        <button
          type="submit"
          disabled={company.trim().length < 2}
          className="mt-6 w-full rounded-full bg-signal text-bg px-7 py-3 font-mono text-xs tracking-[0.14em] uppercase disabled:opacity-40"
        >
          Open the plate
        </button>
      </form>
    </div>
  );
}
