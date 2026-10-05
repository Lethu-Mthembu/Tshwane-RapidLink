export type Priority = 'P1' | 'P2' | 'P3';
export type IncidentStatus = 'reported' | 'verifying' | 'verified' | 'dispatched' | 'active' | 'resolved';
export type AssignmentStatus = 'assigned' | 'en_route' | 'nearby' | 'on_scene' | 'completed';
export type Agency = 'EMS' | 'Fire & Rescue' | 'Metro Police';
export type ResourceStatus = 'available' | 'assigned' | 'unavailable';
export type Capability = 'advanced-life-support' | 'patient-transport' | 'extrication' | 'fire-suppression' | 'traffic-control';
export type EvidenceSource = 'reported' | 'inferred' | 'unknown';
export interface Coordinates {
    lat: number;
    lng: number;
}
export interface IncidentLocation extends Coordinates {
    source: 'gps' | 'landmark' | 'pin' | 'address';
    label: string;
    landmark?: string;
    confidence: number;
    confirmed: boolean;
}
export interface TriageFinding<T> {
    value: T;
    source: EvidenceSource;
    confidence: number;
}
export interface TriageSummary {
    incidentType: TriageFinding<string>;
    casualties: TriageFinding<number>;
    entrapment: TriageFinding<boolean | null>;
    fireRisk: TriageFinding<boolean | null>;
}
export interface PriorityFactor {
    label: string;
    score: number;
    source: 'rule' | 'dispatcher';
}
export interface Incident {
    id: string;
    reference: string;
    type: string;
    status: IncidentStatus;
    priority: Priority;
    priorityScore: number;
    priorityFactors: PriorityFactor[];
    description: string;
    transcript: string;
    casualties: number;
    trappedPersons: boolean | null;
    fireRisk: boolean | null;
    location: IncidentLocation;
    triage: TriageSummary;
    reportedAt: string;
    verifiedAt?: string;
    dispatchedAt?: string;
    resolvedAt?: string;
}
export interface Resource {
    id: string;
    callSign: string;
    agency: Agency;
    type: string;
    capabilities: Capability[];
    status: ResourceStatus;
    location: Coordinates;
    etaMinutes: number;
    distanceKm: number;
    workload: number;
}
export interface ResourceRecommendation {
    resourceId: string;
    reason: string;
    selected: boolean;
}
export interface Assignment {
    id: string;
    incidentId: string;
    resourceId: string;
    status: AssignmentStatus;
    assignedAt: string;
    etaMinutes: number;
}
export interface TimelineEvent {
    id: string;
    incidentId: string;
    kind: 'report' | 'verification' | 'dispatch' | 'status' | 'escalation' | 'support' | 'resolution';
    title: string;
    detail: string;
    timestamp: string;
    visibility: 'public' | 'operational';
}
export interface CitizenUpdate {
    id: string;
    incidentId: string;
    title: string;
    message: string;
    timestamp: string;
    status: 'received' | 'location_confirmed' | 'dispatched' | 'nearby' | 'on_scene' | 'resolved';
}
export interface SupportRequest {
    id: string;
    incidentId: string;
    requestedBy: string;
    resourceType: string;
    reason: string;
    status: 'pending' | 'approved';
    requestedAt: string;
}
