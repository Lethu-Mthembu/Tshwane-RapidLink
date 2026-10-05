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

export const DEMO_COORDINATES = {
  latitude: -25.7479,
  longitude: 28.2293,
  accuracy: 35,
} as const;
