import { createInitialState } from './fixtures';
import type {
  AcceptResult,
  AttendanceChoice,
  AttendanceEntry,
  CapturedLocation,
  EmergencyState,
  Employee,
  Incident,
  IncidentAttachment,
  IncidentProgress,
  ServiceType,
} from './types';

export const EMERGENCY_STORAGE_KEY = 'rapidlink-emergency-demo-v1';
const CHANNEL_NAME = 'rapidlink-emergency-events';

const now = () => new Date().toISOString();
const id = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;

const getStorage = () => (typeof window === 'undefined' ? null : window.localStorage);

export const readState = (): EmergencyState => {
  const storage = getStorage();
  if (!storage) return createInitialState();
  try {
    const stored = storage.getItem(EMERGENCY_STORAGE_KEY);
    return stored ? (JSON.parse(stored) as EmergencyState) : createInitialState();
  } catch {
    return createInitialState();
  }
};

const broadcast = (state: EmergencyState) => {
  if (typeof window === 'undefined' || !('BroadcastChannel' in window)) return;
  const channel = new BroadcastChannel(CHANNEL_NAME);
  channel.postMessage({ type: 'state-changed', state });
  channel.close();
};

export const writeState = (state: EmergencyState) => {
  getStorage()?.setItem(EMERGENCY_STORAGE_KEY, JSON.stringify(state));
  broadcast(state);
  return state;
};

const mutate = (recipe: (current: EmergencyState) => EmergencyState) => writeState(recipe(readState()));

export const isAttendanceActive = (entry: AttendanceEntry | undefined, at = Date.now()) =>
  Boolean(
    entry &&
      entry.choice === 'present' &&
      !entry.endedAt &&
      Date.parse(entry.shiftStart) <= at &&
      Date.parse(entry.shiftEnd) > at,
  );

export const employeeDuty = (state: EmergencyState, employeeId: string) => {
  return state.attendance
    .filter((item) => item.employeeId === employeeId)
    .some((entry) => isAttendanceActive(entry));
};

export const employeeBusy = (state: EmergencyState, employeeId: string, excludeIncidentId?: string) =>
  state.incidents.some(
    (incident) =>
      incident.id !== excludeIncidentId &&
      incident.assignedEmployeeId === employeeId &&
      incident.progress !== 'completed',
  );

const eligibleEmployeesForStation = (state: EmergencyState, incident: Incident, stationId: string) =>
  state.employees.filter(
    (employee) =>
      employee.stationId === stationId &&
      (employee.service === incident.service || (incident.service === 'sos' && (employee.service === 'police' || employee.service === 'ambulance'))) &&
      employee.active &&
      !incident.declinedEmployeeIds.includes(employee.id) &&
      employeeDuty(state, employee.id) &&
      !employeeBusy(state, employee.id, incident.id),
  );

const distanceKm = (a: CapturedLocation, latitude: number, longitude: number) => {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const earthRadius = 6371;
  const dLat = toRad(latitude - a.latitude);
  const dLng = toRad(longitude - a.longitude);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) * Math.cos(toRad(latitude)) * Math.sin(dLng / 2) ** 2;
  return earthRadius * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
};

const createOffers = (state: EmergencyState, incident: Incident): EmergencyState => {
  const station = state.stations.find((item) => item.id === incident.stationId);
  if (!station) return state;
  const eligible = eligibleEmployeesForStation(state, incident, station.id);
  if (!eligible.length) {
    return {
      ...state,
      incidents: state.incidents.map((item) =>
        item.id === incident.id ? { ...item, deliveryState: 'no_responders' } : item,
      ),
    };
  }
  const createdAt = now();
  const offers = eligible.map((employee) => ({
    id: id('offer'),
    incidentId: incident.id,
    employeeId: employee.id,
    status: 'open' as const,
    createdAt,
  }));
  return {
    ...state,
    offers: [...state.offers, ...offers],
    messages: [
      ...state.messages,
      ...offers.map((offer) => ({
        id: id('sms'),
        offerId: offer.id,
        incidentId: incident.id,
        employeeId: offer.employeeId,
        createdAt,
      })),
    ],
  };
};

export const mockEmergencyService = {
  subscribe(listener: (state: EmergencyState) => void) {
    if (typeof window === 'undefined') return () => undefined;
    const onStorage = (event: StorageEvent) => {
      if (event.key === EMERGENCY_STORAGE_KEY) listener(readState());
    };
    const channel = 'BroadcastChannel' in window ? new BroadcastChannel(CHANNEL_NAME) : null;
    const onMessage = (event: MessageEvent<{ state?: EmergencyState }>) => {
      if (event.data.state) listener(event.data.state);
    };
    window.addEventListener('storage', onStorage);
    channel?.addEventListener('message', onMessage);
    return () => {
      window.removeEventListener('storage', onStorage);
      channel?.removeEventListener('message', onMessage);
      channel?.close();
    };
  },

  reset() {
    const storage = getStorage();
    if (storage) {
      const keys = Array.from({ length: storage.length }, (_, index) => storage.key(index)).filter(Boolean) as string[];
      keys.filter((key) => key.startsWith('rapidlink-')).forEach((key) => storage.removeItem(key));
    }
    return writeState(createInitialState());
  },

  createIncident(input: { incidentId: string; service: ServiceType; location: CapturedLocation | null }) {
    return mutate((state) => {
      const active = state.incidents.find(
        (incident) => incident.clientId === state.profile.id && incident.progress !== 'completed',
      );
      if (active || state.incidents.some((incident) => incident.id === input.incidentId)) return state;
      const incident: Incident = {
        id: input.incidentId,
        reference: `RL-${input.incidentId.slice(-6).toUpperCase()}`,
        clientId: state.profile.id,
        service: input.service,
        createdAt: now(),
        deliveryState: 'pending',
        progress: 'submitting',
        location: input.location,
        information: [],
        declinedEmployeeIds: [],
      };
      return {
        ...state,
        incidents: [...state.incidents, incident],
        audit: [...state.audit, { id: id('audit'), type: 'incident-created', message: `${incident.reference} created`, createdAt: now() }],
      };
    });
  },

  submitIncident(incidentId: string) {
    return mutate((state) => {
      const incident = state.incidents.find((item) => item.id === incidentId);
      if (!incident || incident.deliveryState === 'sent') return state;
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        return {
          ...state,
          incidents: state.incidents.map((item) =>
            item.id === incidentId
              ? { ...item, progress: 'submission_failed', deliveryState: 'failed' }
              : item,
          ),
        };
      }
      if (!incident.location) {
        return {
          ...state,
          incidents: state.incidents.map((item) =>
            item.id === incidentId
              ? { ...item, progress: 'waiting', deliveryState: 'pending', submittedAt: now() }
              : item,
          ),
        };
      }
      const candidates = state.stations
        .filter((item) =>
          incident.service === 'sos'
            ? item.services.includes('police') && item.services.includes('ambulance')
            : item.services.includes(incident.service),
        )
        .map((item) => ({ item, distance: distanceKm(incident.location!, item.latitude, item.longitude) }))
        .sort((a, b) => a.distance - b.distance);
      const stationWithResponders = candidates.find(({ item }) => {
        const eligible = eligibleEmployeesForStation(state, incident, item.id);
        if (incident.service !== 'sos') return eligible.length > 0;
        return eligible.some((employee) => employee.service === 'police') && eligible.some((employee) => employee.service === 'ambulance');
      })?.item;
      const station = stationWithResponders ?? candidates.find(({ item }) => eligibleEmployeesForStation(state, incident, item.id).length > 0)?.item ?? candidates[0]?.item;
      if (!station) {
        return {
          ...state,
          incidents: state.incidents.map((item) =>
            item.id === incidentId ? { ...item, progress: 'waiting', deliveryState: 'no_station' } : item,
          ),
        };
      }
      const routed: Incident = {
        ...incident,
        stationId: station.id,
        deliveryState: 'sent',
        progress: 'waiting',
        submittedAt: now(),
      };
      const withIncident = {
        ...state,
        incidents: state.incidents.map((item) => (item.id === incidentId ? routed : item)),
      };
      return createOffers(withIncident, routed);
    });
  },

  updateIncidentLocation(incidentId: string, location: CapturedLocation, locationNote?: string) {
    const next = mutate((state) => ({
      ...state,
      incidents: state.incidents.map((incident) =>
        incident.id === incidentId ? { ...incident, location, locationNote } : incident,
      ),
    }));
    const incident = next.incidents.find((item) => item.id === incidentId);
    if (incident?.deliveryState === 'pending' && !incident.stationId) return this.submitIncident(incidentId);
    return next;
  },

  addIncidentInformation(input: {
    incidentId: string;
    happened: string;
    landmark: string;
    attachments: IncidentAttachment[];
  }) {
    return mutate((state) => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        return {
          ...state,
          incidents: state.incidents.map((incident) =>
            incident.id === input.incidentId
              ? { ...incident, informationError: 'Additional information is saved locally and has not been sent.' }
              : incident,
          ),
        };
      }
      return {
        ...state,
        incidents: state.incidents.map((incident) =>
          incident.id === input.incidentId
            ? {
                ...incident,
                informationError: undefined,
                locationNote: input.landmark || incident.locationNote,
                information: [
                  ...incident.information,
                  {
                    id: id('information'),
                    incidentId: incident.id,
                    happened: input.happened,
                    landmark: input.landmark,
                    attachments: input.attachments,
                    createdAt: now(),
                  },
                ],
              }
            : incident,
        ),
      };
    });
  },

  saveAttendance(input: {
    employeeId: string;
    date: string;
    shiftStart: string;
    shiftEnd: string;
    choice: AttendanceChoice;
  }) {
    const next = mutate((state) => {
      const updatedAt = now();
      const existing = state.attendance.find(
        (item) => item.employeeId === input.employeeId && item.date === input.date,
      );
      const entry: AttendanceEntry = {
        id: existing?.id ?? id('attendance'),
        ...input,
        endedAt: input.choice === 'present' ? undefined : updatedAt,
        updatedAt,
        updatedBy: 'Supervisor N. Selemela',
      };
      return {
        ...state,
        attendance: [...state.attendance.filter((item) => item.id !== entry.id), entry],
        audit: [...state.audit, { id: id('audit'), type: 'attendance', message: `${input.employeeId} marked ${input.choice}`, createdAt: updatedAt }],
      };
    });
    next.incidents
      .filter((incident) => incident.deliveryState === 'no_responders' && !incident.assignedEmployeeId)
      .forEach((incident) => this.submitIncident(incident.id));
    return readState();
  },

  recoverUnavailableIncidents() {
    const state = readState();
    state.incidents
      .filter((incident) => incident.deliveryState === 'no_responders' && !incident.assignedEmployeeId)
      .forEach((incident) => {
        const hasAvailableStation = state.stations.some(
          (station) =>
            (incident.service === 'sos'
              ? station.services.includes('police') && station.services.includes('ambulance')
              : station.services.includes(incident.service)) &&
            eligibleEmployeesForStation(state, incident, station.id).length > 0,
        );
        if (hasAvailableStation) this.submitIncident(incident.id);
      });
    return readState();
  },

  endShift(employeeId: string) {
    return mutate((state) => ({
      ...state,
      attendance: state.attendance.map((entry) =>
        entry.employeeId === employeeId && isAttendanceActive(entry) ? { ...entry, endedAt: now(), updatedAt: now() } : entry,
      ),
    }));
  },

  addEmployee(employee: Omit<Employee, 'id'>) {
    return mutate((state) => ({ ...state, employees: [...state.employees, { ...employee, id: id('employee') }] }));
  },

  updateEmployee(employee: Employee) {
    return mutate((state) => ({
      ...state,
      employees: state.employees.map((item) => (item.id === employee.id ? employee : item)),
    }));
  },

  declineIncident(offerId: string) {
    return mutate((state) => {
      const offer = state.offers.find((item) => item.id === offerId);
      if (!offer || offer.status !== 'open') return state;
      const offers = state.offers.map((item) =>
        item.id === offerId ? { ...item, status: 'declined' as const, respondedAt: now() } : item,
      );
      const incidentOffers = offers.filter((item) => item.incidentId === offer.incidentId);
      const everyoneDeclined = incidentOffers.length > 0 && incidentOffers.every((item) => item.status === 'declined');
      return {
        ...state,
        offers,
        incidents: state.incidents.map((incident) =>
          incident.id === offer.incidentId
            ? {
                ...incident,
                deliveryState: everyoneDeclined ? 'everyone_declined' : incident.deliveryState,
                declinedEmployeeIds: [...incident.declinedEmployeeIds, offer.employeeId],
              }
            : incident,
        ),
      };
    });
  },

  async acceptIncident(offerId: string): Promise<AcceptResult> {
    const perform = (): AcceptResult => {
      const state = readState();
      const offer = state.offers.find((item) => item.id === offerId);
      const incident = state.incidents.find((item) => item.id === offer?.incidentId);
      const employee = state.employees.find((item) => item.id === offer?.employeeId);
      if (!offer || !incident || !employee) return { ok: false, reason: 'invalid' };
      if (incident.assignedEmployeeId === employee.id) return { ok: true, incident, employee };
      if (incident.assignedEmployeeId || incident.progress === 'completed') return { ok: false, reason: 'assigned' };
      if (!employee.active) return { ok: false, reason: 'inactive' };
      if (!employeeDuty(state, employee.id)) return { ok: false, reason: 'off_duty' };
      if (employeeBusy(state, employee.id, incident.id)) return { ok: false, reason: 'busy' };
      if (offer.status !== 'open') return { ok: false, reason: 'invalid' };
      const acceptedAt = now();
      const accepted = { ...incident, assignedEmployeeId: employee.id, acceptedAt, progress: 'accepted' as const };
      writeState({
        ...state,
        incidents: state.incidents.map((item) => (item.id === incident.id ? accepted : item)),
        offers: state.offers.map((item) =>
          item.incidentId !== incident.id
            ? item
            : item.id === offer.id
              ? { ...item, status: 'accepted', respondedAt: acceptedAt }
              : { ...item, status: 'closed' },
        ),
        audit: [...state.audit, { id: id('audit'), type: 'accepted', message: `${employee.employeeNumber} accepted ${incident.reference}`, createdAt: acceptedAt }],
      });
      return { ok: true, incident: accepted, employee };
    };
    const initialOffer = readState().offers.find((item) => item.id === offerId);
    const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
    return locks && initialOffer
      ? locks.request(`rapidlink-accept-${initialOffer.incidentId}`, perform)
      : perform();
  },

  updateIncidentProgress(incidentId: string, employeeId: string, progress: IncidentProgress) {
    return mutate((state) => ({
      ...state,
      incidents: state.incidents.map((incident) =>
        incident.id === incidentId && incident.assignedEmployeeId === employeeId
          ? { ...incident, progress }
          : incident,
      ),
    }));
  },
};
