import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

import { EmergencyProvider } from '@/features/emergency/emergency-context';
import { readState, sessionService } from '@/features/emergency/session-service';

import ClientPage from './client';

describe('client emergency activation', () => {
  beforeEach(() => {
    window.localStorage.clear();
    const timestamp = new Date().toISOString();
    sessionService.saveProfile(
      { id: 'client-test', name: 'Naledi', surname: 'Mokoena', email: 'naledi@example.test', southAfricanId: '9001015009087', phone: '0725550147', nextOfKin: { name: 'Refilwe Mokoena', phone: '0735550191' }, createdAt: timestamp, updatedAt: timestamp },
      { salt: 'dGVzdA==', derivedHash: 'dGVzdA==', iterations: 1, failedAttempts: 0 },
    );
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition: vi.fn((success: PositionCallback) => success({
          coords: { latitude: -25.6042, longitude: 28.0053, accuracy: 20 },
          timestamp: Date.now(),
        } as GeolocationPosition)),
      },
    });
  });

  it('creates and submits an incident immediately', async () => {
    render(<MemoryRouter><EmergencyProvider><ClientPage /></EmergencyProvider></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: 'Enable' }));
    await screen.findByRole('heading', { name: 'Location ready' });
    fireEvent.click(screen.getByRole('button', { name: /^Police$/ }));
    expect(screen.getByRole('heading', { name: 'Alert sent' })).toBeInTheDocument();
    expect(readState().incidents).toHaveLength(1);
    await waitFor(() => expect(readState().offers.length).toBeGreaterThan(0));
  });

  it('offers masked SMS and email recovery for a forgotten cancellation PIN', async () => {
    render(<MemoryRouter><EmergencyProvider><ClientPage /></EmergencyProvider></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: /^Police$/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel request' }));
    fireEvent.click(screen.getByRole('button', { name: 'Forgot PIN?' }));

    expect(screen.getByRole('heading', { name: 'Reset cancellation PIN' })).toBeInTheDocument();
    expect(screen.getByText('••• ••• 0147')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: /Email/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Send reset instructions' }));

    expect(screen.getByRole('heading', { name: 'Check your email' })).toBeInTheDocument();
    expect(screen.getByText(/na••••@example\.test/)).toBeInTheDocument();
    expect(readState().incidents[0]?.status).not.toBe('CANCELLED');
  });
});
