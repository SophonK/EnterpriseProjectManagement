import { Navigate, Outlet, Route, Routes } from "react-router-dom";
import { AppLayout } from "./components/AppShell";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { LoginPage } from "./pages/LoginPage";
import { PortfoliosPage } from "./pages/PortfoliosPage";
import { PortfolioHealthPage } from "./pages/PortfolioHealthPage";
import { NotFoundPage } from "./pages/NotFoundPage";

function ProtectedLayout() {
  return (
    <ProtectedRoute>
      <AppLayout>
        <Outlet />
      </AppLayout>
    </ProtectedRoute>
  );
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<ProtectedLayout />}>
        <Route path="/" element={<Navigate to="/portfolios" replace />} />
        <Route path="/portfolios" element={<PortfoliosPage />} />
        <Route path="/dashboard" element={<PortfolioHealthPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
