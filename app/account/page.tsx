import { requirePageUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { ChangePassword, ResetPassword } from '@/components/password-form';

export default async function Account() {
  const u = await requirePageUser();
  const users = u.role === 'MD'
    ? await db.user.findMany({ where: { active: true }, orderBy: { name: 'asc' }, select: { id: true, name: true, role: true } })
    : [];

  return <div className="page">
    <div className="header"><div>
      <div className="eyebrow">MY ACCOUNT</div>
      <h1>Account & Security</h1>
      <p className="muted">Your sign-in details. Signed in as {u.name} · {u.role} · {u.email}</p>
    </div></div>
    <ChangePassword />
    {u.role === 'MD' && <ResetPassword users={users} />}
  </div>;
}
