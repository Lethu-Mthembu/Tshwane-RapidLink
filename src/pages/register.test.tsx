import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

import { App } from '@/app';
import { readState } from '@/features/emergency/session-service';

const completeRegistration = () => {
  fireEvent.change(screen.getByLabelText('First name'), { target: { value: 'Naledi' } });
  fireEvent.change(screen.getByLabelText('Surname'), { target: { value: 'Mokoena' } });
  fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'naledi@example.test' } });
  fireEvent.change(screen.getByLabelText('South African ID number'), { target: { value: '9001015009087' } });
  fireEvent.change(screen.getByLabelText('Mobile number'), { target: { value: '725550147' } });
  fireEvent.click(screen.getByRole('button', { name: /Continue/ }));

  fireEvent.change(screen.getByLabelText('First name'), { target: { value: 'Refilwe' } });
  fireEvent.change(screen.getByLabelText('Surname'), { target: { value: 'Mokoena' } });
  fireEvent.change(screen.getByLabelText('Mobile number'), { target: { value: '735550191' } });
  fireEvent.click(screen.getByRole('button', { name: /Continue/ }));

  fireEvent.change(screen.getByLabelText('Cancellation PIN'), { target: { value: '123456' } });
  fireEvent.change(screen.getByLabelText('Confirm PIN'), { target: { value: '123456' } });
  fireEvent.click(screen.getByRole('button', { name: 'Finish setup' }));
};

describe('client registration routing', () => {
  beforeEach(() => window.localStorage.clear());

  it('opens the client dashboard immediately after registration', async () => {
    render(<MemoryRouter initialEntries={['/register']}><App /></MemoryRouter>);

    await screen.findByRole('heading', { name: 'Create your emergency profile' });
    completeRegistration();

    expect(await screen.findByRole('heading', { name: 'Request emergency help' })).toBeInTheDocument();
    expect(screen.queryByText(/sign in/i)).not.toBeInTheDocument();
    expect(readState().profile?.phone).toBe('0725550147');
    expect(readState().profile?.nextOfKin).toMatchObject({ name: 'Refilwe Mokoena', phone: '0735550191' });
  });

  it('remembers the client and skips registration on a later visit', async () => {
    const first = render(<MemoryRouter initialEntries={['/register']}><App /></MemoryRouter>);
    await screen.findByRole('heading', { name: 'Create your emergency profile' });
    completeRegistration();
    await screen.findByRole('heading', { name: 'Request emergency help' });
    first.unmount();

    render(<MemoryRouter initialEntries={['/register']}><App /></MemoryRouter>);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Request emergency help' })).toBeInTheDocument());
    expect(screen.queryByRole('heading', { name: 'Create your emergency profile' })).not.toBeInTheDocument();
  });

  it('allows the cancellation PIN to be checked before finishing', async () => {
    render(<MemoryRouter initialEntries={['/register']}><App /></MemoryRouter>);
    await screen.findByRole('heading', { name: 'Create your emergency profile' });

    fireEvent.change(screen.getByLabelText('First name'), { target: { value: 'Naledi' } });
    fireEvent.change(screen.getByLabelText('Surname'), { target: { value: 'Mokoena' } });
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'naledi@example.test' } });
    fireEvent.change(screen.getByLabelText('South African ID number'), { target: { value: '9001015009087' } });
    fireEvent.change(screen.getByLabelText('Mobile number'), { target: { value: '725550147' } });
    fireEvent.click(screen.getByRole('button', { name: /Continue/ }));
    fireEvent.change(screen.getByLabelText('First name'), { target: { value: 'Refilwe' } });
    fireEvent.change(screen.getByLabelText('Surname'), { target: { value: 'Mokoena' } });
    fireEvent.change(screen.getByLabelText('Mobile number'), { target: { value: '735550191' } });
    fireEvent.click(screen.getByRole('button', { name: /Continue/ }));

    const pin = screen.getByLabelText('Cancellation PIN');
    expect(pin).toHaveAttribute('type', 'password');
    fireEvent.click(screen.getByRole('button', { name: 'Show cancellation pin' }));
    expect(pin).toHaveAttribute('type', 'text');
  });
});
