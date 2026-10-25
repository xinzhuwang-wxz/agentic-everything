import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { appendFileSync } from 'node:fs';
import { join } from 'node:path';
export class Worker extends EventEmitter {
  constructor(root,url,directory,label){
    super();this.pending=new Map();this.events=[];this.sequence=0;this.output='';
    this.child=spawn(process.execPath,[join(root,'tests/persistence/worker.mjs'),url],{env:{PATH:process.env.PATH,HOME:directory,TZ:'UTC',NODE_OPTIONS:'--max-old-space-size=640'},stdio:['pipe','pipe','pipe']});
    this.closed=new Promise(resolve=>this.child.on('exit',(code,signal)=>{this.dead=true;for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(new Error(`Worker exited ${code}/${signal}: ${this.output}`));}this.pending.clear();resolve({code,signal});}));
    let buffer='';this.child.stdout.on('data',chunk=>{this.output+=chunk;appendFileSync(join(directory,`${label}.log`),chunk);buffer+=chunk;for(;;){const end=buffer.indexOf('\n');if(end<0)break;const line=buffer.slice(0,end);buffer=buffer.slice(end+1);if(!line.startsWith('AE_PERSISTENCE '))continue;const event=JSON.parse(line.slice(15));this.events.push(event);if(event.event==='response'){const p=this.pending.get(event.id);if(p){clearTimeout(p.timer);this.pending.delete(event.id);event.error?p.reject(new Error(event.error.message)):p.resolve(event.result);}}this.emit('event',event);}});
    this.child.stderr.on('data',chunk=>{this.output+=chunk;appendFileSync(join(directory,`${label}.log`),chunk);});
  }
  async ready(){if(this.events.some(e=>e.event==='ready'))return;await Promise.race([new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error(`Worker not ready: ${this.output}`)),30000);const listener=e=>{if(e.event==='ready'){clearTimeout(timer);this.off('event',listener);resolve();}};this.on('event',listener);}),this.closed.then(()=>{throw new Error(`Worker died: ${this.output}`);})]);}
  request(method,...args){const id=++this.sequence;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error(`Worker request timeout ${method}`)),45000);this.pending.set(id,{resolve,reject,timer});this.child.stdin.write(JSON.stringify({id,method,args})+'\n');});}
  async shutdown(){if(this.dead)return;await this.request('shutdown');const result=await this.closed;if(result.code!==0)throw new Error(`Shutdown failed ${JSON.stringify(result)}`);}
  async kill(){if(!this.dead){this.child.kill('SIGKILL');await this.closed;}}
}
