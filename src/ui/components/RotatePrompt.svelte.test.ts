import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import RotatePrompt from './RotatePrompt.svelte';

describe('rotate prompt', () => {
  it('announces itself as a modal dialog', () => {
    render(RotatePrompt);
    expect(screen.getByRole('alertdialog', { name: /portrait/i })).toBeInTheDocument();
  });

  it('tells the player what to do about it', () => {
    render(RotatePrompt);
    expect(screen.getByText(/rotate|turn/i)).toBeInTheDocument();
  });
});
