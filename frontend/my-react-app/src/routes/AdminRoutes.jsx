import { Routes, Route } from "react-router-dom";

import AdminDashboard from "../components/AdminDashboard";
import Employees from "../components/Employees";
import Sessions from "../components/Sessions";
import LiveTracking from "../components/LiveTracking";
import Geofences from "../components/Geofences";
import Reports from "../components/Reports";

export default function AdminRoutes() {
  return (
    <Routes>
      <Route index element={<AdminDashboard />} />
      <Route path="employees" element={<Employees />} />
      {/* Sessions shows per-employee sessions and polyline view */}
      <Route path="sessions" element={<Sessions />} />
      <Route path="sessions/:employeeId" element={<Sessions />} />
      
      {/* Live tracking: allow direct session link or selection UI */}
      <Route path="live" element={<LiveTracking />} />
      <Route path="live/:sessionId" element={<LiveTracking />} />
      <Route path="geofences" element={<Geofences />} />
      <Route path="reports" element={<Reports />} />
    </Routes>
  );
}
