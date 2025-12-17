import { Routes, Route } from "react-router-dom";

export default function AuthRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<h2>Login (dummy for now)</h2>} />
    </Routes>
  );
}
