import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import AdminRoutes from "./routes/AdminRoutes";
import AuthRoutes from "./routes/AuthRoutes";
import UserRoutes from "./routes/UserRoutes";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login/*" element={<AuthRoutes />} />
        <Route path="/admin/*" element={<AdminRoutes />} />
        <Route path="/user/*" element={<UserRoutes />} />
        <Route path="*" element={<Navigate to="/user" />} />
      </Routes>
    </BrowserRouter>
  );
}
