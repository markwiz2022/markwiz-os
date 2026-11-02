import {NextResponse} from 'next/server';import {db} from '@/lib/db';import {guard} from '@/lib/api';import {audit} from '@/lib/audit';import {canCreateClients} from '@/lib/settings';
export async function GET(){
  const g=await guard('clients');
  if(g.error)return g.error;
  const u=g.user!;

  const clients=await db.client.findMany({
    where:{internal:false},
    include:{projects:true,tasks:true,invoices:true,meetings:true},
    orderBy:{name:'asc'}
  });

  if(u.role==='MD')return NextResponse.json(clients);

  const safeClients=clients.map(({retainer,email,phone,website,invoices,...client})=>client);

  return NextResponse.json(safeClients);
}
export async function POST(req:Request){const g=await guard('clients');if(g.error)return g.error;const u=g.user!;if(!await canCreateClients(u))return NextResponse.json({error:'You don’t have permission to add clients. Ask the MD.'},{status:403});const b=await req.json().catch(()=>({}));if(!b.name)return NextResponse.json({error:'Name required'},{status:400});if(u.role!=='MD' && (b.email||b.phone||b.website||b.retainer))return NextResponse.json({error:'Only Joseph/MD can set commercial or contact fields.'},{status:403});const c=await db.client.create({data:{name:b.name,company:b.company||null,email:b.email||null,phone:b.phone||null,website:b.website||null,retainer:Number(b.retainer||0),industry:b.industry||null,accountManager:b.accountManager||null,renewalDate:b.renewalDate?new Date(b.renewalDate):null,notes:b.notes||null}});await audit(u.id,'CREATE','Client',c.id,{name:c.name});return NextResponse.json(c)}
export async function PATCH(req:Request){const g=await guard('clients');if(g.error)return g.error;const u=g.user!;const b=await req.json().catch(()=>({}));if(!b.id)return NextResponse.json({error:'ID required'},{status:400});const data:any={};for(const k of ['name','company','industry','accountManager','notes','health'])if(b[k]!==undefined)data[k]=b[k];if(u.role==='MD'){for(const k of ['email','phone','website'])if(b[k]!==undefined)data[k]=b[k];if(b.retainer!==undefined)data.retainer=Number(b.retainer);}if(b.healthScore!==undefined)data.healthScore=Number(b.healthScore);if(b.startDate!==undefined)data.startDate=b.startDate?new Date(b.startDate):null;if(b.renewalDate!==undefined)data.renewalDate=b.renewalDate?new Date(b.renewalDate):null;if(b.active!==undefined){if(u.role!=='MD')return NextResponse.json({error:'Only the MD can archive or restore clients.'},{status:403});data.active=Boolean(b.active);}const c=await db.client.update({where:{id:b.id},data});await audit(u.id,'UPDATE','Client',c.id,data);return NextResponse.json(c)}

/**
 * Permanently delete a client. MD only, and the exact client name must be sent as `confirm`.
 * Tasks, invoices, projects, scope, content and meetings go with it (database cascade).
 * Expenses are kept as company costs with the client's name in the note, so past months don't change.
 * A full snapshot is written to the audit trail.
 */
export async function DELETE(req:Request){
  const g=await guard('clients');if(g.error)return g.error;const u=g.user!;
  if(u.role!=='MD')return NextResponse.json({error:'Only the MD can delete clients.'},{status:403});
  const p=new URL(req.url).searchParams;const id=p.get('id')||'';
  const c=await db.client.findUnique({where:{id},include:{_count:{select:{tasks:true,invoices:true,projects:true,scopeItems:true,contentPosts:true,meetings:true,expenses:true}}}});
  if(!c)return NextResponse.json({error:'Client not found'},{status:404});
  if(c.internal)return NextResponse.json({error:'The internal Markwiz client can’t be deleted.'},{status:400});
  if((p.get('confirm')||'').trim()!==c.name.trim())return NextResponse.json({error:'Type the client’s name exactly to confirm.'},{status:400});
  const invoices=await db.invoice.findMany({where:{clientId:id},select:{number:true,amount:true,paid:true,dueDate:true}});
  await db.$transaction(async(tx)=>{
    await tx.timeEntry.deleteMany({where:{task:{clientId:id}}});
    const exps=await tx.expense.findMany({where:{clientId:id},select:{id:true,note:true}});
    for(const e of exps)await tx.expense.update({where:{id:e.id},data:{clientId:null,note:`${e.note?e.note+' · ':''}(was client: ${c.name})`.slice(0,500)}});
    await tx.client.delete({where:{id}});
  },{timeout:60000});
  const {_count,...client}=c;
  await audit(u.id,'DELETE','Client',id,{deleted:client,removed:_count,invoices});
  return NextResponse.json({ok:true});
}
