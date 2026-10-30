import type { EmergencyState, Station } from './types.js';

export const seedStations: Station[] = [
  {
    id: 'station-central',
    name: 'Central Response Station',
    area: 'Pretoria Central',
    latitude: -25.7461,
    longitude: 28.1881,
    services: ['police', 'ambulance', 'fire'],
  },
  {
    id: 'station-mamelodi',
    name: 'Mamelodi Response Station',
    area: 'Mamelodi',
    latitude: -25.7149,
    longitude: 28.3377,
    services: ['police', 'ambulance', 'fire'],
  },
  {
    id: 'station-garankuwa',
    name: 'Ga-Rankuwa Response Station',
    area: 'Ga-Rankuwa',
    latitude: -25.6042,
    longitude: 28.0053,
    services: ['police', 'ambulance', 'fire'],
  },
  {
    id: 'station-north',
    name: 'Northern Response Station',
    area: 'Wonderboom',
    latitude: -25.6878,
    longitude: 28.2016,
    services: ['police', 'ambulance', 'fire'],
  },
];

export const createInitialState = (): EmergencyState => {
  return {
    version: 3,
    revision: 0,
    appliedActionIds: [],
    stations: seedStations,
    employees: [],
    attendance: [],
    incidents: [],
    offers: [],
    messages: [],
    audit: [],
    profile: null,
    profileSecurity: null,
    registrationStatus: 'NOT_REGISTERED',
  };
};
