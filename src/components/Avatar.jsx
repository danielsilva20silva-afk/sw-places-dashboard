export default function Avatar({ name, size = 36 }) {
  const palette = ["#C9A96E", "#4F7CAC", "#8B5CF6", "#E67E5A", "#2D9E6B", "#E91E8C"];
  const color = palette[name.charCodeAt(0) % palette.length];
  return (
    <div style={{
      width: size, height: size, borderRadius: Math.round(size * 0.3),
      background: color + "18", color, fontWeight: 700,
      fontSize: Math.round(size * 0.38), display: "flex",
      alignItems: "center", justifyContent: "center", flexShrink: 0,
      border: `1.5px solid ${color}30`,
    }}>{name.charAt(0)}</div>
  );
}
