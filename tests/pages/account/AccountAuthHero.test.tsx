// Copyright 2026 DgVerse LLP
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { AccountAuthHero } from '../../../src/pages/account/AccountAuthHero';

describe('AccountAuthHero', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('renders the DID template instantly when the user prefers reduced motion', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: true, media: query }) as MediaQueryList);
    render(<AccountAuthHero eyebrow="Hosted" headline="Headline" subhead="Subhead" />);

    expect(screen.getByText('did:web:hosted.helixid.io:accounts:8f2a1c9e')).toBeInTheDocument();
  });

  it('types the DID out character by character and stops the cursor once done', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query }) as MediaQueryList);
    vi.useFakeTimers();
    const { container } = render(<AccountAuthHero eyebrow="Hosted" headline="Headline" subhead="Subhead" />);

    // Mid-animation: not yet the full DID, cursor still blinking.
    act(() => {
      vi.advanceTimersByTime(38 * 5);
    });
    expect(container.querySelector('.did-seal__cursor')).toBeInTheDocument();

    // Let it finish.
    act(() => {
      vi.advanceTimersByTime(38 * 40);
    });
    expect(screen.getByText('did:web:hosted.helixid.io:accounts:8f2a1c9e')).toBeInTheDocument();
    expect(container.querySelector('.did-seal__cursor')).not.toBeInTheDocument();
  });
});
