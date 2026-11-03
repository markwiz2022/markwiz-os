import {NextResponse} from 'next/server';
import {db} from '@/lib/db';
import {guard} from '@/lib/api';
import {audit} from '@/lib/audit';

/** MD/HR: set a person's yearly leave quota and days taken (for example, reset taken to 0 at the start of the year). */
export async function PATCH(req:Request){
  const g=await guard('people');if(g.error)return g.error;const u=g.user!;
  if(u.role!=='MD'&&u.role!=='HR')return NextResponse.json({error:'Only the MD or HR can change leave balances'},{status:403});
  const b=await req.json().catch(()=>({}));
  const quota=Number(b.leaveQuota),taken=Number(b.leavesTaken);
  if(!b.userId||!Number.isFinite(quota)||!Number.isFinite(taken)||quota<0||taken<0||quota>365||taken>365)return NextResponse.json({error:'Enter leave days between 0 and 365.'},{status:400});
  const before=await db.user.findUnique({where:{id:String(b.userId)},select:{leaveQuota:true,leavesTaken:true}});
  if(!before)return NextResponse.json({error:'Person not found'},{status:404});
  await db.user.update({where:{id:String(b.userId)},data:{leaveQuota:quota,leavesTaken:taken}});
  await audit(u.id,'UPDATE','LeaveBalance',String(b.userId),{before,after:{leaveQuota:quota,leavesTaken:taken}});
  return NextResponse.json({ok:true});
}
