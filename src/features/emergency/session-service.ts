import { createInitialState } from './fixtures.js';
import { ESCALATION_INTERVAL_MS, PIN_MAX_ATTEMPTS, serviceLabel } from './config.js';
import type {
  AcceptResult,
  AttendanceEntry,
  CapturedLocation,
  EmergencyAction,
  EmergencyState,
  Employee,
  Incident,
  IncidentAttachment,
  IncidentProgress,
  ClientProfile,
  CancellationPinRecord,
  ServiceType,
  SessionRecord,
  SyncStatus,
} from './types.js';

export const ACTIVE_SESSION_KEY = 'rapidlink-active-session-v2';
export const DEVICE_IDENTITY_KEY = 'rapidlink-device-identity-v1';
const CHANNEL_NAME = 'rapidlink-session-events-v2';
const stateKey = (code: string) => `rapidlink-session-${code}`;
const queueKey = (code: string) => `rapidlink-actions-${code}`;

const now = () => new Date().toISOString();
const generatedId = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;
const action = <T extends EmergencyAction['type']>(type: T, payload: Extract<EmergencyAction, { type: T }>['payload']) =>
  ({ id: crypto.randomUUID(), type, payload } as Extract<EmergencyAction, { type: T }>);

const storage = () => (typeof window === 'undefined' ? null : window.localStorage);
const activeCode = () => storage()?.getItem(ACTIVE_SESSION_KEY) ?? null;

interface DeviceIdentity {
  profile: ClientProfile;
  security: CancellationPinRecord;
}

const readDeviceIdentity = (): DeviceIdentity | null => {
  try {
    const saved = storage()?.getItem(DEVICE_IDENTITY_KEY);
    if (!saved) return null;
    const identity = JSON.parse(saved) as Partial<DeviceIdentity>;
    return identity.profile && identity.security ? identity as DeviceIdentity : null;
  } catch {
    return null;
  }
};

const writeDeviceIdentity = (identity: DeviceIdentity) => {
  storage()?.setItem(DEVICE_IDENTITY_KEY, JSON.stringify(identity));
};

const restoreDeviceIdentity = (state: EmergencyState): EmergencyState => {
  if (state.profile && state.profileSecurity) return state;
  const identity = readDeviceIdentity();
  return identity ? { ...state, profile: identity.profile, profileSecurity: identity.security, registrationStatus: 'REGISTERED' } : state;
};

const rememberDeviceIdentity = (state: EmergencyState) => {
  if (state.profile && state.profileSecurity) writeDeviceIdentity({ profile: state.profile, security: state.profileSecurity });
  return state;
};

export const normalizeRoomCode = (value: string) => value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
export const generateRoomCode = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), (value) => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[value % 32]).join('');

export const isAttendanceActive = (entry: AttendanceEntry | undefined, at = Date.now()) =>
  Boolean(entry && entry.choice === 'present' && !entry.endedAt && Date.parse(entry.shiftStart) <= at && Date.parse(entry.shiftEnd) > at);

export const employeeDuty = (state: EmergencyState, employeeId: string) => {
  return state.attendance
    .filter((item) => item.employeeId === employeeId)
    .some((entry) => isAttendanceActive(entry));
};

export const employeeBusy = (state: EmergencyState, employeeId: string, excludeIncidentId?: string) =>
  state.incidents.some((incident) => incident.id !== excludeIncidentId && incident.assignedEmployeeId === employeeId && !['completed', 'cancelled'].includes(incident.progress));

const stationSupportsIncident = (station: EmergencyState['stations'][number], incident: Incident) =>
  incident.service === 'sos'
    ? station.services.includes('police') && station.services.includes('ambulance')
    : station.services.includes(incident.service);

const eligibleEmployeesForStation = (state: EmergencyState, incident: Incident, stationId: string) =>
  state.employees.filter((employee) =>
    employee.stationId === stationId &&
    (employee.service === incident.service || (incident.service === 'sos' && (employee.service === 'police' || employee.service === 'ambulance'))) &&
    employee.active &&
    !incident.declinedEmployeeIds.includes(employee.id) &&
    employeeDuty(state, employee.id) &&
    !employeeBusy(state, employee.id, incident.id));

const distanceKm = (location: CapturedLocation, latitude: number, longitude: number) => {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const earthRadius = 6371;
  const dLat = toRad(latitude - location.latitude);
  const dLng = toRad(longitude - location.longitude);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(location.latitude)) * Math.cos(toRad(latitude)) * Math.sin(dLng / 2) ** 2;
  return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const orderedStations = (state: EmergencyState, incident: Incident) => state.stations
  .filter((station) => stationSupportsIncident(station, incident))
  .map((station) => ({ station, distance: incident.location ? distanceKm(incident.location, station.latitude, station.longitude) : Number.POSITIVE_INFINITY }))
  .sort((a, b) => a.distance - b.distance)
  .map(({ station }) => station);

const responderMessageBody = (incident: Incident, stationName: string, offerId: string) => {
  const latestInformation = incident.information.at(-1);
  const location = incident.location
    ? `${incident.location.latitude.toFixed(5)}, ${incident.location.longitude.toFixed(5)} (accuracy about ${Math.round(incident.location.accuracy)} m)`
    : incident.locationNote || 'Location is still being acquired';
  return [
    'RapidLink emergency alert',
    `Emergency: ${serviceLabel(incident.service)}`,
    `Reference: ${incident.reference}`,
    `Reported: ${incident.submittedAt ?? incident.createdAt}`,
    `Dispatch station: ${stationName}`,
    `Location: ${location}`,
    latestInformation?.happened ? `Situation: ${latestInformation.happened}` : null,
    latestInformation?.landmark ? `Access or landmark: ${latestInformation.landmark}` : null,
    `Response link: /responder/offers/${offerId}`,
  ].filter(Boolean).join('\n');
};

const refreshIncidentMessages = (state: EmergencyState, incident: Incident): EmergencyState => {
  const stationName = state.stations.find((station) => station.id === incident.stationId)?.name ?? 'Assigned response station';
  return {
    ...state,
    messages: state.messages.map((message) => message.incidentId === incident.id
      ? { ...message, body: responderMessageBody(incident, stationName, message.offerId) }
      : message),
  };
};

const offersForStation = (state: EmergencyState, incident: Incident, stationId: string) => {
  const existingEmployeeIds = new Set(state.offers.filter((offer) => offer.incidentId === incident.id).map((offer) => offer.employeeId));
  const createdAt = now();
  const offers = eligibleEmployeesForStation(state, incident, stationId)
    .filter((employee) => !existingEmployeeIds.has(employee.id))
    .map((employee) => ({ id: generatedId('offer'), incidentId: incident.id, employeeId: employee.id, status: 'open' as const, createdAt }));
  const stationName = state.stations.find((station) => station.id === stationId)?.name ?? 'Assigned response station';
  return {
    offers,
    messages: offers.map((offer) => {
      const employee = state.employees.find((item) => item.id === offer.employeeId);
      return {
        id: generatedId('message'),
        offerId: offer.id,
        incidentId: incident.id,
        employeeId: offer.employeeId,
        createdAt,
        provider: 'simulated' as const,
        deliveryStatus: 'simulated' as const,
        recipientPhone: employee?.phone,
        body: responderMessageBody(incident, stationName, offer.id),
      };
    }),
  };
};

const routeIncident = (state: EmergencyState, incident: Incident): EmergencyState => {
  if (!incident.location) {
    return { ...state, incidents: state.incidents.map((item) => item.id === incident.id ? { ...item, status: 'WAITING_FOR_RESPONDER' as const, progress: 'waiting' as const, deliveryState: 'pending' as const, submittedAt: now() } : item) };
  }
  const station = orderedStations(state, incident)[0];
  if (!station) {
    return { ...state, incidents: state.incidents.map((item) => item.id === incident.id ? { ...item, status: 'FAILED' as const, progress: 'submission_failed' as const, deliveryState: 'no_station' as const, escalationStatus: 'STOPPED' as const } : item) };
  }
  const submittedAt = now();
  const routed: Incident = {
    ...incident,
    stationId: station.id,
    notifiedStationIds: [station.id],
    searchStage: 1,
    escalationStatus: 'INITIAL_STATION',
    nextEscalationAt: new Date(Date.parse(submittedAt) + ESCALATION_INTERVAL_MS).toISOString(),
    deliveryState: 'sent',
    status: 'WAITING_FOR_RESPONDER',
    progress: 'waiting',
    submittedAt,
  };
  const created = offersForStation(state, routed, station.id);
  const deliveryState = created.offers.length ? 'sent' : 'no_responders';
  return {
    ...state,
    incidents: state.incidents.map((item) => item.id === incident.id ? { ...routed, deliveryState } : item),
    offers: [...state.offers, ...created.offers],
    messages: [...state.messages, ...created.messages],
  };
};

const escalateIncident = (state: EmergencyState, incident: Incident, expectedDeadline: string): EmergencyState => {
  if (
    incident.status !== 'WAITING_FOR_RESPONDER' ||
    incident.assignedEmployeeId ||
    !incident.nextEscalationAt ||
    incident.nextEscalationAt !== expectedDeadline ||
    Date.parse(expectedDeadline) > Date.now()
  ) return state;
  const station = orderedStations(state, incident).find((candidate) => !incident.notifiedStationIds.includes(candidate.id));
  if (!station) {
    return {
      ...state,
      incidents: state.incidents.map((item) => item.id === incident.id ? { ...item, escalationStatus: 'ALL_STATIONS_NOTIFIED', nextEscalationAt: undefined } : item),
    };
  }
  const expanded: Incident = {
    ...incident,
    notifiedStationIds: [...incident.notifiedStationIds, station.id],
    searchStage: incident.searchStage + 1,
    escalationStatus: 'SEARCH_EXPANDED',
    nextEscalationAt: new Date(Date.parse(expectedDeadline) + ESCALATION_INTERVAL_MS).toISOString(),
  };
  const created = offersForStation(state, expanded, station.id);
  const hasAnother = orderedStations(state, expanded).some((candidate) => !expanded.notifiedStationIds.includes(candidate.id));
  if (!hasAnother) {
    expanded.escalationStatus = 'ALL_STATIONS_NOTIFIED';
    expanded.nextEscalationAt = undefined;
  }
  const hasOpenOffers = state.offers.some((offer) => offer.incidentId === incident.id && offer.status === 'open') || created.offers.length > 0;
  expanded.deliveryState = hasOpenOffers ? 'sent' : 'no_responders';
  return {
    ...state,
    incidents: state.incidents.map((item) => item.id === incident.id ? expanded : item),
    offers: [...state.offers, ...created.offers],
    messages: [...state.messages, ...created.messages],
    audit: [...state.audit, { id: generatedId('audit'), type: 'search-expanded', message: `${incident.reference} expanded to ${station.name}`, createdAt: now() }],
  };
};

export function applyEmergencyAction(current: EmergencyState, event: EmergencyAction): EmergencyState {
  if (current.appliedActionIds.includes(event.id)) return current;
  const remember = (state: EmergencyState): EmergencyState => ({ ...state, revision: current.revision + 1, appliedActionIds: [...current.appliedActionIds.slice(-99), event.id] });
  if (event.type === 'reset-session') return remember(createInitialState());
  if (event.type === 'save-profile') return remember({ ...current, profile: event.payload.profile, profileSecurity: event.payload.security, registrationStatus: 'REGISTERED' });
  if (event.type === 'update-profile') return remember({ ...current, profile: event.payload.profile, registrationStatus: 'REGISTERED' });
  if (event.type === 'change-pin') return remember({ ...current, profileSecurity: event.payload.security });
  if (event.type === 'record-pin-failure') {
    if (!current.profileSecurity) return remember(current);
    const failedAttempts = Math.min(PIN_MAX_ATTEMPTS, current.profileSecurity.failedAttempts + 1);
    return remember({ ...current, profileSecurity: { ...current.profileSecurity, failedAttempts, lockedUntil: event.payload.lockedUntil } });
  }
  if (event.type === 'clear-pin-failures') {
    if (!current.profileSecurity) return remember(current);
    return remember({ ...current, profileSecurity: { ...current.profileSecurity, failedAttempts: 0, lockedUntil: undefined } });
  }
  if (event.type === 'create-incident') {
    if (!current.profile || current.incidents.some((incident) => incident.clientId === current.profile?.id && !['completed', 'cancelled'].includes(incident.progress))) return remember(current);
    const incident: Incident = {
      id: event.payload.incidentId,
      reference: `RL-${event.payload.incidentId.slice(-6).toUpperCase()}`,
      clientId: current.profile.id,
      service: event.payload.service,
      createdAt: now(), deliveryState: 'pending', progress: 'submitting', status: 'CREATING', location: event.payload.location,
      information: [], declinedEmployeeIds: [], notifiedStationIds: [], searchStage: 0, escalationStatus: 'INITIAL_STATION',
    };
    return remember({ ...current, incidents: [...current.incidents, incident], audit: [...current.audit, { id: generatedId('audit'), type: 'incident-created', message: `${incident.reference} created`, createdAt: now() }] });
  }
  if (event.type === 'submit-incident') {
    const incident = current.incidents.find((item) => item.id === event.payload.incidentId);
    if (!incident || incident.deliveryState === 'sent') return remember(current);
    const routed = routeIncident(current, incident);
    const submittedAt = routed.incidents.find((item) => item.id === incident.id)?.submittedAt ?? now();
    return remember({
      ...routed,
      audit: [...routed.audit, { id: generatedId('audit'), type: 'submitted', message: `${incident.reference} submitted to responder search`, createdAt: submittedAt }],
    });
  }
  if (event.type === 'update-location') {
    const updated: EmergencyState = { ...current, incidents: current.incidents.map((incident) => incident.id === event.payload.incidentId ? { ...incident, location: event.payload.location, locationNote: event.payload.locationNote ?? incident.locationNote } : incident) };
    const incident = updated.incidents.find((item) => item.id === event.payload.incidentId);
    const routed = incident?.deliveryState === 'pending' && !incident.stationId ? routeIncident(updated, incident) : updated;
    const routedIncident = routed.incidents.find((item) => item.id === event.payload.incidentId);
    return remember(routedIncident ? refreshIncidentMessages(routed, routedIncident) : routed);
  }
  if (event.type === 'add-information') {
    const incident = current.incidents.find((item) => item.id === event.payload.incidentId);
    if (!incident) return remember(current);
    const createdAt = now();
    const updated = {
      ...current,
      incidents: current.incidents.map((item) => item.id === incident.id ? { ...item, informationError: undefined, locationNote: event.payload.landmark || item.locationNote, information: [...item.information, { id: generatedId('information'), incidentId: item.id, happened: event.payload.happened, landmark: event.payload.landmark, attachments: event.payload.attachments, createdAt }] } : item),
      audit: [...current.audit, { id: generatedId('audit'), type: 'information-added', message: `${incident.reference} additional information recorded`, createdAt }],
    };
    const updatedIncident = updated.incidents.find((item) => item.id === incident.id);
    return remember(updatedIncident ? refreshIncidentMessages(updated, updatedIncident) : updated);
  }
  if (event.type === 'save-attendance') {
    const existing = current.attendance.find((item) => item.employeeId === event.payload.employeeId && item.date === event.payload.date);
    const updatedAt = now();
    const entry: AttendanceEntry = { id: existing?.id ?? generatedId('attendance'), ...event.payload, endedAt: event.payload.choice === 'present' ? undefined : updatedAt, updatedAt, updatedBy: 'Supervisor N. Selemela' };
    let updated: EmergencyState = { ...current, attendance: [...current.attendance.filter((item) => item.id !== entry.id), entry] };
    for (const incident of updated.incidents.filter((item) => item.status === 'WAITING_FOR_RESPONDER' && !item.assignedEmployeeId)) {
      for (const stationId of incident.notifiedStationIds) {
        const created = offersForStation(updated, incident, stationId);
        if (!created.offers.length) continue;
        updated = {
          ...updated,
          incidents: updated.incidents.map((item) => item.id === incident.id ? { ...item, deliveryState: 'sent' } : item),
          offers: [...updated.offers, ...created.offers],
          messages: [...updated.messages, ...created.messages],
        };
      }
    }
    return remember(updated);
  }
  if (event.type === 'end-shift') return remember({ ...current, attendance: current.attendance.map((entry) => entry.employeeId === event.payload.employeeId && isAttendanceActive(entry) ? { ...entry, endedAt: now(), updatedAt: now() } : entry) });
  if (event.type === 'add-employee') return remember({ ...current, employees: [...current.employees, { ...event.payload.employee, id: generatedId('employee') }] });
  if (event.type === 'update-employee') return remember({ ...current, employees: current.employees.map((item) => item.id === event.payload.employee.id ? event.payload.employee : item) });
  if (event.type === 'decline-offer') {
    const offer = current.offers.find((item) => item.id === event.payload.offerId);
    if (!offer || offer.status !== 'open') return remember(current);
    const incident = current.incidents.find((item) => item.id === offer.incidentId);
    const employee = current.employees.find((item) => item.id === offer.employeeId);
    const respondedAt = now();
    const offers = current.offers.map((item) => item.id === offer.id ? { ...item, status: 'declined' as const, respondedAt } : item);
    const incidentOffers = offers.filter((item) => item.incidentId === offer.incidentId);
    const everyoneDeclined = incidentOffers.length > 0 && incidentOffers.every((item) => item.status === 'declined');
    return remember({
      ...current,
      offers,
      incidents: current.incidents.map((item) => item.id === offer.incidentId ? { ...item, deliveryState: everyoneDeclined ? 'everyone_declined' : item.deliveryState, declinedEmployeeIds: [...item.declinedEmployeeIds, offer.employeeId] } : item),
      audit: incident ? [...current.audit, { id: generatedId('audit'), type: 'offer-declined', message: `${employee?.employeeNumber ?? 'Responder'} declined ${incident.reference}`, createdAt: respondedAt }] : current.audit,
    });
  }
  if (event.type === 'accept-offer') {
    const offer = current.offers.find((item) => item.id === event.payload.offerId);
    const incident = current.incidents.find((item) => item.id === offer?.incidentId);
    const employee = current.employees.find((item) => item.id === offer?.employeeId);
    if (!offer || !incident || !employee || incident.assignedEmployeeId || incident.status !== 'WAITING_FOR_RESPONDER' || offer.status !== 'open' || !employee.active || !employeeDuty(current, employee.id) || employeeBusy(current, employee.id, incident.id)) return remember(current);
    const acceptedAt = now();
    return remember({
      ...current,
      incidents: current.incidents.map((item) => item.id === incident.id ? { ...item, assignedEmployeeId: employee.id, acceptedAt, progress: 'accepted', status: 'ACCEPTED', escalationStatus: 'STOPPED', nextEscalationAt: undefined } : item),
      offers: current.offers.map((item) => item.incidentId !== incident.id ? item : item.id === offer.id ? { ...item, status: 'accepted', respondedAt: acceptedAt } : { ...item, status: 'closed' }),
      audit: [...current.audit, { id: generatedId('audit'), type: 'accepted', message: `${employee.employeeNumber} accepted ${incident.reference}`, createdAt: acceptedAt }],
    });
  }
  if (event.type === 'update-progress') {
    const statusByProgress = { accepted: 'ACCEPTED', en_route: 'EN_ROUTE', arrived: 'ARRIVED' } as const;
    if (!['accepted', 'en_route', 'arrived'].includes(event.payload.progress)) return remember(current);
    const incident = current.incidents.find((item) => item.id === event.payload.incidentId && item.assignedEmployeeId === event.payload.employeeId && !['CANCELLED', 'COMPLETED'].includes(item.status));
    const employee = current.employees.find((item) => item.id === event.payload.employeeId);
    if (!incident || !employee) return remember(current);
    const updatedAt = now();
    return remember({
      ...current,
      incidents: current.incidents.map((item) => item.id === incident.id ? { ...item, progress: event.payload.progress, status: statusByProgress[event.payload.progress as keyof typeof statusByProgress] } : item),
      audit: [...current.audit, { id: generatedId('audit'), type: `progress-${event.payload.progress.replace('_', '-')}`, message: `${employee.employeeNumber} marked ${incident.reference} ${event.payload.progress}`, createdAt: updatedAt }],
    });
  }
  if (event.type === 'escalate-incident') {
    const incident = current.incidents.find((item) => item.id === event.payload.incidentId);
    return remember(incident ? escalateIncident(current, incident, event.payload.expectedDeadline) : current);
  }
  if (event.type === 'cancel-incident') {
    const incident = current.incidents.find((item) => item.id === event.payload.incidentId);
    if (!incident || ['CANCELLED', 'COMPLETED'].includes(incident.status)) return remember(current);
    if (incident.status === 'WAITING_FOR_RESPONDER' || incident.status === 'CREATING' || incident.status === 'FAILED') {
      const cancelledAt = now();
      return remember({
        ...current,
        incidents: current.incidents.map((item) => item.id === incident.id ? { ...item, status: 'CANCELLED', progress: 'cancelled', escalationStatus: 'STOPPED', nextEscalationAt: undefined } : item),
        offers: current.offers.map((offer) => offer.incidentId === incident.id && offer.status === 'open' ? { ...offer, status: 'closed' } : offer),
        audit: [...current.audit, { id: generatedId('audit'), type: 'cancelled', message: `${incident.reference} cancelled by client`, createdAt: cancelledAt }],
      });
    }
    const requestedAt = now();
    return remember({
      ...current,
      incidents: current.incidents.map((item) => item.id === incident.id ? { ...item, status: 'CANCELLATION_REQUESTED', progressBeforeCancellation: item.progress, progress: 'cancellation_requested', cancellationRequestedAt: requestedAt, cancellationResponse: undefined, completionRequestStatus: undefined, completionRequestedAt: undefined, escalationStatus: 'STOPPED', nextEscalationAt: undefined } : item),
      offers: current.offers.map((offer) => offer.incidentId === incident.id && offer.status === 'open' ? { ...offer, status: 'closed' } : offer),
      audit: [...current.audit, { id: generatedId('audit'), type: 'cancellation-requested', message: `${incident.reference} cancellation requested by client`, createdAt: requestedAt }],
    });
  }
  if (event.type === 'respond-cancellation') {
    const incident = current.incidents.find((item) => item.id === event.payload.incidentId);
    if (!incident || incident.assignedEmployeeId !== event.payload.employeeId || incident.status !== 'CANCELLATION_REQUESTED') return remember(current);
    const employee = current.employees.find((item) => item.id === event.payload.employeeId);
    const respondedAt = now();
    if (event.payload.acknowledge) {
      return remember({
        ...current,
        incidents: current.incidents.map((item) => item.id === incident.id ? { ...item, status: 'CANCELLED', progress: 'cancelled', cancellationResponse: 'acknowledged' } : item),
        audit: [...current.audit, { id: generatedId('audit'), type: 'cancellation-acknowledged', message: `${employee?.employeeNumber ?? 'Responder'} acknowledged cancellation for ${incident.reference}`, createdAt: respondedAt }],
      });
    }
    const restored = incident.progressBeforeCancellation && !['completed', 'cancelled', 'cancellation_requested'].includes(incident.progressBeforeCancellation) ? incident.progressBeforeCancellation : 'arrived';
    const restoredStatus = restored === 'accepted' ? 'ACCEPTED' : restored === 'en_route' ? 'EN_ROUTE' : 'ARRIVED';
    return remember({
      ...current,
      incidents: current.incidents.map((item) => item.id === incident.id ? { ...item, status: restoredStatus, progress: restored, cancellationResponse: 'continued', cancellationRequestedAt: undefined, progressBeforeCancellation: undefined } : item),
      audit: [...current.audit, { id: generatedId('audit'), type: 'cancellation-continued', message: `${employee?.employeeNumber ?? 'Responder'} continued response for ${incident.reference}`, createdAt: respondedAt }],
    });
  }
  if (event.type === 'request-completion') {
    const incident = current.incidents.find((item) => item.id === event.payload.incidentId);
    if (!incident || incident.assignedEmployeeId !== event.payload.employeeId || incident.status !== 'ARRIVED') return remember(current);
    const employee = current.employees.find((item) => item.id === event.payload.employeeId);
    const requestedAt = now();
    return remember({
      ...current,
      incidents: current.incidents.map((item) => item.id === incident.id ? { ...item, completionRequestedAt: requestedAt, completionRequestStatus: 'pending' } : item),
      audit: [...current.audit, { id: generatedId('audit'), type: 'closure-requested', message: `${employee?.employeeNumber ?? 'Responder'} requested closure for ${incident.reference}`, createdAt: requestedAt }],
    });
  }
  if (event.type === 'confirm-help-received') {
    const incident = current.incidents.find((item) => item.id === event.payload.incidentId);
    if (!incident || incident.completionRequestStatus !== 'pending') return remember(current);
    const confirmedAt = now();
    if (!event.payload.received) {
      return remember({
        ...current,
        incidents: current.incidents.map((item) => item.id === incident.id ? { ...item, completionRequestStatus: 'declined' } : item),
        audit: [...current.audit, { id: generatedId('audit'), type: 'closure-declined', message: `${incident.reference} closure declined by client`, createdAt: confirmedAt }],
      });
    }
    return remember({
      ...current,
      incidents: current.incidents.map((item) => item.id === incident.id ? { ...item, status: 'COMPLETED', progress: 'completed', completionRequestStatus: 'confirmed', completedAt: confirmedAt } : item),
      offers: current.offers.map((offer) => offer.incidentId === incident.id && offer.status === 'open' ? { ...offer, status: 'closed' } : offer),
      audit: [...current.audit, { id: generatedId('audit'), type: 'completed', message: `${incident.reference} help confirmed and incident completed`, createdAt: confirmedAt }],
    });
  }
  return remember(current);
}

const readQueue = (code: string): EmergencyAction[] => {
  try { return JSON.parse(storage()?.getItem(queueKey(code)) ?? '[]') as EmergencyAction[]; } catch { return []; }
};

const writeQueue = (code: string, events: EmergencyAction[]) => storage()?.setItem(queueKey(code), JSON.stringify(events));

const statusFromProgress = (progress: IncidentProgress): Incident['status'] => {
  if (progress === 'submitting') return 'CREATING';
  if (progress === 'submission_failed') return 'FAILED';
  if (progress === 'waiting') return 'WAITING_FOR_RESPONDER';
  if (progress === 'accepted') return 'ACCEPTED';
  if (progress === 'en_route') return 'EN_ROUTE';
  if (progress === 'arrived') return 'ARRIVED';
  if (progress === 'cancellation_requested') return 'CANCELLATION_REQUESTED';
  if (progress === 'cancelled') return 'CANCELLED';
  return 'COMPLETED';
};

export const normalizeEmergencyState = (saved: Partial<EmergencyState>): EmergencyState => {
  const initial = createInitialState();
  const profile = saved.profile && 'email' in saved.profile && 'southAfricanId' in saved.profile ? saved.profile as ClientProfile : null;
  return {
    ...initial,
    ...saved,
    version: 3,
    profile,
    profileSecurity: profile ? saved.profileSecurity ?? null : null,
    registrationStatus: profile && saved.profileSecurity ? 'REGISTERED' : 'NOT_REGISTERED',
    incidents: (saved.incidents ?? []).map((incident) => ({
      ...incident,
      status: incident.status ?? statusFromProgress(incident.progress),
      notifiedStationIds: incident.notifiedStationIds ?? (incident.stationId ? [incident.stationId] : []),
      searchStage: incident.searchStage ?? (incident.stationId ? 1 : 0),
      escalationStatus: incident.escalationStatus ?? (incident.progress === 'waiting' ? 'INITIAL_STATION' : 'STOPPED'),
    })),
  };
};

export const readState = (code = activeCode() ?? 'LOCAL1'): EmergencyState => {
  try {
    const saved = storage()?.getItem(stateKey(code));
    return restoreDeviceIdentity(saved ? normalizeEmergencyState(JSON.parse(saved) as Partial<EmergencyState>) : createInitialState());
  } catch { return restoreDeviceIdentity(createInitialState()); }
};

let remoteAvailable = true;
let flushing = false;

const announce = (code: string, state: EmergencyState) => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('rapidlink-state', { detail: state }));
  if ('BroadcastChannel' in window) {
    const channel = new BroadcastChannel(CHANNEL_NAME);
    channel.postMessage({ code, state });
    channel.close();
  }
};

const writeLocal = (code: string, state: EmergencyState) => {
  const localState = restoreDeviceIdentity(state);
  storage()?.setItem(stateKey(code), JSON.stringify(localState));
  announce(code, localState);
  return localState;
};

const mergePending = (state: EmergencyState, pending: EmergencyAction[]) => pending.reduce(applyEmergencyAction, state);

export const receiveRemoteState = (code: string, state: EmergencyState) => writeLocal(code, mergePending(normalizeEmergencyState(state), readQueue(code)));

const uploadQueuedMedia = async (code: string, event: EmergencyAction): Promise<EmergencyAction> => {
  if (event.type !== 'add-information') return event;
  const attachments = await Promise.all(event.payload.attachments.map(async (attachment) => {
    if (!attachment.dataUrl.startsWith('data:')) return attachment;
    const response = await fetch(`/api/sessions/${code}/attachments`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: attachment.name, mimeType: attachment.mimeType, dataUrl: attachment.dataUrl }),
    });
    if (!response.ok) return attachment;
    const uploaded = await response.json() as { storagePath: string; url: string };
    return { ...attachment, dataUrl: uploaded.url, storagePath: uploaded.storagePath };
  }));
  return { ...event, payload: { ...event.payload, attachments } };
};

export async function syncFromRemote(code = activeCode()) {
  if (!code || typeof navigator === 'undefined' || !navigator.onLine) return readState(code ?? 'LOCAL1');
  try {
    const response = await fetch(`/api/sessions/${code}`, { cache: 'no-store' });
    if (!response.ok) { remoteAvailable = response.status !== 503; return readState(code); }
    const record = await response.json() as SessionRecord;
    remoteAvailable = true;
    const remoteState = receiveRemoteState(code, record.state);
    const identity = readDeviceIdentity();
    if (!record.state.profile && identity) return commit(action('save-profile', identity));
    return remoteState;
  } catch { remoteAvailable = false; return readState(code); }
}

export async function flushPending(code = activeCode()) {
  if (!code || flushing || typeof navigator === 'undefined' || !navigator.onLine) return;
  flushing = true;
  try {
    let queue = readQueue(code);
    while (queue.length) {
      const queuedAction = queue[0];
      const nextAction = await uploadQueuedMedia(code, queuedAction);
      const response = await fetch(`/api/sessions/${code}/actions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(nextAction) });
      if (!response.ok) { remoteAvailable = response.status !== 503; break; }
      const record = await response.json() as SessionRecord;
      queue = readQueue(code).filter((event) => event.id !== queuedAction.id);
      writeQueue(code, queue);
      remoteAvailable = true;
      writeLocal(code, mergePending(record.state, queue));
    }
  } catch { remoteAvailable = false; }
  finally { flushing = false; announce(code, readState(code)); }
}

const commit = (event: EmergencyAction) => {
  const code = activeCode() ?? 'LOCAL1';
  const next = applyEmergencyAction(readState(code), event);
  const localState = writeLocal(code, next);
  writeQueue(code, [...readQueue(code), event]);
  void flushPending(code);
  return localState;
};

export async function createSession(code = generateRoomCode()) {
  const normalized = normalizeRoomCode(code);
  storage()?.setItem(ACTIVE_SESSION_KEY, normalized);
  let state = createInitialState();
  try {
    const response = await fetch('/api/sessions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code: normalized }) });
    if (response.ok) state = ((await response.json()) as SessionRecord).state;
    remoteAvailable = response.ok;
  } catch { remoteAvailable = false; }
  writeQueue(normalized, []);
  writeLocal(normalized, state);
  const identity = readDeviceIdentity();
  if (!state.profile && identity) commit(action('save-profile', identity));
  return normalized;
}

export async function joinSession(code: string) {
  const normalized = normalizeRoomCode(code);
  if (normalized.length !== 6) throw new Error('Enter a six-character access code.');
  storage()?.setItem(ACTIVE_SESSION_KEY, normalized);
  const response = await fetch(`/api/sessions/${normalized}`, { cache: 'no-store' }).catch(() => null);
  if (response?.ok) {
    remoteAvailable = true;
    const record = await response.json() as SessionRecord;
    writeLocal(normalized, record.state);
    const identity = readDeviceIdentity();
    if (!record.state.profile && identity) commit(action('save-profile', identity));
  } else if (!storage()?.getItem(stateKey(normalized))) {
    if (response && response.status === 404) throw new Error('That workspace could not be found.');
    remoteAvailable = false;
    writeLocal(normalized, createInitialState());
  }
  return normalized;
}

export const getActiveSessionCode = activeCode;
export const getSyncStatus = (): SyncStatus => {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return 'offline';
  const code = activeCode();
  if (!remoteAvailable || (code && readQueue(code).length)) return 'saved';
  if (flushing) return 'syncing';
  return 'synced';
};

export const sessionService = {
  subscribe(listener: (state: EmergencyState) => void) {
    if (typeof window === 'undefined') return () => undefined;
    const local = (event: Event) => listener((event as CustomEvent<EmergencyState>).detail);
    const storageListener = (event: StorageEvent) => { if (event.key?.startsWith('rapidlink-session-')) listener(readState()); };
    const channel = 'BroadcastChannel' in window ? new BroadcastChannel(CHANNEL_NAME) : null;
    const channelListener = (event: MessageEvent<{ code: string; state: EmergencyState }>) => { if (event.data.code === activeCode()) listener(event.data.state); };
    window.addEventListener('rapidlink-state', local);
    window.addEventListener('storage', storageListener);
    channel?.addEventListener('message', channelListener);
    return () => { window.removeEventListener('rapidlink-state', local); window.removeEventListener('storage', storageListener); channel?.removeEventListener('message', channelListener); channel?.close(); };
  },
  reset() { return commit(action('reset-session', {})); },
  recoverEscalations() {
    let state = readState();
    const safetyLimit = Math.max(1, state.stations.length * Math.max(1, state.incidents.length));
    for (let index = 0; index < safetyLimit; index += 1) {
      const incident = state.incidents.find((item) => item.status === 'WAITING_FOR_RESPONDER' && item.nextEscalationAt && Date.parse(item.nextEscalationAt) <= Date.now());
      if (!incident?.nextEscalationAt) break;
      commit(action('escalate-incident', { incidentId: incident.id, expectedDeadline: incident.nextEscalationAt }));
      state = readState();
    }
    return state;
  },
  recoverUnavailableIncidents() { return this.recoverEscalations(); },
  saveProfile(profile: ClientProfile, security: CancellationPinRecord) {
    writeDeviceIdentity({ profile, security });
    return commit(action('save-profile', { profile, security }));
  },
  updateProfile(profile: ClientProfile) {
    return rememberDeviceIdentity(commit(action('update-profile', { profile })));
  },
  changePin(security: CancellationPinRecord) {
    return rememberDeviceIdentity(commit(action('change-pin', { security })));
  },
  recordPinFailure(lockedUntil?: string) { return rememberDeviceIdentity(commit(action('record-pin-failure', { lockedUntil }))); },
  clearPinFailures() { return rememberDeviceIdentity(commit(action('clear-pin-failures', {}))); },
  createIncident(payload: { incidentId: string; service: ServiceType; location: CapturedLocation | null }) { return commit(action('create-incident', payload)); },
  submitIncident(incidentId: string) { return commit(action('submit-incident', { incidentId })); },
  updateIncidentLocation(incidentId: string, location: CapturedLocation, locationNote?: string) { return commit(action('update-location', { incidentId, location, locationNote })); },
  addIncidentInformation(payload: { incidentId: string; happened: string; landmark: string; attachments: IncidentAttachment[] }) { return commit(action('add-information', payload)); },
  saveAttendance(payload: Extract<EmergencyAction, { type: 'save-attendance' }>['payload']) { return commit(action('save-attendance', payload)); },
  endShift(employeeId: string) { return commit(action('end-shift', { employeeId })); },
  addEmployee(employee: Omit<Employee, 'id'>) { return commit(action('add-employee', { employee })); },
  updateEmployee(employee: Employee) { return commit(action('update-employee', { employee })); },
  declineIncident(offerId: string) { return commit(action('decline-offer', { offerId })); },
  async acceptIncident(offerId: string): Promise<AcceptResult> {
    const state = readState();
    const offer = state.offers.find((item) => item.id === offerId);
    const incident = state.incidents.find((item) => item.id === offer?.incidentId);
    const employee = state.employees.find((item) => item.id === offer?.employeeId);
    if (!offer || !incident || !employee || offer.status !== 'open') return { ok: false, reason: 'invalid' };
    if (incident.assignedEmployeeId && incident.assignedEmployeeId !== employee.id) return { ok: false, reason: 'assigned' };
    if (!employee.active) return { ok: false, reason: 'inactive' };
    if (!employeeDuty(state, employee.id)) return { ok: false, reason: 'off_duty' };
    if (employeeBusy(state, employee.id, incident.id)) return { ok: false, reason: 'busy' };
    commit(action('accept-offer', { offerId }));
    await flushPending();
    const accepted = readState().incidents.find((item) => item.id === incident.id);
    return accepted?.assignedEmployeeId === employee.id ? { ok: true, incident: accepted, employee } : { ok: false, reason: 'assigned' };
  },
  updateIncidentProgress(incidentId: string, employeeId: string, progress: IncidentProgress) { return commit(action('update-progress', { incidentId, employeeId, progress })); },
  cancelIncident(incidentId: string) { return commit(action('cancel-incident', { incidentId })); },
  respondToCancellation(incidentId: string, employeeId: string, acknowledge: boolean) { return commit(action('respond-cancellation', { incidentId, employeeId, acknowledge })); },
  requestCompletion(incidentId: string, employeeId: string) { return commit(action('request-completion', { incidentId, employeeId })); },
  confirmHelpReceived(incidentId: string, received: boolean) { return commit(action('confirm-help-received', { incidentId, received })); },
};
