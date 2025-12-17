import { MapContainer, TileLayer, Marker } from "react-leaflet";
import { useEffect, useState } from "react";
import axios from "axios";
import "leaflet/dist/leaflet.css";

const BASE_URL = "http://localhost:8000";

export default function LiveTracking() {
  const [employees, setEmployees] = useState([]);
  const [employeeId, setEmployeeId] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [pos, setPos] = useState(null);
  const [status, setStatus] = useState("Select employee and session to start");

  useEffect(() => {
    const loadEmployees = async () => {
      try {
        const res = await axios.get(`${BASE_URL}/admin/employees`);
        setEmployees(res.data || []);
      } catch (e) {
        setStatus("Failed to load employees");
      }
    };
    loadEmployees();
  }, []);

  useEffect(() => {
    const loadSessions = async () => {
      if (!employeeId) {
        setSessionId("");
        return;
      }
      try {
        const res = await axios.get(`${BASE_URL}/admin/employee/${employeeId}/sessions`);
        const list = res.data || [];
        // Prefer active session (no checkout), else latest by check_in_time
        const active = list.find((s) => !s.check_out_time);
        const chosen = active || list[0];
        if (chosen) {
          setSessionId(chosen.session_id);
          setStatus(active ? "Tracking active session" : "Tracking latest closed session");
        } else {
          setSessionId("");
          setStatus("No sessions for employee");
        }
      } catch (e) {
        setStatus("Failed to load sessions");
      }
    };
    loadSessions();
  }, [employeeId]);

  useEffect(() => {
    let timer;
    const poll = async () => {
      if (!sessionId) return;
      try {
        const res = await axios.get(`${BASE_URL}/admin/live-location/${sessionId}`);
        if (res.data.lat) {
          setPos([res.data.lat, res.data.lng]);
          setStatus(`Last update: ${new Date(res.data.timestamp).toLocaleTimeString()}`);
        } else {
          setStatus("No live data yet");
        }
      } catch (e) {
        setStatus("Polling failed");
      }
    };
    poll();
    timer = setInterval(poll, 10000);
    return () => timer && clearInterval(timer);
  }, [sessionId]);

  return (
    <div>
      <h2>Live Tracking</h2>

      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
        <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
          <option value="">Select Employee</option>
          {employees.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name} ({e.employee_code})
            </option>
          ))}
        </select>

        <span style={{ color: "#64748b" }}>{status}</span>
      </div>

      {pos ? (
        <MapContainer center={pos} zoom={16} style={{ height: "400px" }}>
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          <Marker position={pos} />
        </MapContainer>
      ) : (
        <div style={{ padding: 12, background: "#f8fafc", borderRadius: 8 }}>
          Select employee and session to view live location.
        </div>
      )}
    </div>
  );
}
