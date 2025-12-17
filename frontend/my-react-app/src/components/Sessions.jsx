import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import axios from "axios";
import {
	MapContainer,
	TileLayer,
	Polyline,
	Circle,
	Marker,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";

const BASE_URL = "http://localhost:8000";

export default function Sessions() {
	const { employeeId } = useParams();
	const [employees, setEmployees] = useState([]);
	const [selectedEmployeeId, setSelectedEmployeeId] = useState(employeeId || "");
	const [sessions, setSessions] = useState([]);
	const [sessionId, setSessionId] = useState("");
	const [polyline, setPolyline] = useState([]);
	const [geofences, setGeofences] = useState([]);
	const [center, setCenter] = useState([0, 0]);
	const [status, setStatus] = useState("Select a session to view its path");

	useEffect(() => {
		const loadEmployees = async () => {
			try {
				const res = await axios.get(`${BASE_URL}/admin/employees`);
				setEmployees(res.data || []);
			} catch (e) {
				// non-blocking
			}
		};
		loadEmployees();
	}, []);

	useEffect(() => {
		const loadSessions = async () => {
			if (!selectedEmployeeId) {
				setSessions([]);
				setSessionId("");
				return;
			}
			try {
				const res = await axios.get(
					`${BASE_URL}/admin/employee/${selectedEmployeeId}/sessions`
				);
				setSessions(res.data || []);
				setStatus(
					res.data?.length ? "Pick a session" : "No sessions for employee"
				);
			} catch (e) {
				setStatus("Failed to load sessions");
			}
		};
		loadSessions();
	}, [selectedEmployeeId]);

	useEffect(() => {
		const loadGeofences = async () => {
			try {
				const res = await axios.get(`${BASE_URL}/admin/geofences`);
				setGeofences(res.data || []);
			} catch (e) {
				// Ignore geofence load error for now
			}
		};
		loadGeofences();
	}, []);

	useEffect(() => {
		const loadPolyline = async () => {
			if (!sessionId) {
				setPolyline([]);
				return;
			}
			try {
				const res = await axios.get(
					`${BASE_URL}/admin/session/${sessionId}/polyline`
				);
				const raw = Array.isArray(res.data) ? res.data : (res.data?.points || []);
				const pts = raw.map((p) => [p.lat, p.lng]);
				setPolyline(pts);
				if (pts.length) setCenter(pts[0]);
				setStatus(
					pts.length ? `Points: ${pts.length}` : "No recorded polyline for session"
				);
			} catch (e) {
				setStatus("Failed to load polyline");
			}
		};
		loadPolyline();
	}, [sessionId]);

	return (
		<div>
			<h2>Session Polyline</h2>
			<div
				style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}
			>
				<select
					value={selectedEmployeeId}
					onChange={(e) => setSelectedEmployeeId(e.target.value)}
				>
					<option value="">Select Employee</option>
					{employees.map((e) => (
						<option key={e.id} value={e.id}>
							{e.name} ({e.employee_code})
						</option>
					))}
				</select>

				<select
					value={sessionId}
					onChange={(e) => setSessionId(e.target.value)}
					disabled={!sessions.length}
				>
					<option value="">Select Session</option>
					{sessions.map((s) => (
						<option key={s.session_id} value={s.session_id}>
							#{s.session_id} — {new Date(s.check_in_time).toLocaleString()} {s.check_out_time ? "(closed)" : "(active)"}
						</option>
					))}
				</select>

				<span style={{ color: "#64748b" }}>{status}</span>
			</div>

			{polyline.length ? (
				<MapContainer center={center} zoom={15} style={{ height: "420px" }}>
					<TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
					<Polyline positions={polyline} color="blue" />
					{geofences.map((g) => (
						<Circle
							key={g.geofence_id || g.id}
							center={g.center ? [g.center[0], g.center[1]] : [g.lat, g.lng]}
							radius={g.radius_m ?? g.radius}
							pathOptions={{ color: "green" }}
						/>
					))}
					{/* Optional: mark start/end */}
					<Marker position={polyline[0]} />
					<Marker position={polyline[polyline.length - 1]} />
				</MapContainer>
			) : (
				<div style={{ padding: 12, background: "#f8fafc", borderRadius: 8 }}>
					Select a session to view its recorded path.
				</div>
			)}
		</div>
	);
}