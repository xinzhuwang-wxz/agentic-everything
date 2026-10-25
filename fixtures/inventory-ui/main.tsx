import React, { useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AgenticMount } from '@ae/host-sdk';
import '@ae/ui/styles.css';
import './style.css';

type Stock = { sku: string; available: number; version: number };
export function InventoryHost() {
 const [stock,setStock]=useState<Stock>();
 const [error,setError]=useState('');
 const [management,setManagement]=useState(false);
 const refresh=useCallback(async()=>{try{const response=await fetch('/stock',{credentials:'same-origin'});if(!response.ok)throw Error('Stock read denied');setStock(await response.json());setError('')}catch(error){setError(error instanceof Error?error.message:'Stock unavailable')}},[]);
 useEffect(()=>{void refresh()},[refresh]);
 return <main className="inventory-host"><header><p>OWNED SYNTHETIC HOST · PYTHON / SQLITE</p><h1>Inventory reservations</h1><nav><button onClick={()=>setManagement(value=>!value)} aria-expanded={management}>Agentic settings & activity</button></nav></header>
  <section aria-label="Inventory stock"><h2>Desk stock</h2><dl><div><dt>SKU</dt><dd>desk-01</dd></div><div><dt>Available</dt><dd data-testid="host-stock">{stock?.available??'Loading'}</dd></div><div><dt>Version</dt><dd data-testid="host-version">{stock?.version??'Loading'}</dd></div></dl><button onClick={()=>void refresh()}>Refresh stock</button>{error&&<p role="alert">{error}</p>}</section>
  <p>Optional mounted UI over the unchanged Python inventory. No ticket alias, customer data, production login, paid model, or deployment.</p>
  <AgenticMount apiBase="/api" context={{sku:'desk-01'}} contextLabel="Desk stock · desk-01" sessionKey="synthetic-alice-session-1" title="Inventory assistant" suggestions={[{label:'Inspect stock',input:'Read stock for desk-01'},{label:'Preview reservation',input:'Reserve 3 desks for order-ui after reading current stock'}]} floating={{applicationId:'inventory-ui-fixture'}} managementVisible={management} onRunChange={run=>{if(run.status==='succeeded')void refresh()}}/>
 </main>;
}
const root=document.getElementById('root');if(root)createRoot(root).render(<InventoryHost/>);
