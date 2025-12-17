import { Routes, Route } from "react-router-dom";
import UserDashboard from "../components/UserDashboard";
import UserTracking from "../components/UserTracking";

export default function UserRoutes() {
  return (
    <Routes>
      <Route path="/" element={<UserDashboard />} />
      <Route path="/tracking/:sessionId" element={<UserTracking />} />
    </Routes>
  );
}
