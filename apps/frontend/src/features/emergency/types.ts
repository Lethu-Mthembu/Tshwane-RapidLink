export type ServiceType = 'police' | 'ambulance' | 'fire' | 'sos';

export type IncidentProgress =
  | 'submitting'
  | 'submission_failed'
  | 'waiting'
  | 'accepted'
  | 'en_route'
  | 'arrived'
  | 'completed';

export type DeliveryState = 'pending' | 'sent' | 'failed' | 'no_station' | 'no_responders' | 'everyone_declined';
export type AttendanceChoice = 'present' | 'absent' | 'leave';
export type OfferStatus = 'open' | 'declined' | 'accepted' | 'closed';

export interface CapturedLocation {
  latitude: number;
  longitude: number;
  accuracy: number;
  capturedAt: string;
  source: 'browser' | 'demo';
}

export interface ClientProfile {
  id: string;
  name: string;
  surname: string;
  phone: string;
  nextOfKin?: { name: string; relationship: string; phone: string };
}

export interface IncidentAttachment {
  id: string;
  kind: 'photo' | 'audio';
  name: string;
  mimeType: string;
  dataUrl: string;
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
  location: CapturedLocation | null;
  locationNote?: string;
  stationId?: string;
  assignedEmployeeId?: string;
  acceptedAt?: string;
  information: IncidentInformation[];
  informationError?: string;
  declinedEmployeeIds: string[];
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

export interface SmsMessage {
  id: string;
  offerId: string;
  incidentId: string;
  employeeId: string;
  createdAt: string;
  readAt?: string;
}

export interface AuditEvent {
  id: string;
  type: string;
  message: string;
  createdAt: string;
}

export interface EmergencyState {
  version: 1;
  stations: Station[];
  employees: Employee[];
  attendance: AttendanceEntry[];
  incidents: Incident[];
  offers: IncidentOffer[];
  messages: SmsMessage[];
  audit: AuditEvent[];
  profile: ClientProfile;
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
