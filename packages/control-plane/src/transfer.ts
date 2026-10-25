import { ConfigurationEnvelopeSchema, type AgentDraft, type ConfigurationEnvelope, type Principal } from '@ae/contracts';
import { digest, PolicyError } from '@ae/policy';
import { validateBehaviorSelection } from './behavior.js';
import type { ConfigurationState, ControlPlanePort } from './index.js';
export interface ConfigurationImportPreview {valid:boolean;conflicts:string[];previewHash:string;action:'create-new-draft-only';configuration?:ConfigurationEnvelope['configuration'];source?:ConfigurationEnvelope['source']}
/** Reuses current control-plane authorization, strict Zod schema and its existing revision/CAS store. */
export class ConfigurationTransfer {
  constructor(private readonly control:ControlPlanePort){}
  private async state(principal:Principal):Promise<ConfigurationState>{const state=await this.control.state(structuredClone(principal));if(!state.canConfigure)throw new PolicyError('CONFIGURATION_ADMIN_DENIED');return state;}
  async export(principal:Principal,draftId:string,expectedRevision:number):Promise<ConfigurationEnvelope>{
    const state=await this.state(principal),draft=state.drafts.find(d=>d.draftId===draftId);
    if(!draft)throw new PolicyError('CONFIGURATION_NOT_FOUND');if(draft.revision!==expectedRevision)throw new PolicyError('DRAFT_REVISION_CONFLICT');
    const capabilities=state.capabilities.filter(c=>draft.configuration.capabilityIds.includes(c.capabilityId)).map(({capabilityId,version,bindingHash})=>({capabilityId,version,bindingHash})).sort((a,b)=>a.capabilityId.localeCompare(b.capabilityId));
    if(capabilities.length!==draft.configuration.capabilityIds.length)throw new PolicyError('UNREGISTERED_CAPABILITY');
    const content={format:'ae-configuration' as const,schemaVersion:'1' as const,tenantId:principal.tenantId,applicationId:principal.applicationId,source:{draftId,revision:expectedRevision},configuration:draft.configuration,capabilities};
    await this.state(principal);return ConfigurationEnvelopeSchema.parse({...content,contentHash:digest(content)});
  }
  async preview(principal:Principal,value:unknown):Promise<ConfigurationImportPreview>{
    const state=await this.state(principal),parsed=ConfigurationEnvelopeSchema.safeParse(value),conflicts:string[]=[];
    if(!parsed.success)conflicts.push('unsupported-schema-or-fields');
    else{
      const {contentHash,...content}=parsed.data;
      if(digest(content)!==contentHash)conflicts.push('content-hash-mismatch');
      if(content.tenantId!==principal.tenantId||content.applicationId!==principal.applicationId)conflicts.push('tenant-or-application-mismatch');
      if(content.capabilities.length!==content.configuration.capabilityIds.length||content.capabilities.some(c=>!content.configuration.capabilityIds.includes(c.capabilityId))||content.capabilities.some(c=>!state.capabilities.some(a=>a.capabilityId===c.capabilityId&&a.version===c.version&&a.bindingHash===c.bindingHash)))conflicts.push('capability-version-or-binding-mismatch');
      try{validateBehaviorSelection(content.configuration.behavior,state.behaviorCatalog);}catch{conflicts.push('behavior-baseline-or-registry-mismatch');}
    }
    const previewHash=digest({value,scope:[principal.tenantId,principal.applicationId,principal.subjectId],capabilities:state.capabilities,behaviorCatalog:state.behaviorCatalog??null,activeReleaseId:state.activeReleaseId??null,conflicts});
    await this.state(principal);
    return {valid:conflicts.length===0,conflicts,previewHash,action:'create-new-draft-only',...(parsed.success&&conflicts.length===0?{configuration:parsed.data.configuration,source:parsed.data.source}:{})};
  }
  async import(principal:Principal,value:unknown,expectedPreviewHash:string):Promise<AgentDraft>{
    const preview=await this.preview(principal,value);
    if(!preview.valid)throw new PolicyError('CONFIGURATION_IMPORT_CONFLICT');
    if(preview.previewHash!==expectedPreviewHash)throw new PolicyError('CONFIGURATION_PREVIEW_CONFLICT');
    // Existing save validates current admin/catalog/behavior again. No release overwrite or implicit publication.
    return this.control.save(structuredClone(principal),preview.configuration);
  }
}
