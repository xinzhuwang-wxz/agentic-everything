import test from 'node:test';
import assert from 'node:assert/strict';
import { ticketCapabilities } from '@ae/capabilities';
import { configurationHostCatalog } from '../src/host-catalog.js';
test('persistent configuration defaults to the legacy implemented catalog',()=>{assert.deepEqual(configurationHostCatalog({}).map(c=>c.capabilityId),['read_ticket','change_ticket_priority']);});
test('member configuration requires explicit supported exact registration',()=>{assert.throws(()=>configurationHostCatalog({},ticketCapabilities),/requires explicit/);const host={listMembers(){},currentCapabilities(){}};assert.equal(configurationHostCatalog(host,ticketCapabilities).length,4);assert.throws(()=>configurationHostCatalog(host,ticketCapabilities.map(c=>({...c,bindingHash:'0'.repeat(64)}))),/reviewed registry/);assert.throws(()=>configurationHostCatalog(host,[ticketCapabilities[0]!,ticketCapabilities[0]!]),/Duplicate/);});
