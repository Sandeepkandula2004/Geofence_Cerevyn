import { MapContainer, TileLayer, Circle, useMapEvents, useMap } from "react-leaflet";
import { useState, useEffect } from "react";
import axios from "axios";
import { listGeofences, createGeofence, deleteGeofence, assignGeofence, deleteAssignment } from "../api";
import "leaflet/dist/leaflet.css";

const BASE_URL = "http://localhost:8000";

function ClickHandler({ onClick }) {
  useMapEvents({
    click(e) {
      onClick(e.latlng);
    },
  });
  return null;
}

function MapUpdater({ center }) {
  const map = useMap();
  useEffect(() => {
    if (center) {
      map.setView([center.lat, center.lng], 16);
    }
  }, [center, map]);
  return null;
}

export default function Geofences() {
  const [name, setName] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [radius, setRadius] = useState("100");
  const [allGeofences, setAllGeofences] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [selectedEmployee, setSelectedEmployee] = useState("");
  const [employeeAssignments, setEmployeeAssignments] = useState([]);
  const [message, setMessage] = useState("");

  useEffect(() => {
    loadEmployees();
    loadAllGeofences();
  }, []);

  const loadEmployees = async () => {
    try {
      const res = await axios.get(`${BASE_URL}/admin/employees`);
      setEmployees(res.data || []);
    } catch (error) {
      console.error("Error loading employees:", error);
    }
  };

  const loadAllGeofences = async () => {
    try {
      const data = await listGeofences();
      setAllGeofences(data);
    } catch (error) {
      console.error("Error loading geofences:", error);
    }
  };

  const handleEmployeeChange = async (empId) => {
    setSelectedEmployee(empId);
    if (!empId) {
      setEmployeeAssignments([]);
      return;
    }
    
    try {
      const res = await axios.get(`${BASE_URL}/employee/${empId}/targets`);
      setEmployeeAssignments(res.data || []);
    } catch (error) {
      console.error("Error loading employee targets:", error);
      setEmployeeAssignments([]);
    }
  };

  const handleMapClick = (latlng) => {
    setLat(latlng.lat.toFixed(6));
    setLng(latlng.lng.toFixed(6));
  };

  const handleCurrentLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setLat(position.coords.latitude.toFixed(6));
          setLng(position.coords.longitude.toFixed(6));
          setMessage("✅ Current location set");
          setTimeout(() => setMessage(""), 3000);
        },
        (error) => {
          setMessage("❌ Unable to get location: " + error.message);
        }
      );
    } else {
      setMessage("❌ Geolocation not supported");
    }
  };

  const handleCreateGeofence = async () => {
    if (!name || !lat || !lng || !radius) {
      setMessage("❌ Please fill all fields");
      return;
    }

    try {
      const result = await createGeofence({
        name,
        center_lat: parseFloat(lat),
        center_lng: parseFloat(lng),
        radius_m: parseFloat(radius),
      });

      if (result.geofence_id) {
        setMessage(`✅ Geofence "${name}" created!`);
        setName("");
        setLat("");
        setLng("");
        setRadius("100");
        loadAllGeofences();
        if (selectedEmployee) {
          handleEmployeeChange(selectedEmployee);
        }
      } else if (result.error) {
        setMessage(`❌ Error: ${result.error}`);
      }
    } catch (error) {
      setMessage(`❌ Failed: ${error.message}`);
    }
  };

  const handleDelete = async (geofenceId, geofenceName) => {
    if (!window.confirm(`Are you sure you want to delete "${geofenceName}"?`)) {
      return;
    }

    try {
      const result = await deleteGeofence(geofenceId);
      
      if (result.message) {
        setMessage(`✅ Geofence "${geofenceName}" deleted!`);
        loadAllGeofences();
        if (selectedEmployee) {
          handleEmployeeChange(selectedEmployee);
        }
        setTimeout(() => setMessage(""), 3000);
      } else if (result.error) {
        setMessage(`❌ Error: ${result.error}`);
      }
    } catch (error) {
      setMessage(`❌ Failed to delete: ${error.message}`);
    }
  };

  const handleAssignGeofence = async (geofenceId) => {
    if (!selectedEmployee) {
      setMessage("❌ Please select an employee first");
      return;
    }

    try {
      const today = new Date().toISOString().split("T")[0];
      const result = await assignGeofence({
        employee_id: parseInt(selectedEmployee),
        geofence_id: parseInt(geofenceId),
        assigned_date: today,
      });

      if (result.assignment_id) {
        setMessage("✅ Geofence assigned!");
        handleEmployeeChange(selectedEmployee);
        setTimeout(() => setMessage(""), 3000);
      } else if (result.error) {
        setMessage(`❌ Error: ${result.error}`);
      }
    } catch (error) {
      setMessage(`❌ Failed: ${error.message}`);
    }
  };

  const handleDeassignGeofence = async (assignmentId) => {
    if (!window.confirm("Are you sure you want to deassign this geofence?")) {
      return;
    }

    try {
      const result = await deleteAssignment(assignmentId);
      
      if (result.message) {
        setMessage("✅ Geofence deassigned!");
        handleEmployeeChange(selectedEmployee);
        setTimeout(() => setMessage(""), 3000);
      } else if (result.error) {
        setMessage(`❌ Error: ${result.error}`);
      }
    } catch (error) {
      setMessage(`❌ Failed: ${error.message}`);
    }
  };

  const handleViewOnMap = (latitude, longitude) => {
    setLat(latitude.toFixed(6));
    setLng(longitude.toFixed(6));
  };

  const center = lat && lng ? { lat: parseFloat(lat), lng: parseFloat(lng) } : null;

  return (
    <div className="geofences">
      <h1>Geofence Management</h1>

      {/* Employee Selector */}
      <div className="card">
        <h2>Select Employee</h2>
        <div className="form-group">
          <label htmlFor="employee">Employee</label>
          <select
            id="employee"
            value={selectedEmployee}
            onChange={(e) => handleEmployeeChange(e.target.value)}
          >
            <option value="">Choose employee...</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name} ({e.employee_code})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Employee's Assigned Geofences */}
      {selectedEmployee && (
        <div className="card">
          <h2>Today's Assigned Geofences for {employees.find(e => e.id.toString() === selectedEmployee)?.name}</h2>
          {employeeAssignments.length === 0 ? (
            <p className="muted">No geofences assigned for today</p>
          ) : (
            <div className="assignment-list">
              {employeeAssignments.map((assign) => (
                <div key={assign.assignment_id} className="assignment-card">
                  <h3>{assign.geofence_name}</h3>
                  <p><strong>Radius:</strong> {assign.radius_m}m</p>
                  <p><strong>Location:</strong> [{assign.center[0].toFixed(4)}, {assign.center[1].toFixed(4)}]</p>
                  <button
                    onClick={() => handleDeassignGeofence(assign.assignment_id)}
                    className="btn-deassign"
                  >
                    ✕ Deassign
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="card">
        <h2>Create New Geofence</h2>

        <div className="form-group">
          <label htmlFor="name">Geofence Name</label>
          <input
            id="name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Customer Site A"
          />
        </div>

        <div className="location-input">
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="lat">Latitude</label>
              <input
                id="lat"
                type="number"
                step="any"
                value={lat}
                onChange={(e) => setLat(e.target.value)}
                placeholder="17.4555"
              />
            </div>

            <div className="form-group">
              <label htmlFor="lng">Longitude</label>
              <input
                id="lng"
                type="number"
                step="any"
                value={lng}
                onChange={(e) => setLng(e.target.value)}
                placeholder="78.4010"
              />
            </div>
          </div>

          <div className="location-buttons">
            <button onClick={handleCurrentLocation} className="btn-secondary">
              📍 Use Current Location
            </button>
            <span className="hint">or click on the map below</span>
          </div>
        </div>

        <div className="form-group">
          <label htmlFor="radius">Radius (meters)</label>
          <input
            id="radius"
            type="number"
            value={radius}
            onChange={(e) => setRadius(e.target.value)}
            placeholder="100"
          />
        </div>

        <div className="map-container">
          <MapContainer
            center={[17.4555, 78.4010]}
            zoom={13}
            style={{ height: "400px", borderRadius: "8px" }}
          >
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            <ClickHandler onClick={handleMapClick} />
            
            {/* Show employee's assigned geofences in green */}
            {employeeAssignments.map((assign) => (
              <Circle
                key={assign.assignment_id}
                center={[assign.center[0], assign.center[1]]}
                radius={assign.radius_m}
                color="green"
                fillColor="green"
                fillOpacity={0.15}
              />
            ))}
            
            {/* Show all other geofences in gray */}
            {allGeofences
              .filter(
                (gf) =>
                  !employeeAssignments.find(
                    (assign) => assign.geofence_id === gf.geofence_id
                  )
              )
              .map((gf) => (
                <Circle
                  key={gf.geofence_id}
                  center={[gf.center[0], gf.center[1]]}
                  radius={gf.radius_m}
                  color="gray"
                  fillColor="gray"
                  fillOpacity={0.1}
                />
              ))}
            
            {/* Show new geofence being created in blue */}
            {center && (
              <Circle
                center={center}
                radius={parseFloat(radius)}
                color="blue"
                fillColor="blue"
                fillOpacity={0.3}
              />
            )}
            
            <MapUpdater center={center} />
          </MapContainer>
          <p className="map-hint">
            🟢 Green: Assigned to selected employee | ⚫ Gray: Other geofences | 🔵 Blue: New geofence | Click map to set location
          </p>
        </div>

        <button onClick={handleCreateGeofence} className="btn-primary">
          Create Geofence
        </button>

        {message && (
          <div className={`message ${message.includes("✅") ? "success" : "error"}`}>
            {message}
          </div>
        )}
      </div>

      <div className="card">
        <h2>All Geofences</h2>
        {allGeofences.length === 0 ? (
          <p>No geofences created yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Name</th>
                <th>Center (Lat, Lng)</th>
                <th>Radius (m)</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {allGeofences.map((gf) => {
                const isAssigned = employeeAssignments.some(
                  (assign) => assign.geofence_id === gf.geofence_id
                );
                return (
                  <tr key={gf.geofence_id} style={{ background: isAssigned ? "#f0f9ff" : "white" }}>
                    <td>{gf.geofence_id}</td>
                    <td>{gf.name} {isAssigned && "✓"}</td>
                    <td>
                      [{gf.center[0].toFixed(6)}, {gf.center[1].toFixed(6)}]
                    </td>
                    <td>{gf.radius_m}</td>
                    <td>
                      <div className="action-buttons">
                        <button
                          onClick={() => handleViewOnMap(gf.center[0], gf.center[1])}
                          className="btn-small"
                        >
                          View on Map
                        </button>
                        {selectedEmployee && !isAssigned && (
                          <button
                            onClick={() => handleAssignGeofence(gf.geofence_id)}
                            className="btn-assign"
                          >
                            Assign
                          </button>
                        )}
                        {selectedEmployee && isAssigned && (
                          <button
                            onClick={() => {
                              const assignmentId = employeeAssignments.find(
                                (a) => a.geofence_id === gf.geofence_id
                              )?.assignment_id;
                              if (assignmentId) handleDeassignGeofence(assignmentId);
                            }}
                            className="btn-deassign"
                          >
                            ✕ Deassign
                          </button>
                        )}
                        <button
                          onClick={() => handleDelete(gf.geofence_id, gf.name)}
                          className="btn-delete"
                        >
                          🗑️ Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <style>{`
        .geofences {
          padding: 2rem;
          max-width: 1200px;
          margin: 0 auto;
        }
        .card {
          background: white;
          border-radius: 8px;
          padding: 2rem;
          margin-bottom: 2rem;
          box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }
        .form-group {
          margin-bottom: 1.5rem;
        }
        .form-group label {
          display: block;
          margin-bottom: 0.5rem;
          font-weight: 500;
          color: #333;
        }
        .form-group input {
          width: 100%;
          padding: 0.75rem;
          border: 1px solid #ddd;
          border-radius: 4px;
          font-size: 1rem;
        }
        .form-group select {
          width: 100%;
          padding: 0.75rem;
          border: 1px solid #ddd;
          border-radius: 4px;
          font-size: 1rem;
          background: white;
        }
        .form-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 1rem;
        }
        .location-input {
          background: #f8f9fa;
          padding: 1.5rem;
          border-radius: 8px;
          margin-bottom: 1.5rem;
        }
        .location-buttons {
          display: flex;
          align-items: center;
          gap: 1rem;
          margin-top: 1rem;
        }
        .btn-primary {
          background: #4CAF50;
          color: white;
          border: none;
          padding: 0.75rem 1.5rem;
          border-radius: 4px;
          font-size: 1rem;
          cursor: pointer;
          font-weight: 500;
        }
        .btn-primary:hover {
          background: #45a049;
        }
        .btn-secondary {
          background: #2196F3;
          color: white;
          border: none;
          padding: 0.75rem 1.5rem;
          border-radius: 4px;
          cursor: pointer;
          font-weight: 500;
        }
        .btn-secondary:hover {
          background: #0b7dda;
        }
        .btn-small {
          background: #2196F3;
          color: white;
          border: none;
          padding: 0.5rem 1rem;
          border-radius: 4px;
          text-decoration: none;
          font-size: 0.9rem;
          display: inline-block;
        }
        .btn-small:hover {
          background: #0b7dda;
        }
        .btn-assign {
          background: #4CAF50;
          color: white;
          border: none;
          padding: 0.5rem 1rem;
          border-radius: 4px;
          cursor: pointer;
          font-size: 0.9rem;
          display: inline-block;
        }
        .btn-assign:hover {
          background: #45a049;
        }
        .btn-deassign {
          background: #ff9800;
          color: white;
          border: none;
          padding: 0.5rem 1rem;
          border-radius: 4px;
          cursor: pointer;
          font-size: 0.9rem;
          display: inline-block;
        }
        .btn-deassign:hover {
          background: #e68900;
        }
        .btn-delete {
          background: #f44336;
          color: white;
          border: none;
          padding: 0.5rem 1rem;
          border-radius: 4px;
          cursor: pointer;
          font-size: 0.9rem;
          display: inline-block;
        }
        .btn-delete:hover {
          background: #da190b;
        }
        .action-buttons {
          display: flex;
          gap: 0.5rem;
          align-items: center;
          flex-wrap: wrap;
        }
        .hint {
          color: #666;
          font-size: 0.9rem;
          font-style: italic;
        }
        .map-container {
          margin: 1.5rem 0;
        }
        .map-hint {
          margin-top: 0.5rem;
          font-size: 0.9rem;
          color: #666;
          text-align: center;
        }
        .message {
          margin-top: 1rem;
          padding: 1rem;
          border-radius: 4px;
        }
        .message.success {
          background: #d4edda;
          color: #155724;
          border: 1px solid #c3e6cb;
        }
        .message.error {
          background: #f8d7da;
          color: #721c24;
          border: 1px solid #f5c6cb;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 1rem;
        }
        th, td {
          padding: 0.75rem;
          text-align: left;
          border-bottom: 1px solid #e0e0e0;
        }
        th {
          background: #f5f5f5;
          font-weight: 600;
        }
        tr:hover {
          background: #fafafa;
        }
        .assignment-list {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
          gap: 1rem;
          margin-top: 1rem;
        }
        .assignment-card {
          background: #f0f9ff;
          padding: 1rem;
          border-radius: 6px;
          border-left: 4px solid #2196F3;
        }
        .assignment-card h3 {
          margin: 0 0 0.5rem 0;
          color: #333;
        }
        .assignment-card p {
          margin: 0.3rem 0;
          color: #666;
          font-size: 0.9rem;
        }
        .assignment-card .btn-deassign {
          margin-top: 1rem;
          width: 100%;
          display: block;
          text-align: center;
        }
        .muted {
          color: #6b7280;
        }
      `}</style>
    </div>
  );
}
