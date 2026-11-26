// Copyright 2026 DgVerse LLP
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//    http://www.apache.org/licenses/LICENSE-2.0
//
// Registry v3 (2026-11-24): "Make discoverable" at agent onboarding, checked
// by default. A discoverable agent is listed in the Helix agent registry
// (api.helixid.dev), where anyone can find it; the info icon says so. An agent
// that is not discoverable still verifies when it is called or delegated to
// by its DID.

import { useId } from 'react';

export const DISCOVERABLE_INFO = 'This agent will be listed in the Helix registry, where anyone can find it.';

export interface DiscoverableFieldProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

export function DiscoverableField({ checked, onChange, disabled = false }: DiscoverableFieldProps) {
  const infoId = useId();
  return (
    <div className="discoverable-field">
      <label className="discoverable-field__label">
        <input type="checkbox" checked={checked} disabled={disabled} aria-describedby={infoId} onChange={(event) => onChange(event.target.checked)} />
        <span>Make discoverable</span>
      </label>
      <span className="info-tip" tabIndex={0} role="button" aria-label="About Make discoverable">
        <span aria-hidden="true">i</span>
        <span id={infoId} role="tooltip" className="info-tip__text">
          {DISCOVERABLE_INFO}
        </span>
      </span>
    </div>
  );
}
