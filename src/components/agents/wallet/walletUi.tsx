// Copyright 2026 DgVerse LLP
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//    http://www.apache.org/licenses/LICENSE-2.0
//
// The small pieces the wallet, its cards and the detail drawer share.

import {
  useEffect,
  useRef,
  useState,
  type ComponentType,
  type KeyboardEvent,
} from 'react';
import { BanIcon, CalendarIcon, CheckIcon, ClockIcon, CopyIcon } from '../../layout/icons';
import { STATUS_LABELS, type DisplayStatus } from './credentialModel';

const STATUS_ICONS: Record<DisplayStatus, ComponentType> = {
  active: CheckIcon,
  expired: ClockIcon,
  revoked: BanIcon,
  'not-yet-valid': CalendarIcon,
};

/** Status as an icon plus words. Colour backs them up; it is never the only signal. */
export function StatusPill({ status }: { status: DisplayStatus }) {
  const Icon = STATUS_ICONS[status];
  return (
    <span className={`status-badge status-pill status-${status}`}>
      <Icon />
      {STATUS_LABELS[status]}
    </span>
  );
}

export interface CopyButtonProps {
  /** What lands on the clipboard. */
  value: string;
  /** Accessible name, e.g. "Copy VC ID". */
  label: string;
  /** Visible text beside the icon; briefly replaced by "Copied". Omit for an icon-only button. */
  text?: string;
  className?: string;
}

export function CopyButton({ value, label, text, className }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  const handleCopy = () => {
    void navigator.clipboard?.writeText(value).then(
      () => {
        setCopied(true);
        clearTimeout(timer.current);
        timer.current = setTimeout(() => setCopied(false), 1500);
      },
      () => {
        // The browser refused the write (permissions, insecure context).
        // Nothing was copied, so nothing is confirmed.
      },
    );
  };

  return (
    <button
      type="button"
      className={['copy-button', className, copied && 'copied'].filter(Boolean).join(' ')}
      aria-label={copied ? 'Copied' : label}
      title={copied ? 'Copied' : label}
      onClick={handleCopy}
    >
      {text !== undefined && <span className="copy-button__text">{copied ? 'Copied' : text}</span>}
      {copied ? <CheckIcon /> : <CopyIcon />}
    </button>
  );
}

export interface TabOption<T extends string> {
  value: T;
  label: string;
}

export interface SegmentedTabsProps<T extends string> {
  /** Names the tab list for assistive tech. */
  label: string;
  /** Prefix for the tab and panel ids, so each panel can point back at its tab. */
  idBase: string;
  options: ReadonlyArray<TabOption<T>>;
  value: T;
  onChange: (value: T) => void;
}

export function tabId(idBase: string, value: string): string {
  return `${idBase}-tab-${value}`;
}

export function panelId(idBase: string, value: string): string {
  return `${idBase}-panel-${value}`;
}

/**
 * A two-or-more-way view switch with tab semantics: one tab stop, arrow keys
 * move between tabs and select as they go. The caller renders the panel and
 * labels it with tabId()/panelId().
 */
export function SegmentedTabs<T extends string>({
  label,
  idBase,
  options,
  value,
  onChange,
}: SegmentedTabsProps<T>) {
  const tabs = useRef<Array<HTMLButtonElement | null>>([]);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const last = options.length - 1;
    const current = options.findIndex((option) => option.value === value);
    let next: number;
    switch (event.key) {
      case 'ArrowRight':
        next = current === last ? 0 : current + 1;
        break;
      case 'ArrowLeft':
        next = current <= 0 ? last : current - 1;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = last;
        break;
      default:
        return;
    }
    event.preventDefault();
    onChange(options[next]!.value);
    tabs.current[next]!.focus();
  };

  return (
    <div className="segmented" role="tablist" aria-label={label} onKeyDown={handleKeyDown}>
      {options.map((option, index) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            ref={(node) => {
              tabs.current[index] = node;
            }}
            type="button"
            role="tab"
            id={tabId(idBase, option.value)}
            className="segmented__tab unstyled"
            aria-selected={selected}
            aria-controls={selected ? panelId(idBase, option.value) : undefined}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
