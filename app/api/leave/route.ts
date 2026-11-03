import {NextResponse} from 'next/server';
import {db} from '@/lib/db';
import {guard} from '@/lib/api';
import {audit} from '@/lib/audit';
import {countWorkingDays, istDayBounds} from '@/lib/workcalendar';
import {fmtDays, leaveBalance} from '@/lib/leave';

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
  const pending=await db.leaveRequest.aggregate({where:{userId:targetId,status:'PENDING'},_sum:{days:true}});
  const bal=leaveBalance(target,pending._sum.days??0);
  if(bal.canBook<days)return NextResponse.json({error:`Not enough leave. ${fmtDays(bal.left)} of ${fmtDays(bal.total)} day(s) left${bal.pending?`, ${fmtDays(bal.pending)} already waiting for approval`:''}. This request needs ${fmtDays(days)}.`},{status:409});

  const clash=await db.leaveRequest.findFirst({where:{userId:targetId,status:{not:'REJECTED'},startDate:{lte:to},endDate:{gte:from}}});
  if(clash)return NextResponse.json({error:'You already have a leave request covering those dates.'},{status:409});

  const r=await db.leaveRequest.create({data:{userId:targetId,days,startDate:from,endDate:to,reason:String(b.reason||'').slice(0,500)}});

  const fmt=(d:Date)=>d.toLocaleDateString('en-IN',{day:'numeric',month:'short',timeZone:'Asia/Kolkata'});
  const approvers=await db.user.findMany({where:{active:true,role:{in:['MD','HR']}}});
  for(const a of approvers){
    if(a.id===u.id)continue;
    await db.notification.create({data:{userId:a.id,title:`Leave request: ${target.name}`,body:`${target.name} applied for ${fmtDays(days)} day(s), ${fmt(from)}${days>1?` to ${fmt(new Date(to.getTime()-1))}`:''}. Reason: ${r.reason||'—'}. Balance: ${fmtDays(bal.left)} of ${fmtDays(bal.total)} left (${fmtDays(bal.left-days)} if approved). Approve or reject on Attendance & Leave.`}});
  }

  await audit(u.id,'CREATE','LeaveRequest',r.id,{targetId,days,from:from.toISOString(),to:to.toISOString()});
  return NextResponse.json(r);
}
