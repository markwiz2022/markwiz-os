import {NextResponse} from 'next/server';
import {guard} from '@/lib/api';
import {audit} from '@/lib/audit';
import {getOffice,setOffice} from '@/lib/office';
import {DEFAULT_OFFICE} from '@/lib/geo';

/** MD: set the office used for clock-in. { name, lat, lng, radiusM } or { reset: true }. */
export async function POST(req:Request){
  const g=await guard('people');if(g.error)return g.error;const u=g.user!;
  if(u.role!=='MD')return NextResponse.json({error:'Only the MD can change the office location'},{status:403});
  const b=await req.json().catch(()=>({}));
  const before=await getOffice();
  const next=b.reset?DEFAULT_OFFICE:{name:String(b.name||before.name).slice(0,80),lat:Number(b.lat),lng:Number(b.lng),radiusM:Math.round(Number(b.radiusM))};
  if(!Number.isFinite(next.lat)||!Number.isFinite(next.lng)||Math.abs(next.lat)>90||Math.abs(next.lng)>180)return NextResponse.json({error:'Invalid location'},{status:400});
  if(!Number.isFinite(next.radiusM)||next.radiusM<50||next.radiusM>2000)return NextResponse.json({error:'Radius must be between 50 and 2000 metres'},{status:400});
  await setOffice(next);
  await audit(u.id,'UPDATE','Setting','office.location',{before,after:next});
  return NextResponse.json(next);
}
