import { cookies } from 'next/headers';
import { jwtVerify, SignJWT } from 'jose';
import bcrypt from 'bcryptjs';
import { db } from './db';
import { redirect } from 'next/navigation';

if (process.env.NODE_ENV === 'production' && (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32 || process.env.JWT_SECRET.startsWith('replace-with'))) {
  throw new Error('JWT_SECRET must be set to a random string of at least 32 characters in production.');
}
const secret = new TextEncoder().encode(process.env.JWT_SECRET || 'dev-only-change-me');

export async function hashPassword(p:string){return bcrypt.hash(p,12)}
export async function verifyPassword(p:string,h:string){return bcrypt.compare(p,h)}
export async function setSession(userId:string){
  const token=await new SignJWT({sub:userId}).setProtectedHeader({alg:'HS256'}).setIssuedAt().setExpirationTime('7d').sign(secret);
  (await cookies()).set('mw_session',token,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',path:'/',maxAge:604800})
}
export async function clearSession(){(await cookies()).delete('mw_session')}
export async function currentUser(){
  const token=(await cookies()).get('mw_session')?.value;
  if(!token)return null;
  try{const {payload}=await jwtVerify(token,secret);if(!payload.sub)return null;return db.user.findUnique({where:{id:String(payload.sub)}})}catch{return null}
}
export function can(role:string, permission:string){const map:Record<string,string[]> = {
  MD: ['*'],
  DMM: ['clients','projects','tasks','people'],
  SALES: ['clients','crm','tasks','people'],
  FINANCE: ['clients','finance','people'],
  HR: ['clients','people'],
  DESIGNER: ['clients','tasks','people'],
  DEVELOPER: ['clients','tasks','people'],
  SEO: ['clients','tasks','people'],
  PERFORMANCE: ['clients','tasks','people'],
  MEMBER: ['clients','tasks','people']
};
  return map[role]?.includes('*')||map[role]?.includes(permission)
}
export async function requireUser(permission?:string){
  const u=await currentUser();
  if(!u)throw new Error('UNAUTHENTICATED');
  if(!u.active)throw new Error('FORBIDDEN');
  if(permission && permission!=='*' && !can(u.role,permission))throw new Error('FORBIDDEN');
  return u;
}

// For pages: send logged-out users to /login and unauthorised users to their home screen
// instead of showing a server error.
export async function requirePageUser(permission?:string){
  const u=await currentUser();
  if(!u||!u.active)redirect('/login');
  if(permission && permission!=='*' && !can(u.role,permission))redirect('/today');
  return u;
}
