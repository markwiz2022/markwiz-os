export default function Loading() {
  return (
    <div className="page" style={{ opacity: 0.7, transition: 'opacity 0.15s ease' }}>
      <div className="header">
        <div>
          <div style={{ width: 120, height: 14, background: 'rgba(255,255,255,0.08)', borderRadius: 4, marginBottom: 8 }} />
          <div style={{ width: 220, height: 32, background: 'rgba(255,255,255,0.12)', borderRadius: 6, marginBottom: 8 }} />
          <div style={{ width: 340, height: 16, background: 'rgba(255,255,255,0.06)', borderRadius: 4 }} />
        </div>
      </div>
      <div className="grid" style={{ marginTop: 24, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="card" style={{ height: 100, background: 'rgba(255,255,255,0.04)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)' }} />
        ))}
      </div>
      <div className="card" style={{ marginTop: 24, height: 260, background: 'rgba(255,255,255,0.04)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)' }} />
    </div>
  );
}
