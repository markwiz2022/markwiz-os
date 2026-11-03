import {NextResponse} from 'next/server';
import {db} from '@/lib/db';
import {guard} from '@/lib/api';
import {audit} from '@/lib/audit';
import {fmtDays} from '@/lib/leave';

const approver=(role:string)=>role==='MD'||role==='HR';

export async function PATCH(req:Request,{params}:{params:Promise<{id:string}>}){
  const g=await guard('people');if(g.error)return g.error;const u=g.user!;
  if(!approver(u.role))return NextResponse.json({error:'Forbidden'},{status:403});
  const {id}=await params;const b=await req.json();
  const r=await db.leaveRequest.findUnique({where:{id}});
  if(!r)return NextResponse.json({error:'Request not found'},{status:404});
  if(r.status!=='PENDING')return NextResponse.json({error:'Already resolved'},{status:409});
  if(b.status!=='APPROVED'&&b.status!=='REJECTED')return NextResponse.json({error:'Invalid status'},{status:400});
  const out=await db.$transaction(async(tx)=>{
    const claimed=await tx.leaveRequest.updateMany({where:{id,status:'PENDING'},data:{status:b.status,resolvedAt:new Date()}});
    if(claimed.count!==1)return null;
    if(b.status==='APPROVED')await tx.user.update({where:{id:r.userId},data:{leavesTaken:{increment:r.days}}});
    return tx.leaveRequest.findUnique({where:{id}});
  });
  if(!out)return NextResponse.json({error:'Already resolved'},{status:409});
  const who=await db.user.findUnique({where:{id:r.userId},select:{leaveQuota:true,leavesTaken:true}});
  await db.notification.create({data:{userId:r.userId,title:`Leave ${b.status.toLowerCase()}`,body:`Your ${fmtDays(r.days)} day leave request has been ${b.status.toLowerCase()}.${who?` You have ${fmtDays(Math.max(0,who.leaveQuota-who.leavesTaken))} of ${fmtDays(who.leaveQuota)} day(s) left.`:''}`}});
  await audit(u.id,b.status,'LeaveRequest',id);
  return NextResponse.json(out);
}

/** Cancel a request. Staff can withdraw their own pending requests. The MD or HR can also cancel approved leave, which returns the days. */
export async function DELETE(_req:Request,{params}:{params:Promise<{id:string}>}){
  const g=await guard('people');if(g.error)return g.error;const u=g.user!;
  const {id}=await params;
  const r=await db.leaveRequest.findUnique({where:{id},include:{user:{select:{name:true}}}});
  if(!r)return NextResponse.json({error:'Request not found'},{status:404});
  const own=r.userId===u.id;
  if(!(own&&r.status==='PENDING')&&!(approver(u.role)&&r.status!=='REJECTED'))return NextResponse.json({error:own?'Only pending requests can be withdrawn. Ask the MD to cancel approved leave.':'Forbidden'},{status:403});
  await db.$transaction(async(tx)=>{
    await tx.leaveRequest.delete({where:{id}});
    if(r.status==='APPROVED')await tx.user.update({where:{id:r.userId},data:{leavesTaken:{decrement:r.days}}});
  });
  if(!own)await db.notification.create({data:{userId:r.userId,title:'Leave cancelled',body:`Your ${fmtDays(r.days)} day leave was cancelled by ${u.name}.${r.status==='APPROVED'?' The days are back in your balance.':''}`}});
  else{const approvers=await db.user.findMany({where:{active:true,role:{in:['MD','HR']}},select:{id:true}});for(const a of approvers)if(a.id!==u.id)await db.notification.create({data:{userId:a.id,title:`Leave withdrawn: ${r.user.name}`,body:`${r.user.name} withdrew a ${fmtDays(r.days)} day leave request.`}})}
  await audit(u.id,'DELETE','LeaveRequest',id,{status:r.status,days:r.days,userId:r.userId});
  return NextResponse.json({ok:true});
}
