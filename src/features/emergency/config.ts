import { Ambulance, Flame, Shield, type LucideIcon } from 'lucide-react';

import type { ServiceType } from './types';

export interface EmergencyServiceConfig {
  id: ServiceType;
  label: string;
  shortDescription: string;
  icon: LucideIcon;
}

export const EMERGENCY_SERVICES: EmergencyServiceConfig[] = [
  { id: 'police', label: 'Police', shortDescription: 'Threats, crime or immediate danger', icon: Shield },
  { id: 'ambulance', label: 'Ambulance', shortDescription: 'Injury or medical emergency', icon: Ambulance },
  { id: 'fire', label: 'Firefighters', shortDescription: 'Fire, smoke or rescue', icon: Flame },
];

export const serviceLabel = (service: ServiceType) =>
  service === 'sos' ? 'SOS · Police and Ambulance' : EMERGENCY_SERVICES.find((item) => item.id === service)?.label ?? service;

export const GA_RANKUWA_COORDINATES = {
  latitude: -25.6042,
  longitude: 28.0053,
  accuracy: 35,
} as const;

export const ESCALATION_INTERVAL_MS = 30_000;
export const PIN_LOCKOUT_MS = 30_000;
export const PIN_MAX_ATTEMPTS = 5;
