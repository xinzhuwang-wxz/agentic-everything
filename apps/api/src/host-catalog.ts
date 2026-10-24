import type { CapabilityVersion } from '@ae/contracts';
import { ticketCapabilities } from '@ae/capabilities';
import { digest } from '@ae/policy';

/** Configuration can offer only an explicitly implemented fixed host catalog. */
export function configurationHostCatalog(host:{listMembers?:unknown;currentCapabilities?:unknown},requested?:CapabilityVersion[]):CapabilityVersion[]{
  const legacy=ticketCapabilities.filter(c=>c.capabilityId==='read_ticket'||c.capabilityId==='change_ticket_priority');
  if(!requested)return structuredClone(legacy);
  if(new Set(requested.map(c=>c.capabilityId)).size!==requested.length)throw Error('Duplicate host capability registration');
  for(const capability of requested){
    const fixed=ticketCapabilities.find(c=>c.capabilityId===capability.capabilityId);
    if(!fixed||digest(fixed)!==digest(capability))throw Error('Host capability registration does not match reviewed registry');
    if(!legacy.some(c=>c.capabilityId===capability.capabilityId)&&(typeof host.listMembers!=='function'||typeof host.currentCapabilities!=='function'))throw Error('Member capability registration requires explicit host implementation and current catalog');
  }
  return structuredClone(requested);
}
