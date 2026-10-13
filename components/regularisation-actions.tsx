'use client';
import { useRouter } from 'next/navigation';

export default function RegularisationActions({ id }: { id: string }) {
  const r = useRouter();
  async function act(status: 'APPROVED' | 'REJECTED') {
    const message = status === 'APPROVED' ? 'Approve this regularisation?' : 'Reject this regularisation and apply a 0.5 day salary deduction?';
    if (!confirm(message)) return;
    const x = await fetch(`/api/attendance/regularisation/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status })
    });
    if (!x.ok) alert((await x.json()).error || 'Unable to resolve request');
    else r.refresh();
  }
  return <div className="actions"><button className="btn small" onClick={() => act('APPROVED')}>Approve</button><button className="btn danger small" onClick={() => act('REJECTED')}>Reject · 0.5 day salary</button></div>;
}
