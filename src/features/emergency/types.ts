export type ServiceType = 'police' | 'ambulance' | 'fire' | 'sos';

export type IncidentProgress =
  | 'submitting'
  | 'submission_failed'
  | 'waiting'
  | 'accepted'
  | 'en_route'
  | 'arrived'
  | 'cancellation_requested'
  | 'cancelled'
  | 'completed';

export type IncidentStatus =
  | 'CREATING'
  | 'WAITING_FOR_RESPONDER'
  | 'ACCEPTED'
  | 'EN_ROUTE'
  | 'ARRIVED'
  | 'CANCELLATION_REQUESTED'
  | 'CANCELLED'
  | 'COMPLETED'
  | 'FAILED';

export type RegistrationStatus = 'NOT_REGISTERED' | 'SAVING' | 'REGISTERED' | 'SAVE_FAILED';
export type EscalationStatus = 'INITIAL_STATION' | 'SEARCH_EXPANDED' | 'ALL_STATIONS_NOTIFIED' | 'STOPPED';

export type DeliveryState = 'pending' | 'sent' | 'failed' | 'no_station' | 'no_responders' | 'everyone_declined';
export type AttendanceChoice = 'present' | 'absent' | 'leave';
export type OfferStatus = 'open' | 'declined' | 'accepted' | 'closed';

export interface CapturedLocation {
  latitude: number;
  longitude: number;
  accuracy: number;
  capturedAt: string;
  source: 'browser' | 'manual-area';
}

export interface ClientProfile {
  id: string;
  name: string;
  surname: string;
  email: string;
  southAfricanId: string;
  phone: string;
  nextOfKin: { name: string; phone: string; relationship?: string };
  createdAt: string;
  updatedAt: string;
}

export interface CancellationPinRecord {
  salt: string;
  derivedHash: string;
  iterations: number;
  failedAttempts: number;
  lockedUntil?: string;
}

export interface IncidentAttachment {
  id: string;
  kind: 'photo' | 'audio';
  name: string;
  mimeType: string;
  dataUrl: string;
  storagePath?: string;
}

export interface IncidentInformation {
  id: string;
  incidentId: string;
  happened: string;
  landmark: string;
  attachments: IncidentAttachment[];
  createdAt: string;
}

export interface Incident {
  id: string;
  reference: string;
  clientId: string;
  service: ServiceType;
  createdAt: string;
  submittedAt?: string;
  deliveryState: DeliveryState;
  progress: IncidentProgress;
  status: IncidentStatus;
  location: CapturedLocation | null;
  locationNote?: string;
  stationId?: string;
  notifiedStationIds: string[];
  searchStage: number;
  escalationStatus: EscalationStatus;
  nextEscalationAt?: string;
  assignedEmployeeId?: string;
  acceptedAt?: string;
  information: IncidentInformation[];
  informationError?: string;
  declinedEmployeeIds: string[];
  cancellationRequestedAt?: string;
  progressBeforeCancellation?: IncidentProgress;
  cancellationResponse?: 'acknowledged' | 'continued';
  completionRequestedAt?: string;
  completionRequestStatus?: 'pending' | 'declined' | 'confirmed';
  completedAt?: string;
}

export interface Station {
  id: string;
  name: string;
  area: string;
  latitude: number;
  longitude: number;
  services: ServiceType[];
}

export interface Employee {
  id: string;
  employeeNumber: string;
  name: string;
  surname: string;
  phone: string;
  service: ServiceType;
  stationId: string;
  active: boolean;
}

export interface AttendanceEntry {
  id: string;
  employeeId: string;
  date: string;
  shiftStart: string;
  shiftEnd: string;
  choice: AttendanceChoice;
  endedAt?: string;
  updatedAt: string;
  updatedBy: string;
}

export interface IncidentOffer {
  id: string;
  incidentId: string;
  employeeId: string;
  status: OfferStatus;
  createdAt: string;
  respondedAt?: string;
}

export interface ResponderMessage {
  id: string;
  offerId: string;
  incidentId: string;
  employeeId: string;
  createdAt: string;
  readAt?: string;
  provider?: 'simulated';
  deliveryStatus?: 'simulated' | 'queued' | 'sent' | 'failed';
  recipientPhone?: string;
  body?: string;
  responsePath?: string;
  sentAt?: string;
}

export interface AuditEvent {
  id: string;
  type: string;
  message: string;
  createdAt: string;
}

export interface EmergencyState {
  version: 3;
  revision: number;
  appliedActionIds: string[];
  stations: Station[];
  employees: Employee[];
  attendance: AttendanceEntry[];
  incidents: Incident[];
  offers: IncidentOffer[];
  messages: ResponderMessage[];
  audit: AuditEvent[];
  profile: ClientProfile | null;
  profileSecurity: CancellationPinRecord | null;
  registrationStatus: RegistrationStatus;
}

export type SyncStatus = 'offline' | 'saved' | 'syncing' | 'synced';

export type EmergencyAction =
  | { id: string; type: 'create-incident'; payload: { incidentId: string; service: ServiceType; location: CapturedLocation | null } }
  | { id: string; type: 'submit-incident'; payload: { incidentId: string } }
  | { id: string; type: 'update-location'; payload: { incidentId: string; location: CapturedLocation; locationNote?: string } }
  | { id: string; type: 'add-information'; payload: { incidentId: string; happened: string; landmark: string; attachments: IncidentAttachment[] } }
  | { id: string; type: 'save-attendance'; payload: { employeeId: string; date: string; shiftStart: string; shiftEnd: string; choice: AttendanceChoice } }
  | { id: string; type: 'end-shift'; payload: { employeeId: string } }
  | { id: string; type: 'add-employee'; payload: { employee: Omit<Employee, 'id'> } }
  | { id: string; type: 'update-employee'; payload: { employee: Employee } }
  | { id: string; type: 'decline-offer'; payload: { offerId: string } }
  | { id: string; type: 'accept-offer'; payload: { offerId: string } }
  | { id: string; type: 'update-progress'; payload: { incidentId: string; employeeId: string; progress: IncidentProgress } }
  | { id: string; type: 'save-profile'; payload: { profile: ClientProfile; security: CancellationPinRecord } }
  | { id: string; type: 'update-profile'; payload: { profile: ClientProfile } }
  | { id: string; type: 'change-pin'; payload: { security: CancellationPinRecord } }
  | { id: string; type: 'record-pin-failure'; payload: { lockedUntil?: string } }
  | { id: string; type: 'clear-pin-failures'; payload: Record<string, never> }
  | { id: string; type: 'cancel-incident'; payload: { incidentId: string } }
  | { id: string; type: 'respond-cancellation'; payload: { incidentId: string; employeeId: string; acknowledge: boolean } }
  | { id: string; type: 'escalate-incident'; payload: { incidentId: string; expectedDeadline: string } }
  | { id: string; type: 'request-completion'; payload: { incidentId: string; employeeId: string } }
  | { id: string; type: 'confirm-help-received'; payload: { incidentId: string; received: boolean } }
  | { id: string; type: 'reset-session'; payload: Record<string, never> };

export interface SessionRecord {
  id: string;
  code: string;
  state: EmergencyState;
  version: number;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
}

export interface IncidentDraft {
  happened: string;
  landmark: string;
  photo: IncidentAttachment | null;
  audio: IncidentAttachment | null;
  dirty: boolean;
}

export interface AcceptResult {
  ok: boolean;
  reason?: 'invalid' | 'assigned' | 'off_duty' | 'inactive' | 'busy';
  incident?: Incident;
  employee?: Employee;
}
