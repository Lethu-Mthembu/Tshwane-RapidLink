import { Navigate, Route, Routes } from 'react-router-dom';

import { AppShell } from '@/components/app-shell';
import { hasStaffRole, StaffAuthProvider, useStaffAuth } from '@/features/auth/staff-auth-context';
import { EmergencyProvider } from '@/features/emergency/emergency-context';
import { useEmergency } from '@/features/emergency/emergency-context';
import type { StaffRole } from '@/features/emergency/types';
import AttendancePage from '@/pages/attendance';
import ClientPage from '@/pages/client';
import ClientProfilePage from '@/pages/client-profile';
import AdminPage from '@/pages/admin';
import MessagesPage from '@/pages/messages';
import OfflinePage from '@/pages/offline';
import ResponderPage from '@/pages/responder';
import ResponderOfferPage from '@/pages/responder-offer';
import RegisterPage from '@/pages/register';
import SupervisorPage from '@/pages/supervisor';
import SupervisorAnalyticsPage from '@/pages/supervisor-analytics';
import StaffSignInPage from '@/pages/staff-sign-in';
import StaffActivatePage from '@/pages/staff-activate';
import StaffBootstrapPage from '@/pages/staff-bootstrap';
import StaffChangePasswordPage from '@/pages/staff-change-password';

function ClientOnly({ children }: { children: React.ReactNode }) {
  const { ready, state } = useEmergency();
  if (!ready) return <main className="min-h-[calc(100vh-4rem)] bg-white p-8 text-center font-bold text-[#003172]" role="status">Loading your profile…</main>;
  return state.registrationStatus === 'REGISTERED' && state.profile ? children : <Navigate to="/register" replace />;
}

function RegistrationOnly() {
  const { ready, state } = useEmergency();
  if (!ready) return <main className="min-h-[calc(100vh-4rem)] bg-white p-8 text-center font-bold text-[#003172]" role="status">Loading registration…</main>;
  return state.registrationStatus === 'REGISTERED' && state.profile ? <Navigate to="/client" replace /> : <RegisterPage />;
}

function StaffOnly({ roles, children }: { roles: StaffRole[]; children: React.ReactNode }) {
  const { loading, identity } = useStaffAuth();
  if (loading) return <main className="min-h-[calc(100vh-4rem)] bg-white p-8 text-center font-bold text-[#003172]" role="status">Checking staff access…</main>;
  if (!hasStaffRole(identity, roles)) {
    return <Navigate to="/staff/sign-in" replace />;
  }
  return children;
}

export function App() {
  return (
    <StaffAuthProvider>
      <EmergencyProvider>
        <AppShell>
          <Routes>
          <Route path="/" element={<Navigate to="/client" replace />} />
          <Route path="/session" element={<Navigate to="/client" replace />} />
          <Route path="/register" element={<RegistrationOnly />} />
          <Route path="/client" element={<ClientOnly><ClientPage /></ClientOnly>} />
          <Route path="/client/profile" element={<ClientOnly><ClientProfilePage /></ClientOnly>} />
          <Route path="/citizen" element={<Navigate to="/client" replace />} />
          <Route path="/staff/sign-in" element={<StaffSignInPage />} />
          <Route path="/staff/activate" element={<StaffActivatePage />} />
          <Route path="/staff/bootstrap" element={<StaffBootstrapPage />} />
          <Route path="/staff/change-password" element={<StaffOnly roles={['admin', 'supervisor', 'responder']}><StaffChangePasswordPage /></StaffOnly>} />
          <Route path="/admin" element={<StaffOnly roles={['admin']}><AdminPage /></StaffOnly>} />
          <Route path="/messages" element={<StaffOnly roles={['responder']}><MessagesPage /></StaffOnly>} />
          <Route path="/responder" element={<StaffOnly roles={['responder']}><ResponderPage /></StaffOnly>} />
          <Route path="/responder/offers/:offerId" element={<StaffOnly roles={['responder']}><ResponderOfferPage /></StaffOnly>} />
          <Route path="/supervisor" element={<StaffOnly roles={['supervisor']}><SupervisorPage /></StaffOnly>} />
          <Route path="/supervisor/analytics" element={<StaffOnly roles={['supervisor']}><SupervisorAnalyticsPage /></StaffOnly>} />
          <Route path="/supervisor/employees" element={<Navigate to="/supervisor" replace />} />
          <Route path="/supervisor/attendance" element={<StaffOnly roles={['supervisor']}><AttendancePage /></StaffOnly>} />
          <Route path="/dispatcher" element={<Navigate to="/supervisor" replace />} />
          <Route path="/offline" element={<OfflinePage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AppShell>
      </EmergencyProvider>
    </StaffAuthProvider>
  );
}
