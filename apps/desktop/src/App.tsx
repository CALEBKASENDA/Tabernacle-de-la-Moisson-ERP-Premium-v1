import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { PermissionRoute } from './components/PermissionRoute';
import { SuperAdminRoute } from './components/SuperAdminRoute';
import { Layout } from './components/Layout';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { PastoralDashboard } from './pages/PastoralDashboard';
import { Operations } from './pages/Operations';
import { ExchangeRates } from './pages/ExchangeRates';
import { Categories } from './pages/Categories';
import { Funds } from './pages/Funds';
import { Events } from './pages/Events';
import { Envelopes } from './pages/Envelopes';
import { Pledges } from './pages/Pledges';
import { Counting } from './pages/Counting';
import { Cash } from './pages/Cash';
import { Bank } from './pages/Bank';
import { Budgets } from './pages/Budgets';
import { Closures } from './pages/Closures';
import { Syntheses } from './pages/Syntheses';
import { Reports } from './pages/Reports';
import { Trash } from './pages/Trash';
import { Audit } from './pages/Audit';
import { Churches } from './pages/Churches';
import { Users } from './pages/Users';
import { Security } from './pages/Security';
import { Cloud } from './pages/Cloud';
import { Help } from './pages/Help';
import { Members } from './pages/Members';
import { Cells } from './pages/Cells';
import { Visits } from './pages/Visits';
import { Trainings } from './pages/Trainings';
import { OAuthCallback } from './pages/OAuthCallback';

export function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/oauth/callback" element={<OAuthCallback />} />
          <Route element={<ProtectedRoute />}>
            <Route element={<Layout />}>
              <Route element={<PermissionRoute perms={['finance:reports:voir', 'finance:operations:voir']} />}>
                <Route index element={<Dashboard />} />
              </Route>
              <Route element={<PermissionRoute perm="pastoral:members:voir" />}>
                <Route path="membres" element={<Members />} />
              </Route>
              <Route element={<PermissionRoute perm="pastoral:cells:voir" />}>
                <Route path="cellules" element={<Cells />} />
              </Route>
              <Route element={<PermissionRoute perm="pastoral:visits:voir" />}>
                <Route path="visites" element={<Visits />} />
              </Route>
              <Route element={<PermissionRoute perm="pastoral:trainings:voir" />}>
                <Route path="formations" element={<Trainings />} />
              </Route>
              <Route element={<PermissionRoute perm="finance:reports:voir" />}>
                <Route path="pastoral" element={<PastoralDashboard />} />
                <Route path="rapports" element={<Reports />} />
                <Route path="budgets" element={<Budgets />} />
                <Route path="syntheses" element={<Syntheses />} />
              </Route>
              <Route element={<PermissionRoute perm="finance:operations:voir" />}>
                <Route path="operations" element={<Operations />} />
                <Route path="enveloppes" element={<Envelopes />} />
                <Route path="promesses" element={<Pledges />} />
                <Route path="comptage" element={<Counting />} />
                <Route path="caisse" element={<Cash />} />
                <Route path="banque" element={<Bank />} />
                <Route path="evenements" element={<Events />} />
                <Route path="fonds" element={<Funds />} />
              </Route>
              <Route element={<PermissionRoute perms={['finance:operations:voir', 'finance:operations:modifier']} />}>
                <Route path="rubriques" element={<Categories />} />
              </Route>
              <Route element={<PermissionRoute perm="finance:operations:modifier" />}>
                <Route path="clotures" element={<Closures />} />
              </Route>
              <Route element={<PermissionRoute perms={['finance:exchange-rates:modifier', 'finance:operations:voir']} />}>
                <Route path="taux" element={<ExchangeRates />} />
              </Route>
              <Route element={<PermissionRoute perm="admin:churches:administrer" />}>
                <Route path="eglises" element={<Churches />} />
              </Route>
              <Route element={<PermissionRoute perm="admin:users:administrer" />}>
                <Route path="utilisateurs" element={<Users />} />
              </Route>
              <Route element={<PermissionRoute perm="finance:operations:restaurer" />}>
                <Route path="corbeille" element={<Trash />} />
              </Route>
              <Route path="securite" element={<Security />} />
              <Route element={<SuperAdminRoute />}>
                <Route path="cloud" element={<Cloud />} />
              </Route>
              <Route element={<PermissionRoute perm="finance:audit:voir" />}>
                <Route path="audit" element={<Audit />} />
              </Route>
              <Route path="aide" element={<Help />} />
            </Route>
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}