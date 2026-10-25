import {createHash} from 'node:crypto';
import type {AdaptationPlan} from '@ae/contracts';
import {revealAssets} from './reveal-assets.js';
export const revealPin='75dff6f515d2d08df0c32cf2b7328b89425c6f25';
export const revealHashes: Readonly<Record<string,string>> = {
  "package.json": "c9cac6cb97f7e233219ee12a624283fc65c08a4d7bad09b1facc980a490dcc87",
  "index.html": "f2d18518d678e33999861f1fc01d41b72c81f56998888a291ee48ac62529f2f0",
  "LICENSE": "b2883e4b610bfa1b4d8fff84c4d4b825cc7d553cbd9fec4777c04068a2859dc0",
  "dist/reveal.js": "aa1bbbf2617b23a623b23612cb3c5bdb63de512e652bf20fcfa832b045d37844",
  "dist/reveal.css": "5c38071afd0e46673eda82211146fbcf4e66b671a8a86f9763e1c3b0a883c271",
  "dist/reset.css": "39413c3490fdcf826427c26ff4c1ee59ea961a0aa8507c18454e0c6dc96c12d8"
};
export const revealRecipe={
 ref:{id:'reveal-local',version:'1.0.0'},manifest:'package.json',inputs:Object.keys(revealHashes),outputs:Object.keys(revealAssets),businessPath:'index.html',
 observedFlow:'Pinned reveal.js 6.0.2 two-slide local presentation: original keyboard/navigation/rendering with approved durable plain-text authoring overlay.',
 matches(contents:ReadonlyMap<string,string>,_stack:readonly string[]){return Object.entries(revealHashes).every(([p,h])=>contents.has(p)&&createHash('sha256').update(contents.get(p)!).digest('hex')===h)},
 planDetails:{goals:['Preserve original reveal.js UI and navigation; add a floating local assistant using the shared AE runtime and a bounded SQLite authoring overlay.'],nonGoals:['Multi-user authentication','Arbitrary HTML/script edits','Rewriting reveal.js','Paid model calls','Deployment','External publication','Durable AE runs'],capabilities:['Read the pinned two-slide index deck','Prepare and approve one plain-text slide replacement','Query atomic durable edit receipts','Ephemeral navigation through the original Reveal API'],dependencies:['Node 24 with built-in node:sqlite','Separately built accepted AE workspace; shared runtime packages, no duplicated agent loop','Pinned local Chromium only for the explicitly approved real reveal verification profile'],commands:[],networkAllowlist:[],dataFlows:['Loopback single-operator HTTP session and exact-origin writes; no external network or paid provider','Browser uses Reveal API; durable deck overlay and operation receipt commit in one local SQLite transaction','AE holds exact approval bindings and in-memory runs; restart invalidates pending approvals, never retries edits'],migrations:[],verification:['Pinned original source/license hashes','Preapply original browser navigation baseline','Original/candidate black-box differential','Current authority, stale version, repeat, interruption and receipt tests','Browser assistant and durable edit checks'],rollback:['Remove unchanged generated agentic files; original HTML and distribution files are unchanged. Preserve or archive local SQLite overlay separately.'],cost:{currency:'USD',maximum:0,paidCallsAllowed:false}} satisfies Pick<AdaptationPlan,'goals'|'nonGoals'|'capabilities'|'dependencies'|'commands'|'networkAllowlist'|'dataFlows'|'migrations'|'verification'|'rollback'|'cost'>,
 preview(read:(path:string)=>string|null){return Object.entries(revealAssets).map(([path,after])=>{if(read(path)!==null)throw Error('Reveal integration already exists or conflicts');return{path,before:null,after}})}
};
