import {NextResponse} from 'next/server';
import {requireUser} from './auth';

export async function guard(permission:string){
  try{return {user:await requireUser(permission),error:null as null}}
  catch(e:any){const status=e?.message==='UNAUTHENTICATED'?401:403;return {user:null,error:NextResponse.json({error:e?.message||'Forbidden'},{status})}}
}

/** Turns workflow errors into a JSON message the person can act on. */
export function errorResponse(e: unknown) {
  const err = e as { status?: number; message?: string; name?: string };
  if (err && typeof err.status === 'number' && err.message) return NextResponse.json({ error: err.message }, { status: err.status });
  console.error(e);
  return NextResponse.json({ error: 'Something went wrong. Try again, and tell Gopi if it keeps happening.' }, { status: 500 });
}

export function isLead(role: string) { return role === 'MD' || role === 'DMM'; }
