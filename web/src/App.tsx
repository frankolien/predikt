import { Routes, Route, Navigate } from "react-router-dom";
import { AppShell } from "./AppShell";
import Landing from "./pages/Landing";
import Hub from "./pages/Hub";
import Room from "./pages/Room";
import Organize from "./pages/Organize";
import Fantasy from "./pages/Fantasy";

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<Landing />} />
        <Route path="/app" element={<Hub />} />
        <Route path="/predict" element={<Room />} />
        <Route path="/predict/:fixtureId" element={<Room />} />
        <Route path="/organize" element={<Organize />} />
        <Route path="/fantasy" element={<Fantasy />} />
        {/* back-compat */}
        <Route path="/room" element={<Navigate to="/predict" replace />} />
        <Route path="/room/:fixtureId" element={<Room />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
