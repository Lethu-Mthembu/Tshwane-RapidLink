import { Navigate, Route, Routes } from 'react-router-dom';

import { AppShell } from '@/components/app-shell';
import { EmergencyProvider } from '@/features/emergency/emergency-context';
import { useEmergency } from '@/features/emergency/emergency-context';
import AttendancePage from '@/pages/attendance';
import ClientPage from '@/pages/client';
import ClientProfilePage from '@/pages/client-profile';
import LauncherPage from '@/pages/launcher';
import MessagesPage from '@/pages/messages';
import OfflinePage from '@/pages/offline';
import ResponderPage from '@/pages/responder';
import ResponderOfferPage from '@/pages/responder-offer';
import RegisterPage from '@/pages/register';
import SupervisorPage from '@/pages/supervisor';
import SupervisorAnalyticsPage from '@/pages/supervisor-analytics';

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

export function App() {
  return (
    <EmergencyProvider>
      <AppShell>
        <Routes>
          <Route path="/" element={<Navigate to="/client" replace />} />
          <Route path="/session" element={<LauncherPage />} />
          <Route path="/register" element={<RegistrationOnly />} />
          <Route path="/client" element={<ClientOnly><ClientPage /></ClientOnly>} />
          <Route path="/client/profile" element={<ClientOnly><ClientProfilePage /></ClientOnly>} />
          <Route path="/citizen" element={<Navigate to="/client" replace />} />
          <Route path="/messages" element={<MessagesPage />} />
          <Route path="/responder" element={<ResponderPage />} />
          <Route path="/responder/offers/:offerId" element={<ResponderOfferPage />} />
          <Route path="/supervisor" element={<SupervisorPage />} />
          <Route path="/supervisor/analytics" element={<SupervisorAnalyticsPage />} />
          <Route path="/supervisor/employees" element={<Navigate to="/supervisor" replace />} />
          <Route path="/supervisor/attendance" element={<AttendancePage />} />
          <Route path="/dispatcher" element={<Navigate to="/supervisor" replace />} />
          <Route path="/offline" element={<OfflinePage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AppShell>
    </EmergencyProvider>
  );
}
