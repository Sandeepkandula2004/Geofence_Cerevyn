import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import axios from "axios";
import { MapContainer, TileLayer, Marker, Circle } from "react-leaflet";
import "leaflet/dist/leaflet.css";

const BASE_URL = "http://localhost:8000";

export default function UserTracking() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const employeeCode = localStorage.getItem("employeeCode");

  const [targets, setTargets] = useState([]);
  const [pos, setPos] = useState(null);
  const [distance, setDistance] = useState(0);
  const [status, setStatus] = useState("Tracking active...");
  const [isTracking, setIsTracking] = useState(true);

  // Validate sessionId on mount
  if (!sessionId || isNaN(parseInt(sessionId))) {
    console.error("Invalid session ID:", sessionId);
    return (
      <div style={{ padding: "2rem", textAlign: "center" }}>
        <h2>Error: Invalid Session</h2>
        <p>Please check in again to start tracking.</p>
        <button onClick={() => navigate("/user/")} style={{ marginTop: "1rem", padding: "0.5rem 1rem" }}>
          Go to Check In
        </button>
      </div>
    );
  }

  // Load targets on mount
  useEffect(() => {
    const loadTargets = async () => {
      if (!employeeCode) return;
      try {
        const res = await axios.get(`${BASE_URL}/employee/${employeeCode}/targets`);
        setTargets(res.data || []);
      } catch (e) {
        console.error("Failed to load targets");
      }
    };
    loadTargets();
  }, [employeeCode]);

  // Start tracking
  useEffect(() => {
    if (!isTracking || !sessionId) return;

    let watchId;
    let lastUpdateTime = 0;
    const UPDATE_INTERVAL_MS = 10000; // 10 seconds

    const startTracking = () => {
      if (!navigator.geolocation) {
        setStatus("Geolocation not available");
        return;
      }

      watchId = navigator.geolocation.watchPosition(
        async (position) => {
          const { latitude: lat, longitude: lng } = position.coords;
          setPos([lat, lng]);

          // Send location update every 10 seconds
          const now = Date.now();
          if (now - lastUpdateTime >= UPDATE_INTERVAL_MS) {
            lastUpdateTime = now;
            try {
              const parsedSessionId = parseInt(sessionId);
              if (isNaN(parsedSessionId)) {
                console.error("Invalid session ID:", sessionId);
                setStatus("Invalid session - please check in again");
                setIsTracking(false);
                return;
              }

              const payload = {
                session_id: parsedSessionId,
                lat,
                lng,
              };
              console.log("Sending location update:", payload);
              const response = await axios.post(`${BASE_URL}/tracking/update-location`, payload, {
                headers: {
                  'Content-Type': 'application/json',
                }
              });
              setStatus(`Tracking... (${response.data.polyline_logged ? "logged" : "checking"})`);
            } catch (e) {
              console.error("Location update failed:", e);
              console.error("Error response:", e.response?.data);
              setStatus("Location update failed");
            }
          }
        },
        (err) => {
          setStatus(`Location error: ${err.message}`);
        },
        { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }
      );
    };

    startTracking();

    return () => {
      if (watchId) navigator.geolocation.clearWatch(watchId);
    };
  }, [isTracking, sessionId]);

  const handleCheckout = async () => {
    setIsTracking(false);

    const parsedSessionId = parseInt(sessionId);
    if (isNaN(parsedSessionId)) {
      setStatus("Invalid session ID");
      return;
    }

    // Create dummy odometer for checkout (user would upload real one)
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    canvas.toBlob((blob) => {
      const formData = new FormData();
      formData.append("session_id", parsedSessionId.toString());
      formData.append("odometer", blob, "odometer_end.jpg");

      axios
        .post(`${BASE_URL}/session/checkout`, formData)
        .then((res) => {
          setStatus("Session ended successfully!");
          localStorage.removeItem("sessionId");
          setTimeout(() => navigate("/user/"), 2000);
        })
        .catch((e) => {
          setStatus("Checkout failed: " + e.message);
        });
    });
  };

  return (
    <div className="user-tracking">
      <div className="header">
        <h2>Live Tracking</h2>
        <button className="btn-checkout" onClick={handleCheckout} disabled={!isTracking}>
          {isTracking ? "Check Out" : "Session Ended"}
        </button>
      </div>

      <div className="status">
        <p>{status}</p>
      </div>

      {/* Today's Goals/Targets */}
      {targets.length > 0 && (
        <div className="targets-display">
          <h3>Today's Goals</h3>
          <div className="goals-grid">
            {targets.map((t) => (
              <div key={t.assignment_id} className="goal-card">
                <h4>{t.geofence_name}</h4>
                <p>Radius: {(t.radius_m / 1000).toFixed(2)} km</p>
                <p className="coords">[{t.center[0].toFixed(4)}, {t.center[1].toFixed(4)}]</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {pos ? (
        <MapContainer center={pos} zoom={16} style={{ height: "500px", borderRadius: "8px" }}>
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          <Marker position={pos} />
          {targets.map((t) => (
            <Circle
              key={t.assignment_id}
              center={[t.center[0], t.center[1]]}
              radius={t.radius_m}
              pathOptions={{ color: "green", fillColor: "green", fillOpacity: 0.15 }}
              popup={t.geofence_name}
            />
          ))}
        </MapContainer>
      ) : (
        <div style={{ padding: "2rem", textAlign: "center", color: "#666" }}>
          Waiting for location...
        </div>
      )}

      <style>{`
        .user-tracking {
          padding: 1rem;
          background: #f8fafc;
          min-height: 100vh;
        }

        .header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1rem;
        }

        .header h2 {
          margin: 0;
        }

        .btn-checkout {
          background: #ef4444;
          color: white;
          border: none;
          padding: 0.5rem 1rem;
          border-radius: 6px;
          cursor: pointer;
          font-weight: 600;
        }

        .btn-checkout:hover:not(:disabled) {
          background: #dc2626;
        }

        .btn-checkout:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .status {
          background: white;
          padding: 1rem;
          border-radius: 8px;
          margin-bottom: 1rem;
          text-align: center;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        }

        .status p {
          margin: 0;
          color: #0c4a6e;
          font-weight: 500;
        }

        .targets-display {
          background: white;
          padding: 1rem;
          border-radius: 8px;
          margin-bottom: 1rem;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        }

        .targets-display h3 {
          margin: 0 0 1rem 0;
          color: #1f2937;
          font-size: 1rem;
        }

        .goals-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
          gap: 0.75rem;
        }

        .goal-card {
          background: #f0fdf4;
          border-left: 4px solid #10b981;
          padding: 0.75rem;
          border-radius: 6px;
        }

        .goal-card h4 {
          margin: 0 0 0.3rem 0;
          color: #1f2937;
          font-size: 0.95rem;
        }

        .goal-card p {
          margin: 0.2rem 0;
          color: #666;
          font-size: 0.85rem;
        }

        .goal-card .coords {
          font-family: monospace;
          font-size: 0.8rem;
          color: #999;
        }
      `}</style>
    </div>
  );
}
