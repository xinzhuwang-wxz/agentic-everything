import http from 'node:http';import https from 'node:https';import net from 'node:net';import tls from 'node:tls';import {writeFileSync} from 'node:fs';
const attempts=[];const deny=kind=>(...args)=>{attempts.push({kind,target:String(args[0])});throw Error('R4 blocked unexpected network: '+kind)};
globalThis.fetch=deny('fetch');
if(globalThis.WebSocket)globalThis.WebSocket=class{constructor(...args){deny('WebSocket')(...args)}};
http.request=deny('http.request');http.get=deny('http.get');https.request=deny('https.request');https.get=deny('https.get');net.connect=deny('net.connect');tls.connect=deny('tls.connect');
process.on('exit',()=>writeFileSync(new URL(`evidence/network-${process.pid}.json`,import.meta.url),JSON.stringify(attempts)));
