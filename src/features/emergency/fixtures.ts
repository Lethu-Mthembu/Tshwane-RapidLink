import type { EmergencyState, Employee, Station } from './types.js';

const minutesFromNow = (minutes: number) => new Date(Date.now() + minutes * 60_000).toISOString();

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

export const seedEmployees: Employee[] = [
  { id: 'employee-p01', employeeNumber: 'P-1048', name: 'Lerato', surname: 'Mokoena', phone: '071 555 0101', service: 'police', stationId: 'station-central', active: true },
  { id: 'employee-p02', employeeNumber: 'P-1182', name: 'Kagiso', surname: 'Molefe', phone: '071 555 0102', service: 'police', stationId: 'station-central', active: true },
  { id: 'employee-a01', employeeNumber: 'A-2071', name: 'Amogelang', surname: 'Dube', phone: '071 555 0201', service: 'ambulance', stationId: 'station-central', active: true },
  { id: 'employee-a02', employeeNumber: 'A-2083', name: 'Neo', surname: 'Nkosi', phone: '071 555 0202', service: 'ambulance', stationId: 'station-central', active: true },
  { id: 'employee-f01', employeeNumber: 'F-3304', name: 'Siyabonga', surname: 'Mahlangu', phone: '071 555 0301', service: 'fire', stationId: 'station-central', active: true },
  { id: 'employee-f02', employeeNumber: 'F-3309', name: 'Palesa', surname: 'Radebe', phone: '071 555 0302', service: 'fire', stationId: 'station-central', active: true },
  { id: 'employee-p03', employeeNumber: 'P-1210', name: 'Tshepo', surname: 'Masango', phone: '071 555 0103', service: 'police', stationId: 'station-mamelodi', active: true },
  { id: 'employee-a03', employeeNumber: 'A-2112', name: 'Karabo', surname: 'Mabena', phone: '071 555 0203', service: 'ambulance', stationId: 'station-mamelodi', active: true },
  { id: 'employee-f03', employeeNumber: 'F-3350', name: 'Lesedi', surname: 'Seabi', phone: '071 555 0303', service: 'fire', stationId: 'station-mamelodi', active: false },
  { id: 'employee-gp01', employeeNumber: 'P-1304', name: 'Boitumelo', surname: 'Kgomo', phone: '071 555 0401', service: 'police', stationId: 'station-garankuwa', active: true },
  { id: 'employee-gp02', employeeNumber: 'P-1311', name: 'Thato', surname: 'Motsamai', phone: '071 555 0402', service: 'police', stationId: 'station-garankuwa', active: true },
  { id: 'employee-ga01', employeeNumber: 'A-2204', name: 'Keitumetse', surname: 'Modise', phone: '071 555 0403', service: 'ambulance', stationId: 'station-garankuwa', active: true },
  { id: 'employee-ga02', employeeNumber: 'A-2210', name: 'Oratile', surname: 'Seema', phone: '071 555 0404', service: 'ambulance', stationId: 'station-garankuwa', active: true },
  { id: 'employee-gf01', employeeNumber: 'F-3406', name: 'Kabelo', surname: 'Mosiane', phone: '071 555 0405', service: 'fire', stationId: 'station-garankuwa', active: true },
  { id: 'employee-gf02', employeeNumber: 'F-3412', name: 'Onthatile', surname: 'Moagi', phone: '071 555 0406', service: 'fire', stationId: 'station-garankuwa', active: true },
];

export const createInitialState = (): EmergencyState => {
  const now = new Date().toISOString();
  const date = now.slice(0, 10);
  const onDutyIds = new Set([
    'employee-p01', 'employee-p02', 'employee-a01', 'employee-a02', 'employee-f01', 'employee-f02',
    'employee-p03', 'employee-a03',
    'employee-gp01', 'employee-gp02', 'employee-ga01', 'employee-ga02', 'employee-gf01', 'employee-gf02',
  ]);

  return {
    version: 3,
    revision: 0,
    appliedActionIds: [],
    stations: seedStations,
    employees: seedEmployees,
    attendance: seedEmployees.map((employee, index) => ({
      id: `attendance-${employee.id}`,
      employeeId: employee.id,
      date,
      shiftStart: minutesFromNow(-60),
      shiftEnd: minutesFromNow(index === 8 ? -15 : 420),
      choice: onDutyIds.has(employee.id) ? 'present' : index === 8 ? 'leave' : 'absent',
      updatedAt: now,
      updatedBy: 'Supervisor N. Selemela',
    })),
    incidents: [],
    offers: [],
    messages: [],
    audit: [],
    profile: null,
    profileSecurity: null,
    registrationStatus: 'NOT_REGISTERED',
  };
};
