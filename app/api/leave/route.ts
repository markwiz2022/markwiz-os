import {NextResponse} from 'next/server';
import {db} from '@/lib/db';
import {guard} from '@/lib/api';
import {audit} from '@/lib/audit';
import {countWorkingDays, istDayBounds} from '@/lib/workcalendar';

export async function GET(){
  const g=await guard('people');if(g.error)return g.error;const u=g.user!;
  const rows=await db.leaveRequest.findMany({where:u.role==='MD'||u.role==='HR'?{}:{userId:u.id},include:{user:{select:{name:true,role:true}}},orderBy:{createdAt:'desc'}});
  return NextResponse.json(rows);
}

export async function POST(req:Request){
  const g=await guard('people');if(g.error)return g.error;const u=g.user!;
  const b=await req.json();
  if(!b.startDate||!b.endDate)return NextResponse.json({error:'Start and end dates are required.'},{status:400});

  const from=istDayBounds(new Date(`${String(b.startDate).slice(0,10)}T12:00:00+05:30`)).start;
  const to=istDayBounds(new Date(`${String(b.endDate).slice(0,10)}T12:00:00+05:30`)).end;
  if(isNaN(from.getTime())||isNaN(to.getTime()))return NextResponse.json({error:'Invalid dates.'},{status:400});
  if(to<from)return NextResponse.json({error:'End date cannot be before the start date.'},{status:400});

  // Half days are allowed only on a single-day request.
  const halfDay=Boolean(b.halfDay)&&from.toDateString()===new Date(to.getTime()-1).toDateString();
  const workingDays=countWorkingDays(from,to);
  if(workingDays===0)return NextResponse.json({error:'Those dates are all weekly offs. Pick working days.'},{status:400});
  const days=halfDay?0.5:workingDays;

  const targetId=u.role==='MD'&&b.userId?b.userId:u.id;
  const target=await db.user.findUnique({where:{id:targetId}});
  if(!target)return NextResponse.json({error:'User not found'},{status:404});
  if(target.leaveQuota-target.leavesTaken<days)return NextResponse.json({error:`Insufficient leave balance. ${(target.leaveQuota-target.leavesTaken).toFixed(2)} day(s) left, ${days} requested.`},{status:409});

  const clash=await db.leaveRequest.findFirst({where:{userId:targetId,status:{not:'REJECTED'},startDate:{lte:to},endDate:{gte:from}}});
  if(clash)return NextResponse.json({error:'You already have a leave request covering those dates.'},{status:409});

  const r=await db.leaveRequest.create({data:{userId:targetId,days,startDate:from,endDate:to,reason:b.reason||''}});

  const approvers=await db.user.findMany({where:{active:true,role:{in:['MD','HR']}}});
  for(const a of approvers){
    if(a.id===u.id)continue;
    await db.notification.create({data:{userId:a.id,title:'Leave request',body:`${target.name} requested ${days} day(s) leave from ${from.toLocaleDateString('en-IN')} to ${to.toLocaleDateString('en-IN')}.`}});
  }

  await audit(u.id,'CREATE','LeaveRequest',r.id,{targetId,days,from:from.toISOString(),to:to.toISOString()});
  return NextResponse.json(r);
}
