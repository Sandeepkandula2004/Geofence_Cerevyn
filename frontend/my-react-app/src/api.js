import axios from "axios";

export const BASE_URL = "http://localhost:8000";

const api = axios.create({
  baseURL: BASE_URL,
});

// Geofence operations
export const listGeofences = async () => {
  const response = await api.get("/admin/geofences");
  return response.data;
};

export const createGeofence = async (data) => {
  const response = await api.post("/geofence/create", data);
  return response.data;
};

export const deleteGeofence = async (geofenceId) => {
  const response = await api.delete(`/geofence/${geofenceId}`);
  return response.data;
};

export const assignGeofence = async (data) => {
  const response = await api.post("/admin/assign-geofence", data);
  return response.data;
};

export const deleteAssignment = async (assignmentId) => {
  const response = await api.delete(`/admin/assignment/${assignmentId}`);
  return response.data;
};

export default api;
