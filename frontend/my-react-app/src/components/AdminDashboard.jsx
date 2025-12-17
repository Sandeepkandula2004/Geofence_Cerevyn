import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import axios from "axios";

const BASE_URL = "http://localhost:8000";

export default function AdminDashboard() {
  const [employeeId, setEmployeeId] = useState("");
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {}, []);

  useEffect(() => {
    // Load employees to power the Sessions Polyline button reliably
    const loadEmployees = async () => {
      try {
        const res = await axios.get(`${BASE_URL}/admin/employees`);
        setEmployees(res.data || []);
      } catch {
        // non-blocking
      }
    };
    loadEmployees();
  }, []);

  const sumDistance = (arr) => (arr || []).reduce((acc, s) => acc + (s.total_distance || 0), 0);

  return (
    <div className="admin-dashboard">
      <div className="header">
        <h2>Admin Dashboard</h2>
        <div className="actions">
          <Link className="btn-secondary" to="/admin/live">Live Tracking</Link>
          <Link
            className="btn-secondary"
            to="/admin/sessions"
            title="View sessions polyline"
          >
            Sessions Polyline
          </Link>
          <Link className="btn-secondary" to="/admin/geofences">Geofences</Link>
          <Link className="btn-secondary" to="/admin/employees">Employees</Link>
          <Link className="btn-secondary" to="/admin/reports">Reports</Link>
        </div>
      </div>

      <div className="muted" style={{ marginTop: "1rem" }}>
        Use the Reports page to view summaries and employee reports.
      </div>

      <style>{`
        .admin-dashboard { padding: 1rem; }
        .header { display:flex; align-items:center; justify-content:space-between; }
        .actions { display:flex; gap:0.5rem; }
        .btn { background:#0ea5e9; color:#fff; border:none; padding:0.5rem 0.75rem; border-radius:6px; cursor:pointer; }
        .btn-secondary { background:#334155; color:#fff; text-decoration:none; padding:0.5rem 0.75rem; border-radius:6px; }
        .muted { color:#6b7280; }
        .alert { margin-top:0.75rem; padding:0.5rem 0.75rem; border-radius:6px; }
        .alert.error { background:#fee2e2; color:#991b1b; }
        .alert.info { background:#e0f2fe; color:#0c4a6e; }
      `}</style>
    </div>
  );
}
