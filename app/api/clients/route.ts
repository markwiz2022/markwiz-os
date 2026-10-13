import {NextResponse} from 'next/server';import {db} from '@/lib/db';import {guard} from '@/lib/api';import {audit} from '@/lib/audit';
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
export async function POST(req:Request){const g=await guard('clients');if(g.error)return g.error;const u=g.user!;const b=await req.json();if(!b.name)return NextResponse.json({error:'Name required'},{status:400});if(u.role!=='MD' && (b.email||b.phone||b.website||b.retainer))return NextResponse.json({error:'Only Joseph/MD can set commercial or contact fields.'},{status:403});const c=await db.client.create({data:{name:b.name,company:b.company||null,email:b.email||null,phone:b.phone||null,website:b.website||null,retainer:Number(b.retainer||0),industry:b.industry||null,accountManager:b.accountManager||null,renewalDate:b.renewalDate?new Date(b.renewalDate):null,notes:b.notes||null}});await audit(u.id,'CREATE','Client',c.id,{name:c.name});return NextResponse.json(c)}
export async function PATCH(req:Request){const g=await guard('clients');if(g.error)return g.error;const u=g.user!;const b=await req.json();if(!b.id)return NextResponse.json({error:'ID required'},{status:400});const data:any={};for(const k of ['name','company','industry','accountManager','notes','health'])if(b[k]!==undefined)data[k]=b[k];if(u.role==='MD'){for(const k of ['email','phone','website'])if(b[k]!==undefined)data[k]=b[k];if(b.retainer!==undefined)data.retainer=Number(b.retainer);}if(b.healthScore!==undefined)data.healthScore=Number(b.healthScore);if(b.startDate!==undefined)data.startDate=b.startDate?new Date(b.startDate):null;if(b.renewalDate!==undefined)data.renewalDate=b.renewalDate?new Date(b.renewalDate):null;if(b.active!==undefined)data.active=Boolean(b.active);const c=await db.client.update({where:{id:b.id},data});await audit(u.id,'UPDATE','Client',c.id,data);return NextResponse.json(c)}
