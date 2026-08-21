import axios from "axios";

const api = axios.create({
  baseURL: process.env.REACT_APP_API_URL || "http://localhost:3004/api",
});

// Attach the admin JWT (if present) to every request
api.interceptors.request.use((config) => {
  const admin = JSON.parse(localStorage.getItem("adminInfo"));
  if (admin?.token) {
    config.headers.Authorization = `Bearer ${admin.token}`;
  }
  return config;
});
export const downloadFile = async (url, params, fallbackFilename) => {
  const response = await api.get(url, { params, responseType: "blob" });

  const disposition = response.headers["content-disposition"] || "";
  const match = disposition.match(/filename="?([^"]+)"?/);
  const filename = match ? match[1] : fallbackFilename;

  const blobUrl = window.URL.createObjectURL(new Blob([response.data]));
  const link = document.createElement("a");
  link.href = blobUrl;
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(blobUrl);
};

export default api;
