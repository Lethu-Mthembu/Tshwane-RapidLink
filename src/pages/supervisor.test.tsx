import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

import { EmergencyProvider } from '@/features/emergency/emergency-context';
import { readState, sessionService } from '@/features/emergency/session-service';

import AttendancePage from './attendance';
import SupervisorPage from './supervisor';
import SupervisorAnalyticsPage from './supervisor-analytics';

describe('supervisor dashboard', () => {
  beforeEach(() => window.localStorage.clear());

  it('shows meaningful responder columns and limits editable identity fields', async () => {
    render(<MemoryRouter><EmergencyProvider><SupervisorPage /></EmergencyProvider></MemoryRouter>);

    expect(await screen.findByRole('heading', { name: 'Station team' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Responder' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Contact' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Dispatch status' })).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Record' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Add responder' }));
    const dialog = screen.getByRole('dialog', { name: 'Add responder' });
    fireEvent.change(within(dialog).getByLabelText('Employee number'), { target: { value: 'P-9999' } });
    fireEvent.change(within(dialog).getByLabelText('Phone number'), { target: { value: '071 555 9999' } });
    fireEvent.change(within(dialog).getByLabelText('First name'), { target: { value: 'Test' } });
    fireEvent.change(within(dialog).getByLabelText('Surname'), { target: { value: 'Responder' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add responder' }));

    expect(readState().employees.some((employee) => employee.employeeNumber === 'P-9999')).toBe(true);
    expect(screen.getAllByText('Test Responder').length).toBeGreaterThan(0);

    fireEvent.click(screen.getAllByRole('button', { name: 'Edit responder' })[0]!);
    const editDialog = screen.getByRole('dialog', { name: 'Edit responder' });
    expect(within(editDialog).getByLabelText('Employee number')).toBeDisabled();
    expect(within(editDialog).getByLabelText('Station')).toBeDisabled();
    expect(within(editDialog).getByLabelText('Phone number')).toBeEnabled();
    expect(within(editDialog).getByLabelText('Service')).toBeEnabled();
    expect(within(editDialog).getByRole('checkbox', { name: /Receive emergency requests/ })).toBeEnabled();
  });

  it('groups shift times into one column and saves attendance', async () => {
    render(<MemoryRouter><EmergencyProvider><AttendancePage /></EmergencyProvider></MemoryRouter>);

    expect(await screen.findByRole('heading', { name: 'Attendance' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Shift' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Dispatch status' })).toBeInTheDocument();

    fireEvent.change(screen.getAllByLabelText(/Attendance for/)[0]!, { target: { value: 'present' } });
    fireEvent.click(screen.getAllByRole('button', { name: /Save attendance for/ })[0]!);
    expect(screen.getByRole('status')).toHaveTextContent('Attendance saved.');
  });

  it('shows de-identified operational analytics and incident handling', async () => {
    const timestamp = new Date().toISOString();
    sessionService.saveProfile(
      { id: 'client-private', name: 'Naledi', surname: 'Mokoena', email: 'naledi@example.test', southAfricanId: '9001015009087', phone: '0725550147', nextOfKin: { name: 'Refilwe Mokoena', phone: '0735550191' }, createdAt: timestamp, updatedAt: timestamp },
      { salt: 'dGVzdA==', derivedHash: 'dGVzdA==', iterations: 1, failedAttempts: 0 },
    );
    sessionService.createIncident({
      incidentId: 'incident-supervisor-log',
      service: 'police',
      location: { latitude: -25.6042, longitude: 28.0053, accuracy: 15, capturedAt: timestamp, source: 'browser' },
    });
    sessionService.submitIncident('incident-supervisor-log');
    const state = readState();
    const localEmployeeIds = new Set(state.employees.filter((employee) => employee.stationId === 'station-garankuwa').map((employee) => employee.id));
    const offer = state.offers.find((item) => item.incidentId === 'incident-supervisor-log' && localEmployeeIds.has(item.employeeId));
    expect(offer).toBeDefined();
    await sessionService.acceptIncident(offer!.id);

    render(<MemoryRouter><EmergencyProvider><SupervisorAnalyticsPage /></EmergencyProvider></MemoryRouter>);

    expect(await screen.findByRole('heading', { name: 'Reports' })).toBeInTheDocument();
    expect(screen.getByText(/Client identity and sensitive incident details are hidden/)).toBeInTheDocument();
    expect(screen.getAllByText(readState().incidents[0]!.reference).length).toBeGreaterThan(0);
    expect(screen.queryByText('Naledi Mokoena')).not.toBeInTheDocument();
    expect(screen.queryByText('0725550147')).not.toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button', { name: 'View report' })[0]!);
    const dialog = screen.getByRole('dialog', { name: /Report/ });
    expect(within(dialog).getByRole('heading', { name: 'How it was handled' })).toBeInTheDocument();
    expect(within(dialog).queryByText('Naledi Mokoena')).not.toBeInTheDocument();
  });
});
