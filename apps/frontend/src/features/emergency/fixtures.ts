import type { EmergencyState, Employee, Station } from './types';

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
];

export const createInitialState = (): EmergencyState => {
  const now = new Date().toISOString();
  const date = now.slice(0, 10);
  const onDutyIds = new Set(['employee-p01', 'employee-p02', 'employee-a01', 'employee-a02', 'employee-f01', 'employee-f02', 'employee-p03', 'employee-a03']);

  return {
    version: 1,
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
    profile: {
      id: 'client-demo',
      name: 'Naledi',
      surname: 'Mokoena',
      phone: '072 555 0147',
      nextOfKin: { name: 'Refilwe Mokoena', relationship: 'Sister', phone: '073 555 0191' },
    },
  };
};
