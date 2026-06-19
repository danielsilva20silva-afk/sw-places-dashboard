import { useState } from "react";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";

const SESSION_KEY = "sw_places_user";

export default function App() {
  // Restore a persisted session on mount (never expires until logout)
  const [user, setUser] = useState(() => {
    try {
      const saved = localStorage.getItem(SESSION_KEY);
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const handleLogout = () => {
    localStorage.removeItem(SESSION_KEY);
    setUser(null);
  };

  if (!user) return <Login onLogin={setUser} />;

  return <Dashboard user={user} onLogout={handleLogout} />;
}
