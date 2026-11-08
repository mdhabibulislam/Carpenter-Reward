import { Component, lazy, Suspense, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { MotionConfig } from 'motion/react';
import { ShieldAlert } from 'lucide-react';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { AppLayout } from './layouts/AppLayout';
import { Button, EmptyState, Skeleton, Toaster } from './components/ui';
import { Login } from './pages/Login';
import { CONFIG_ERROR } from './lib/supabase';

const Home = lazy(() => import('./pages/Home'));
const AdminUpload = lazy(() => import('./pages/AdminUpload'));
const AdminPeople = lazy(() => import('./pages/AdminPeople'));
const AdminCarpenters = lazy(() => import('./pages/AdminCarpenters'));
const AdminReady = lazy(() => import('./pages/AdminReady'));

class ErrorBoundary extends Component<{ children: ReactNode }, { err?: Error }> {
  state: { err?: Error } = {};
  static getDerivedStateFromError(err: Error) { return { err }; }
  render() {
    if (this.state.err) return (
      <div className="grid min-h-[60vh] place-items-center"><div className="text-center">
        <EmptyState title="Something went wrong" text={this.state.err.message} icon={ShieldAlert} />
        <Button variant="primary" onClick={() => location.reload()}>Reload</Button>
      </div></div>
    );
    return this.props.children;
  }
}

function Protected({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <div className="p-10"><Skeleton className="h-8 w-60" /></div>;
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  return <>{children}</>;
}
/** Super Admin pages are blocked for everyone else, even by typing the address. */
function AdminOnly({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  if (user?.role !== 'super_admin') return <EmptyState icon={ShieldAlert} title="Access restricted" text="Only Super Admin can open this page." />;
  return <>{children}</>;
}

const Loading = () => <div className="space-y-4"><Skeleton className="h-9 w-72" /><Skeleton className="h-36" /><Skeleton className="h-64" /></div>;
const page = (el: ReactNode) => <Suspense fallback={<Loading />}><ErrorBoundary>{el}</ErrorBoundary></Suspense>;

export function App() {
  if (CONFIG_ERROR) return <div className="grid min-h-screen place-items-center p-6"><EmptyState icon={ShieldAlert} title="App not configured" text={CONFIG_ERROR} /></div>;
  return (
    <MotionConfig reducedMotion="user">
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route element={<Protected><AppLayout /></Protected>}>
              <Route path="/" element={page(<Home />)} />
              <Route path="/admin/upload" element={page(<AdminOnly><AdminUpload /></AdminOnly>)} />
              <Route path="/admin/people" element={page(<AdminOnly><AdminPeople /></AdminOnly>)} />
              <Route path="/admin/carpenters" element={page(<AdminOnly><AdminCarpenters /></AdminOnly>)} />
              <Route path="/admin/ready" element={page(<AdminOnly><AdminReady /></AdminOnly>)} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
          <Toaster />
        </AuthProvider>
      </BrowserRouter>
    </MotionConfig>
  );
}
