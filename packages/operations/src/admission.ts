import { createHash } from 'node:crypto';
import type { Principal } from '@ae/contracts';
import { PolicyError } from '@ae/policy';
import type { SqlConnection } from './migrations.js';
export interface AdmissionPolicy {maxStarts:number;windowSeconds:number}
export const DEFAULT_ADMISSION_POLICY:AdmissionPolicy={maxStarts:60,windowSeconds:60};
export class AdmissionLimitError extends PolicyError {
  constructor(readonly retryAfterSeconds:number){super('ADMISSION_RATE_LIMITED');}
}
export function checkedAdmissionPolicy(value:AdmissionPolicy=DEFAULT_ADMISSION_POLICY):AdmissionPolicy{
  if(!Number.isInteger(value.maxStarts)||value.maxStarts<1||value.maxStarts>1000||!Number.isInteger(value.windowSeconds)||value.windowSeconds<1||value.windowSeconds>3600)throw new PolicyError('INVALID_ADMISSION_POLICY');
  return {...value};
}
/** Call only for a new authorized intent, inside the same transaction as its reservation. */
export async function admitNewIntent(connection:SqlConnection,principal:Principal,policy:AdmissionPolicy=DEFAULT_ADMISSION_POLICY):Promise<void>{
  const checked=checkedAdmissionPolicy(policy),scope=createHash('sha256').update(JSON.stringify([principal.tenantId,principal.applicationId,principal.subjectId])).digest('hex');
  // Existing DBOS direct workflows do not pass through a DBOS queue. This is admission, not another scheduler.
  const admitted=await connection.query(`INSERT INTO ae_api.admission_windows(scope_hash,window_started_at,admissions)
    VALUES($1,date_bin(make_interval(secs=>$2::integer),clock_timestamp(),'1970-01-01'::timestamptz),1)
    ON CONFLICT(scope_hash) DO UPDATE SET
      window_started_at=GREATEST(ae_api.admission_windows.window_started_at,EXCLUDED.window_started_at),
      admissions=CASE WHEN ae_api.admission_windows.window_started_at<EXCLUDED.window_started_at THEN 1 ELSE ae_api.admission_windows.admissions+1 END
    WHERE ae_api.admission_windows.window_started_at<EXCLUDED.window_started_at OR ae_api.admission_windows.admissions<$3
    RETURNING admissions`,[scope,checked.windowSeconds,checked.maxStarts]);
  if(!admitted.rows.length){
    const row=(await connection.query('SELECT CEIL(EXTRACT(EPOCH FROM window_started_at+make_interval(secs=>$2::integer)-clock_timestamp()))::integer AS seconds FROM ae_api.admission_windows WHERE scope_hash=$1',[scope,checked.windowSeconds])).rows[0];
    throw new AdmissionLimitError(Math.max(1,Math.min(checked.windowSeconds,Number(row?.seconds)||1)));
  }
  // One bounded maintenance batch; skip other transactions' locked rows. No background loop or quota reset daemon.
  await connection.query(`DELETE FROM ae_api.admission_windows WHERE scope_hash IN
    (SELECT scope_hash FROM ae_api.admission_windows WHERE window_started_at<clock_timestamp()-interval '2 hours' ORDER BY window_started_at,scope_hash LIMIT 100 FOR UPDATE SKIP LOCKED)`);
}
