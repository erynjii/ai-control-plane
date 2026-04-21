"use client";

import { ChevronRight, Instagram, type LucideIcon } from "lucide-react";

type Account = {
  platform: string;
  handle: string;
  icon: LucideIcon;
  gradient: string;
  connected: boolean;
};

const ACCOUNTS: Account[] = [
  {
    platform: "Instagram",
    handle: "aurorabonita",
    icon: Instagram,
    gradient: "from-pink-500 via-fuchsia-500 to-amber-400",
    connected: true
  }
];

export function ConnectedAccounts() {
  return (
    <section className="rounded-xl border border-line-soft bg-canvas-card p-4">
      <header className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-ink-100">Connected Accounts</h3>
        <button type="button" className="text-xs text-accent-cyan hover:underline">
          Manage
        </button>
      </header>

      <ul className="divide-y divide-line-soft">
        {ACCOUNTS.map((account) => {
          const Icon = account.icon;
          return (
            <li key={account.platform}>
              <button
                type="button"
                className="flex w-full items-center gap-3 py-3 hover:bg-canvas-hover"
              >
                <div
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br ${account.gradient} text-white`}
                >
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1 text-left">
                  <p className="text-sm font-medium text-ink-100">{account.platform}</p>
                  <p className="truncate text-xs text-ink-500">@{account.handle}</p>
                </div>
                {account.connected ? (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-signal-success">
                    Connected
                  </span>
                ) : null}
                <ChevronRight className="h-4 w-4 shrink-0 text-ink-500" />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
