import { beforeEach, describe, expect, it } from 'vitest';

import { DEMO_COORDINATES } from './config';
import { mockEmergencyService, readState } from './mock-service';

const location = { ...DEMO_COORDINATES, capturedAt: new Date().toISOString(), source: 'demo' as const };

describe('mockEmergencyService', () => {
  beforeEach(() => window.localStorage.clear());

  it('deduplicates repeated incident creation with the same active client', () => {
    mockEmergencyService.createIncident({ incidentId: 'incident-first', service: 'police', location });
    mockEmergencyService.createIncident({ incidentId: 'incident-second', service: 'fire', location });
    expect(readState().incidents).toHaveLength(1);
    expect(readState().incidents[0]?.id).toBe('incident-first');
  });

  it('offers every matching active on-duty employee and never off-duty employees', () => {
    mockEmergencyService.createIncident({ incidentId: 'incident-offers', service: 'police', location });
    mockEmergencyService.submitIncident('incident-offers');
    const state = readState();
    const offers = state.offers.filter((offer) => offer.incidentId === 'incident-offers');
    expect(offers).toHaveLength(2);
    expect(offers.every((offer) => state.employees.find((employee) => employee.id === offer.employeeId)?.service === 'police')).toBe(true);
  });

  it('sends an SOS offer to both on-duty police and ambulance responders', () => {
    mockEmergencyService.createIncident({ incidentId: 'incident-sos', service: 'sos', location });
    mockEmergencyService.submitIncident('incident-sos');
    const state = readState();
    const offeredServices = state.offers
      .filter((offer) => offer.incidentId === 'incident-sos')
      .map((offer) => state.employees.find((employee) => employee.id === offer.employeeId)?.service);
    expect(offeredServices).toEqual(expect.arrayContaining(['police', 'ambulance']));
    expect(offeredServices.every((service) => service === 'police' || service === 'ambulance')).toBe(true);
  });

  it('allows only the first competing employee to claim an incident', async () => {
    mockEmergencyService.createIncident({ incidentId: 'incident-race', service: 'ambulance', location });
    mockEmergencyService.submitIncident('incident-race');
    const [first, second] = readState().offers.filter((offer) => offer.incidentId === 'incident-race');
    expect(first).toBeDefined();
    expect(second).toBeDefined();
    const a = await mockEmergencyService.acceptIncident(first!.id);
    const b = await mockEmergencyService.acceptIncident(second!.id);
    expect(a.ok).toBe(true);
    expect(b).toMatchObject({ ok: false, reason: 'assigned' });
    expect(readState().incidents.find((incident) => incident.id === 'incident-race')?.assignedEmployeeId).toBe(first!.employeeId);
  });

  it('declining one offer leaves the incident open for another employee', async () => {
    mockEmergencyService.createIncident({ incidentId: 'incident-decline', service: 'fire', location });
    mockEmergencyService.submitIncident('incident-decline');
    const [first, second] = readState().offers.filter((offer) => offer.incidentId === 'incident-decline');
    mockEmergencyService.declineIncident(first!.id);
    const accepted = await mockEmergencyService.acceptIncident(second!.id);
    expect(accepted.ok).toBe(true);
  });
});
