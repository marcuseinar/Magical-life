import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import ConnectionChip from './ConnectionChip.svelte';

describe('ConnectionChip', () => {
  it('reads as a plain status while the connection is direct', () => {
    render(ConnectionChip, { props: { state: 'direct' } });
    expect(screen.getByRole('status')).toHaveTextContent(/direct/i);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('reads as an alert once the connection is lost', () => {
    render(ConnectionChip, { props: { state: 'lost' } });
    expect(screen.getByRole('alert')).toHaveTextContent(/lost/i);
  });
});
