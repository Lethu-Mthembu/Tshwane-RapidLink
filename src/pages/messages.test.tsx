import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

import { EmergencyProvider } from '@/features/emergency/emergency-context';
import { readState, sessionService } from '@/features/emergency/session-service';

import ResponderMessagesPage from './messages';

describe('responder request dashboard', () => {
  beforeEach(() => {
    window.localStorage.clear();
    const timestamp = new Date().toISOString();
    sessionService.saveProfile(
      { id: 'client-test', name: 'Naledi', surname: 'Mokoena', email: 'naledi@example.test', southAfricanId: '9001015009087', phone: '0725550147', nextOfKin: { name: 'Refilwe Mokoena', phone: '0735550191' }, createdAt: timestamp, updatedAt: timestamp },
      { salt: 'dGVzdA==', derivedHash: 'dGVzdA==', iterations: 1, failedAttempts: 0 },
    );
    sessionService.createIncident({
      incidentId: 'incident-responder-dashboard',
      service: 'police',
      location: {
        latitude: -25.6045,
        longitude: 28.005,
        accuracy: 18,
        capturedAt: new Date().toISOString(),
        source: 'browser',
      },
    });
    sessionService.submitIncident('incident-responder-dashboard');
  });

  it('shows the same SMS alert for every eligible responder', async () => {
    const state = readState();
    const offers = state.offers.filter((offer) => offer.incidentId === 'incident-responder-dashboard');
    const recipients = offers.map((offer) => state.employees.find((employee) => employee.id === offer.employeeId)!);
    render(
      <MemoryRouter>
        <EmergencyProvider><ResponderMessagesPage /></EmergencyProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: 'SMS alerts' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Filter by employee')).not.toBeInTheDocument();
    expect(screen.getByText(`${offers.length} recipients`)).toBeInTheDocument();
    expect(screen.getAllByText(state.incidents[0]!.reference, { exact: false })).toHaveLength(offers.length + 1);
    expect(screen.getAllByRole('link', { name: /Open response link/ })).toHaveLength(offers.length);
    for (const recipient of recipients) expect(screen.getByText(`${recipient.name} ${recipient.surname}`)).toBeInTheDocument();
  });

  it('orders awaiting incidents before completed incidents', async () => {
    let state = readState();
    const completedIncident = state.incidents.find((incident) => incident.id === 'incident-responder-dashboard')!;
    const acceptedOffer = state.offers.find((offer) => offer.incidentId === completedIncident.id)!;
    await sessionService.acceptIncident(acceptedOffer.id);
    sessionService.updateIncidentProgress(completedIncident.id, acceptedOffer.employeeId, 'en_route');
    sessionService.updateIncidentProgress(completedIncident.id, acceptedOffer.employeeId, 'arrived');
    sessionService.requestCompletion(completedIncident.id, acceptedOffer.employeeId);
    sessionService.confirmHelpReceived(completedIncident.id, true);

    sessionService.createIncident({
      incidentId: 'incident-new-awaiting',
      service: 'police',
      location: { latitude: -25.6045, longitude: 28.005, accuracy: 18, capturedAt: new Date().toISOString(), source: 'browser' },
    });
    sessionService.submitIncident('incident-new-awaiting');
    state = readState();
    const awaitingIncident = state.incidents.find((incident) => incident.id === 'incident-new-awaiting')!;

    render(<MemoryRouter><EmergencyProvider><ResponderMessagesPage /></EmergencyProvider></MemoryRouter>);

    const alertGroups = await screen.findAllByRole('region', { name: 'Police alert' });
    expect(within(alertGroups[0]!).getAllByText(awaitingIncident.reference, { exact: false }).length).toBeGreaterThan(0);
    expect(within(alertGroups.at(-1)!).getAllByText(completedIncident.reference, { exact: false }).length).toBeGreaterThan(0);
    expect(within(alertGroups.at(-1)!).getAllByRole('article')[0]).toHaveTextContent(state.employees.find((employee) => employee.id === acceptedOffer.employeeId)!.name);
  });
});
