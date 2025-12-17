import { useEffect, useState } from "react";
import axios from "axios";

const BASE_URL = "http://localhost:8000";

export default function Reports() {
	const [todaySummaries, setTodaySummaries] = useState([]);
	const [yesterdaySummaries, setYesterdaySummaries] = useState([]);
	const [weeklySummaries, setWeeklySummaries] = useState([]);
	const [employeeId, setEmployeeId] = useState("");
	const [employeeSummaries, setEmployeeSummaries] = useState([]);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState("");

	const fetchSummaries = async () => {
		try {
			setLoading(true);
			setError("");
			const [today, yesterday, weekly] = await Promise.all([
				axios.get(`${BASE_URL}/admin/summary/today`),
				axios.get(`${BASE_URL}/admin/summary/yesterday`),
				axios.get(`${BASE_URL}/admin/summary/weekly`),
			]);
			setTodaySummaries(today.data || []);
			setYesterdaySummaries(yesterday.data || []);
			setWeeklySummaries(weekly.data || []);
		} catch (e) {
			setError(e.message || "Failed to load summaries");
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		fetchSummaries();
	}, []);

	const fetchEmployeeSummary = async () => {
		if (!employeeId) return;
		try {
			setLoading(true);
			setError("");
			const res = await axios.get(`${BASE_URL}/admin/summary/employee/${employeeId}`);
			setEmployeeSummaries(res.data || []);
		} catch (e) {
			setError(e.message || "Failed to load employee summary");
		} finally {
			setLoading(false);
		}
	};

	const sumDistance = (arr) => (arr || []).reduce((acc, s) => acc + (s.total_distance || 0), 0);
	const totalCount = (arr) => (arr || []).length;

	return (
		<div className="reports">
			<div className="header">
				<h2>Reports</h2>
				<div className="actions">
					<button className="btn" onClick={fetchSummaries}>↻ Refresh</button>
				</div>
			</div>

			{error && <div className="alert error">{error}</div>}
			{loading && <div className="alert info">Loading…</div>}

			<div className="cards">
				<div className="card">
					<h3>Today</h3>
					<p><strong>Summaries:</strong> {totalCount(todaySummaries)}</p>
					<p><strong>Total Distance (km):</strong> {sumDistance(todaySummaries).toFixed(3)}</p>
				</div>

				<div className="card">
					<h3>Yesterday</h3>
					<p><strong>Summaries:</strong> {totalCount(yesterdaySummaries)}</p>
					<p><strong>Total Distance (km):</strong> {sumDistance(yesterdaySummaries).toFixed(3)}</p>
				</div>

				<div className="card">
					<h3>Last 7 Days</h3>
					<p><strong>Summaries:</strong> {totalCount(weeklySummaries)}</p>
					<p><strong>Total Distance (km):</strong> {sumDistance(weeklySummaries).toFixed(3)}</p>
				</div>
			</div>

			<div className="employee-summary">
				<h3>Employee Summary</h3>
				<div className="row">
					<input
						type="number"
						placeholder="Employee ID"
						value={employeeId}
						onChange={(e) => setEmployeeId(e.target.value)}
					/>
					<button className="btn" onClick={fetchEmployeeSummary}>Fetch</button>
				</div>

				{employeeSummaries.length === 0 ? (
					<p className="muted">No summary yet. Enter an employee ID and fetch.</p>
				) : (
					<table className="table">
						<thead>
							<tr>
								<th>Date</th>
								<th>Distance (km)</th>
								<th>Start</th>
								<th>End</th>
								<th>Odometer</th>
							</tr>
						</thead>
						<tbody>
							{employeeSummaries.map((s, idx) => (
								<tr key={idx}>
									<td>{s.date}</td>
									<td>{(s.total_distance || 0).toFixed(3)}</td>
									<td>[{s.start_lat}, {s.start_lng}]</td>
									<td>[{s.end_lat}, {s.end_lng}]</td>
									<td>
										{s.odometer_start} → {s.odometer_end}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				)}
			</div>

			<style>{`
				.reports { padding: 1rem; }
				.header { display:flex; align-items:center; justify-content:space-between; }
				.actions { display:flex; gap:0.5rem; }
				.btn { background:#0ea5e9; color:#fff; border:none; padding:0.5rem 0.75rem; border-radius:6px; cursor:pointer; }
				.cards { display:grid; grid-template-columns: repeat(3, 1fr); gap:1rem; margin-top:1rem; }
				.card { background:#ffffff; border-radius:8px; padding:1rem; box-shadow:0 1px 4px rgba(0,0,0,0.08); }
				.employee-summary { margin-top:2rem; }
				.row { display:flex; gap:0.5rem; align-items:center; margin-bottom:0.75rem; }
				input[type="number"] { padding:0.5rem; border:1px solid #e5e7eb; border-radius:6px; }
				.table { width:100%; border-collapse: collapse; }
				.table th, .table td { border-bottom:1px solid #e5e7eb; padding:0.5rem; text-align:left; }
				.muted { color:#6b7280; }
				.alert { margin-top:0.75rem; padding:0.5rem 0.75rem; border-radius:6px; }
				.alert.error { background:#fee2e2; color:#991b1b; }
				.alert.info { background:#e0f2fe; color:#0c4a6e; }
			`}</style>
		</div>
	);
}