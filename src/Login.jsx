import { useState } from "react";

const USERS = [
  { email: "daniel@swplaces.com", password: "daniel2026", role: "admin", name: "Daniel Silva" },
  { email: "gustavo@swplaces.com", password: "guga2026", role: "consultant", name: "Gustavo Miguel" },
];

export default function Login({ onLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setTimeout(() => {
      const user = USERS.find(u => u.email === email && u.password === password);
      if (user) {
        onLogin(user);
      } else {
        setError("Email ou password incorretos.");
      }
      setLoading(false);
    }, 600);
  };

  return (
    <div style={{
      minHeight: "100vh", background: "#F8F7F4",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: "'Inter', -apple-system, sans-serif", padding: 16,
    }}>
      <div style={{ width: "100%", maxWidth: 380 }}>
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <div style={{
            width: 52, height: 52, background: "#C9A96E", borderRadius: 14,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 22, fontWeight: 700, color: "white", margin: "0 auto 16px",
          }}>S</div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "#111", margin: 0, letterSpacing: "-0.5px" }}>SW Places</h1>
          <p style={{ fontSize: 14, color: "#888", margin: "6px 0 0" }}>Costa Vicentina</p>
        </div>

        {/* Card */}
        <div style={{ background: "white", borderRadius: 20, border: "1px solid #EBEBEB", padding: "32px 28px", boxShadow: "0 4px 24px rgba(0,0,0,0.06)" }}>
          <h2 style={{ fontSize: 17, fontWeight: 600, color: "#111", margin: "0 0 24px" }}>Entrar na conta</h2>

          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <label style={{ fontSize: 11, color: "#888", textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 600, display: "block", marginBottom: 6 }}>
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="email@swplaces.com"
                required
                style={{
                  width: "100%", border: "1px solid #E5E5E5", borderRadius: 10,
                  padding: "11px 14px", fontSize: 14, outline: "none", color: "#111",
                  boxSizing: "border-box", fontFamily: "inherit", transition: "border 0.15s",
                }}
                onFocus={e => e.target.style.borderColor = "#C9A96E"}
                onBlur={e => e.target.style.borderColor = "#E5E5E5"}
              />
            </div>

            <div>
              <label style={{ fontSize: 11, color: "#888", textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 600, display: "block", marginBottom: 6 }}>
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                style={{
                  width: "100%", border: "1px solid #E5E5E5", borderRadius: 10,
                  padding: "11px 14px", fontSize: 14, outline: "none", color: "#111",
                  boxSizing: "border-box", fontFamily: "inherit", transition: "border 0.15s",
                }}
                onFocus={e => e.target.style.borderColor = "#C9A96E"}
                onBlur={e => e.target.style.borderColor = "#E5E5E5"}
              />
            </div>

            {error && (
              <div style={{ background: "#FFF1F2", border: "1px solid #FECDD3", borderRadius: 10, padding: "10px 14px", fontSize: 13, color: "#BE123C" }}>
                {error}
              </div>
            )}

            <button type="submit" disabled={loading} style={{
              background: loading ? "#E5E5E5" : "#111", color: loading ? "#999" : "white",
              border: "none", borderRadius: 12, padding: "13px", fontSize: 14,
              fontWeight: 600, cursor: loading ? "not-allowed" : "pointer",
              marginTop: 4, transition: "all 0.15s",
            }}>
              {loading ? "A entrar..." : "Entrar"}
            </button>
          </form>
        </div>

        <p style={{ textAlign: "center", fontSize: 12, color: "#CCC", marginTop: 24 }}>
          SW Places © 2026
        </p>
      </div>
    </div>
  );
}
