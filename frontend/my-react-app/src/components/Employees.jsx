import { useEffect, useState } from "react";
import axios from "axios";

const BASE_URL = "http://localhost:8000";

export default function Employees() {
	const [name, setName] = useState("");
	const [code, setCode] = useState("");
	const [message, setMessage] = useState("");
	const [employees, setEmployees] = useState([]);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState("");
	const [homeForm, setHomeForm] = useState({}); // { [id]: { lat, lng, radius_m } }
	const [faceFiles, setFaceFiles] = useState({}); // { [id]: File }

	const loadEmployees = async () => {
		try {
			setLoading(true);
			setError("");
			const res = await axios.get(`${BASE_URL}/admin/employees`);
			setEmployees(res.data || []);
		} catch (e) {
			setError(e.message || "Failed to load employees");
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		loadEmployees();
	}, []);

	const create = async () => {
		if (!name || !code) {
			setMessage("❌ Please provide name and code");
			return;
		}

		try {
			const res = await axios.post(`${BASE_URL}/employee/create`, {
				name,
				employee_code: code,
			});
			setMessage(`✅ Employee created: ID ${res.data.employee_id}`);
			setName("");
			setCode("");
			await loadEmployees();
		} catch (err) {
			setMessage(`❌ Failed: ${err.response?.data?.error || err.message}`);
		}
	};

	const saveHome = async (empId) => {
		const v = homeForm[empId];
		if (!v || v.lat === undefined || v.lng === undefined || v.radius_m === undefined) {
			setMessage("❌ Provide home lat, lng and radius");
			return;
		}
		try {
			await axios.put(`${BASE_URL}/admin/employee/${empId}/home`, {
				home_lat: parseFloat(v.lat),
				home_lng: parseFloat(v.lng),
				home_radius_m: parseFloat(v.radius_m),
			});
			setMessage(`✅ Home updated for ${empId}`);
		} catch (err) {
			setMessage(`❌ Failed: ${err.response?.data?.detail || err.message}`);
		}
	};

	const enrollFace = async (empId) => {
		const f = faceFiles[empId];
		if (!f) {
			setMessage("❌ Select a face image");
			return;
		}
		try {
			const fd = new FormData();
			fd.append("file", f);
			await axios.post(`${BASE_URL}/admin/employee/${empId}/enroll-face`, fd, {
				headers: { 'Content-Type': 'multipart/form-data' }
			});
			setMessage(`✅ Face enrolled for ${empId}`);
		} catch (err) {
			setMessage(`❌ Enroll failed: ${err.response?.data?.detail || err.message}`);
		}
	};

	const deleteEmployee = async (empId) => {
		if (!confirm(`Delete employee ${empId}? This removes face too.`)) return;
		try {
			await axios.delete(`${BASE_URL}/admin/employee/${empId}`);
			setMessage(`✅ Deleted ${empId}`);
			await loadEmployees();
		} catch (err) {
			setMessage(`❌ Delete failed: ${err.response?.data?.detail || err.message}`);
		}
	};

	return (
		<div className="employees">
			<h2>Employees</h2>

			{error && <div className="alert error">{error}</div>}
			{loading && <div className="alert info">Loading…</div>}

			<div className="create-form">
				<input
					type="text"
					placeholder="Employee Name"
					value={name}
					onChange={(e) => setName(e.target.value)}
				/>
				<input
					type="text"
					placeholder="Employee Code"
					value={code}
					onChange={(e) => setCode(e.target.value)}
				/>
				<button onClick={create}>Create</button>
				{message && <p>{message}</p>}
			</div>

			<h3 style={{ marginTop: "1rem" }}>All Employees</h3>
			{employees.length === 0 ? (
				<p>No employees found.</p>
			) : (
				<table style={{ width: "100%", borderCollapse: "collapse" }}>
					<thead>
						<tr>
							<th style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>ID</th>
							<th style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>Name</th>
							<th style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>Code</th>
							<th style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>Active</th>
							<th style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>Created</th>
							<th style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>Actions</th>
						</tr>
					</thead>
					<tbody>
						{employees.map((e) => (
							<tr key={e.id}>
								<td style={{ padding: "6px 0" }}>{e.id}</td>
								<td style={{ padding: "6px 0" }}>{e.name}</td>
								<td style={{ padding: "6px 0" }}>{e.employee_code}</td>
								<td style={{ padding: "6px 0" }}>{e.is_active ? "Yes" : "No"}</td>
								<td style={{ padding: "6px 0" }}>{e.created_at}</td>
								<td style={{ padding: "6px 0" }}>
									<div style={{ display: 'grid', gap: 6, gridTemplateColumns: 'repeat(3, 1fr)' }}>
										<input type="number" step="any" placeholder="home lat" onChange={(ev)=> setHomeForm(p=>({...p, [e.id]: {...p[e.id], lat: ev.target.value}})) } />
										<input type="number" step="any" placeholder="home lng" onChange={(ev)=> setHomeForm(p=>({...p, [e.id]: {...p[e.id], lng: ev.target.value}})) } />
										<input type="number" step="any" placeholder="radius m" onChange={(ev)=> setHomeForm(p=>({...p, [e.id]: {...p[e.id], radius_m: ev.target.value}})) } />
									</div>
									<div style={{ display:'flex', gap:6, marginTop:6 }}>
										<button onClick={()=> saveHome(e.id)}>Save Home</button>
										<input type="file" accept="image/*" onChange={(ev)=> setFaceFiles(p=> ({...p, [e.id]: ev.target.files?.[0]}))} />
										<button onClick={()=> enrollFace(e.id)}>Enroll Face</button>
										<button style={{ background:'#ef4444', color:'#fff' }} onClick={()=> deleteEmployee(e.id)}>Delete</button>
									</div>
								</td>
							</tr>
						))}
					</tbody>
				</table>
			)}

			<style>{`
				.alert { margin: 8px 0; padding: 8px 12px; border-radius: 6px; }
				.alert.error { background:#fee2e2; color:#991b1b; }
				.alert.info { background:#e0f2fe; color:#0c4a6e; }
				.create-form { display:flex; gap:8px; align-items:center; }
				.create-form input { padding:8px; border:1px solid #e5e7eb; border-radius:6px; }
				.create-form button { padding:8px 12px; border:none; background:#0ea5e9; color:#fff; border-radius:6px; cursor:pointer; }
				table button { padding:6px 8px; border:none; background:#10b981; color:#fff; border-radius:6px; cursor:pointer; }
			`}</style>
		</div>
	);
}




