import {db} from './db';

export async function audit(userId:string|undefined, action:string, entity:string, entityId?:string, metadata?:unknown){
  await db.auditLog.create({data:{userId,action,entity,entityId,metadata:metadata === undefined ? undefined : JSON.parse(JSON.stringify(metadata))}})
}
