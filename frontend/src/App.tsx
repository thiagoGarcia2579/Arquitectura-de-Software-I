import { Navigate, Route, Routes } from 'react-router-dom';
import { rutaInicial, useAuth } from './auth/AuthContext';
import { RequireRole } from './auth/RequireRole';
import { Layout } from './components/Layout';
import { LoginPage } from './pages/login/LoginPage';
import { InspectorInspecciones } from './pages/inspector/InspectorInspecciones';
import { InspectorShell } from './pages/inspector/InspectorShell';
import { MisActas } from './pages/inspector/MisActas';
import { NuevaActa } from './pages/inspector/NuevaActa';
import { ActasPage } from './pages/shared/ActasPage';
import { SupervisorInspecciones } from './pages/supervisor/SupervisorInspecciones';
import { CallbackPage } from './pages/login/CallbackPage';
import { AdminInspecciones } from './pages/administrativo/administrativoInspecciones';


export default function App() {
  const { usuario } = useAuth();
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/login/callback" element={<CallbackPage />} />
      
      <Route element={<RequireRole rol="inspector" />}>
        <Route element={<Layout />}>
          <Route element={<InspectorShell />}>
            <Route path="/inspector" element={<InspectorInspecciones />} />
            <Route path="/inspector/nueva" element={<NuevaActa />} />
            <Route path="/inspector/actas" element={<MisActas />} />
          </Route>
        </Route>
      </Route>

      <Route element={<RequireRole rol="supervisor" />}>
        <Route element={<Layout />}>
          <Route path="/supervisor" element={<SupervisorInspecciones />} />
          <Route path="/supervisor/actas" element={<ActasPage />} />
        </Route>
      </Route>

      {/* El administrativo solo consulta: ve actas e inspecciones, nunca las modifica. */}
      <Route element={<RequireRole rol="administrativo" />}>
        <Route element={<Layout />}>
          <Route path="/admin" element={<ActasPage />} />
          <Route path="/admin/inspecciones" element={<AdminInspecciones />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to={usuario ? rutaInicial(usuario.rol) : '/login'} replace />} />
    </Routes>
  );
}
