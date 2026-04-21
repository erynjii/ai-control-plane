"use client";

import { ChangeEvent, useEffect, useRef, useState } from "react";
import { Hash, Smile } from "lucide-react";

type CaptionEditorProps = {
  value: string;
  disabled?: boolean;
  maxLength?: number;
  onSave: (value: string) => void;
};

function renderCaption(value: string) {
  const tokens = value.split(/(\s+)/);
  return tokens.map((token, index) => {
    if (token.startsWith("#")) {
      return (
        <span key={index} className="text-accent-cyan">
          {token}
        </span>
      );
    }
    return <span key={index}>{token}</span>;
  });
}

export function CaptionEditor({ value, disabled = false, maxLength = 2200, onSave }: CaptionEditorProps) {
  const [draft, setDraft] = useState(value);
  const [focused, setFocused] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  const count = draft.length;
  const overCap = count > maxLength;

  const handleChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    setDraft(event.target.value);
  };

  const commit = () => {
    setFocused(false);
    const normalized = draft.trim();
    if (!normalized || normalized === value) {
      setDraft(value);
      return;
    }
    onSave(normalized);
  };

  return (
    <div
      className={`flex flex-col rounded-xl border ${
        focused ? "border-accent-cyan/40" : "border-line-soft"
      } bg-canvas-card`}
    >
      <div className="flex items-center justify-between px-3 pt-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-500">Caption</p>
        <span className={`text-[11px] ${overCap ? "text-signal-danger" : "text-ink-500"}`}>
          {count.toLocaleString()} / {maxLength.toLocaleString()}
        </span>
      </div>

      <div className="px-3 pt-2">
        {focused || disabled ? null : (
          <div
            role="button"
            tabIndex={0}
            onClick={() => {
              if (disabled) return;
              setFocused(true);
              requestAnimationFrame(() => textareaRef.current?.focus());
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                setFocused(true);
                requestAnimationFrame(() => textareaRef.current?.focus());
              }
            }}
            className="min-h-[180px] whitespace-pre-wrap break-words text-sm leading-relaxed text-ink-100 outline-none"
          >
            {value ? renderCaption(value) : <span className="text-ink-500">No caption yet.</span>}
          </div>
        )}
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={handleChange}
          onFocus={() => setFocused(true)}
          onBlur={commit}
          disabled={disabled}
          hidden={!focused && !disabled}
          rows={8}
          className="min-h-[180px] w-full resize-none rounded-md bg-transparent text-sm leading-relaxed text-ink-100 outline-none placeholder:text-ink-500 disabled:opacity-60"
          placeholder="Write a caption with hashtags…"
        />
      </div>

      <div className="flex items-center justify-between border-t border-line-soft px-3 py-2">
        <div className="flex items-center gap-1.5 text-ink-400">
          <button
            type="button"
            aria-label="Insert emoji"
            className="rounded-md p-1 hover:bg-canvas-hover hover:text-ink-100"
          >
            <Smile className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label="Insert hashtag"
            className="rounded-md p-1 hover:bg-canvas-hover hover:text-ink-100"
          >
            <Hash className="h-4 w-4" />
          </button>
        </div>
        <p className="text-[10px] text-ink-500">
          {disabled ? "Locked — send for approval to edit before review." : "Click outside to save."}
        </p>
      </div>
    </div>
  );
}
