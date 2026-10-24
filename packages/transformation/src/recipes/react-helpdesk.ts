import ts from 'typescript';
import { parse } from '../ast.js';
import type { AdaptationPlan } from '@ae/contracts';

/** First curated example only. These business assumptions do not belong to the generic engine. */
export const helpdeskRecipe = {
  ref: { id: 'react-helpdesk', version: '1.0.0' },
  inputs: ['package.json', 'src/App.tsx', 'src/tickets.ts', 'src/api.ts', 'src/main.tsx', 'index.html', 'vite.config.ts'],
  outputs: ['src/App.tsx', 'src/ae/AgenticMount.tsx'],
  businessPath: 'src/tickets.ts',
  observedFlow: 'Observed host page reads its HTTP ticket endpoint; existing ticket domain functions remain server-owned.',
  matches(contents: ReadonlyMap<string, string>, stack: readonly string[]): boolean {
    try {
      if (!stack.includes('React 19')) return false;
      mainOpening(contents.get('src/App.tsx') ?? '');
      if (!(contents.get('src/App.tsx') ?? '').includes('const refreshTicket = useCallback(') || !(contents.get('src/api.ts') ?? '').includes('/api/tickets/')) return false;
      const service = parse('src/tickets.ts', contents.get('src/tickets.ts') ?? '');
      const exports = service.statements.filter(ts.isFunctionDeclaration).filter(n => n.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword)).map(n => n.name?.text);
      return exports.includes('readTicket') && exports.includes('changePriority') && this.inputs.every(path => contents.has(path));
    } catch { return false; }
  },
  planDetails: {
    goals: ['Add an Agentic entry and embedded assistant without replacing the existing helpdesk.'],
    nonGoals: ['Production identity provisioning', 'Deployment', 'Database migration', 'Paid model calls'],
    capabilities: ['ticket.read', 'ticket.update (host authorization and explicit runtime approval required)'],
    dependencies: ['@ae/host-sdk@0.1.0 and @ae/ui@0.1.0 (provided by the AE workspace; installation not authorized by this recipe)'],
    commands: [], networkAllowlist: [],
    dataFlows: ['Existing host API remains authoritative; browser receives no server credential.'],
    migrations: [], verification: ['Patch hashes', 'TSX syntax', 'Original business domain source unchanged', 'Runtime/browser acceptance separately required'],
    rollback: ['Restore only patch-owned files when their post-apply hashes still match.'],
    cost: { currency: 'USD', maximum: 0, paidCallsAllowed: false },
  } satisfies Pick<AdaptationPlan, 'goals' | 'nonGoals' | 'capabilities' | 'dependencies' | 'commands' | 'networkAllowlist' | 'dataFlows' | 'migrations' | 'verification' | 'rollback' | 'cost'>,
  preview(read: (path: string) => string | null) {
    const app = read('src/App.tsx'); if (app === null) throw new Error('Missing App');
    if (read(this.outputs[1]!) !== null || app.includes('HelpdeskAgenticMount')) throw new Error('Integration already exists or conflicts');
    const position = mainOpening(app);
    const after = "import { HelpdeskAgenticMount } from './ae/AgenticMount.js';\n" + app.slice(0, position) + '<HelpdeskAgenticMount onChanged={refreshTicket} />' + app.slice(position);
    return [{ path: this.outputs[0]!, before: app, after }, { path: this.outputs[1]!, before: null, after: MOUNT }];
  },
};

function mainOpening(text: string): number {
  const source = parse('src/App.tsx', text); let position: number | undefined;
  for (const statement of source.statements) {
    if (!ts.isFunctionDeclaration(statement) || statement.name?.text !== 'App' || !statement.modifiers?.some(m => m.kind === ts.SyntaxKind.DefaultKeyword)) continue;
    const visit = (node: ts.Node): void => { if (ts.isJsxElement(node) && node.openingElement.tagName.getText(source) === 'main') { if (position !== undefined) throw new Error('Ambiguous main JSX mount'); position = node.openingElement.end; } ts.forEachChild(node, visit); };
    visit(statement);
  }
  if (position === undefined) throw new Error('No supported default App/main mount');
  return position;
}
const MOUNT = `import React, { useState } from 'react';
import { AgenticMount } from '@ae/host-sdk';
import '@ae/ui/styles.css';

// Synthetic fixture integration. Production hosts supply their own session boundary,
// navigation placement, reserved actions and modal suspension. This is not an admin grant.
export function HelpdeskAgenticMount({ onChanged }: { onChanged: () => void | Promise<void> }) {
  const [managementVisible, setManagementVisible] = useState(false);
  return <><nav aria-label="Helpdesk administration"><button type="button" aria-expanded={managementVisible} aria-controls="helpdesk-agentic-settings" onClick={() => setManagementVisible(value => !value)}>Agentic settings & activity</button></nav>
    <div id="helpdesk-agentic-settings"><AgenticMount apiBase="/api" ticketId="ticket-1" floating={{ applicationId: 'helpdesk-fixture', reservedAreas: [{ left: 0, top: 0, right: 360, bottom: 180 }] }} managementVisible={managementVisible} onRunChange={run => { if (run.status === 'succeeded') void onChanged(); }} /></div>
  </>;
}
`;
