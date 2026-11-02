'use client';
import {useState} from 'react';
import {useRouter} from 'next/navigation';

type ClientEditProps = {
  client: {
    id: string;
    name: string;
    company: string | null;
    industry: string | null;
    accountManager: string | null;
    notes: string | null;
    email: string | null;
    phone: string | null;
    website: string | null;
    retainer: number;
    renewalDate: string | null;
  };
  isMD?: boolean;
};

export default function ClientEdit({client, isMD = false}: ClientEditProps) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const r = useRouter();

  const blank = () => ({
    name: client.name,
    company: client.company || '',
    industry: client.industry || '',
    accountManager: client.accountManager || '',
    notes: client.notes || '',
    email: client.email || '',
    phone: client.phone || '',
    website: client.website || '',
    retainer: String(client.retainer ?? 0),
    renewalDate: client.renewalDate ? client.renewalDate.slice(0, 10) : '',
  });

  const [f, setF] = useState(blank);

  function set(key: keyof ReturnType<typeof blank>, value: string) {
    setF((prev) => ({ ...prev, [key]: value }));
  }

  function cancel() {
    setF(blank());
    setError('');
    setOpen(false);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSaving(true);

    const body: Record<string, unknown> = {
      id: client.id,
      name: f.name.trim(),
      company: f.company,
      industry: f.industry,
      accountManager: f.accountManager,
      notes: f.notes,
      renewalDate: f.renewalDate || null,
    };

    if (isMD) {
      body.email = f.email;
      body.phone = f.phone;
      body.website = f.website;
      body.retainer = Number(f.retainer || 0);
    }

    try {
      const x = await fetch('/api/clients', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!x.ok) {
        const data = await x.json().catch(() => ({}));
        setError(data.error || 'Unable to save changes');
        return;
      }
      setOpen(false);
      r.refresh();
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button type="button" className="btn secondary small" onClick={() => setOpen(true)}>
        Edit client
      </button>
    );
  }

  return (
    <form className="card form" onSubmit={save} style={{ marginTop: 14 }}>
      <div className="section-head">
        <div>
          <h3>Edit client</h3>
          <p className="muted">Changes are saved to the client record and logged in the audit trail.</p>
        </div>
      </div>

      <div className="form-grid">
        <input value={f.name} onChange={(e) => set('name', e.target.value)} placeholder="Client name" required />
        <input value={f.company} onChange={(e) => set('company', e.target.value)} placeholder="Company / legal name" />
        <input value={f.industry} onChange={(e) => set('industry', e.target.value)} placeholder="Industry" />
        <input value={f.accountManager} onChange={(e) => set('accountManager', e.target.value)} placeholder="Account manager" />
        <input value={f.renewalDate} onChange={(e) => set('renewalDate', e.target.value)} type="date" />

        {isMD && <input value={f.retainer} onChange={(e) => set('retainer', e.target.value)} placeholder="Monthly retainer" type="number" min="0" />}
        {isMD && <input value={f.email} onChange={(e) => set('email', e.target.value)} placeholder="Primary email" type="email" />}
        {isMD && <input value={f.phone} onChange={(e) => set('phone', e.target.value)} placeholder="Phone" />}
        {isMD && <input value={f.website} onChange={(e) => set('website', e.target.value)} placeholder="Website" />}

        <textarea value={f.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Account notes" rows={3} style={{ gridColumn: '1 / -1' }} />
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button className="btn" type="submit" disabled={saving}>
          {saving ? 'Saving…' : 'Save changes'}
        </button>
        <button className="btn secondary" type="button" onClick={cancel} disabled={saving}>
          Cancel
        </button>
      </div>

      {error && <p className="error">{error}</p>}
    </form>
  );
}
