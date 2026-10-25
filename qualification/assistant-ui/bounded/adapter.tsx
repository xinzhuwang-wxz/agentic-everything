// Qualification only. AE owns identity, fetching, authorization and run mutations.
import React, { useMemo } from 'react';
import {
  AssistantRuntimeProvider, ComposerPrimitive, MessagePrimitive,
  MessagePartPrimitive, ThreadPrimitive, useAuiState, useExternalStoreRuntime,
  type AssistantRuntime, type ThreadMessageLike,
} from '@assistant-ui/react';
import type { ConversationView } from '../../../packages/contracts/src/conversations.js';
export type Scope = { principalKey: string; conversationId: string; generation: number };
export type Snapshot = Scope & { view: ConversationView };
const active = new Set(['queued', 'running', 'reconciling']);
const unresolved = new Set([...active, 'awaiting-approval', 'outcome-unknown', 'manual-review']);
export function projectConversation(view: ConversationView): ThreadMessageLike[] {
  const statuses = new Map(view.runs.map(run => [run.runId, run.status]));
  return view.messages.map(message => {
    const status = statuses.get(message.runId);
    return {
      id: message.messageId, role: message.role, createdAt: new Date(message.createdAt),
      content: [{ type: 'text' as const, text: message.text }],
      metadata: { custom: { runId: message.runId, sequence: message.sequence } },
      ...(message.role === 'assistant' ? { status: active.has(status ?? '')
        ? { type: 'running' as const }
        : status === 'succeeded' ? { type: 'complete' as const, reason: 'stop' as const }
        : status === 'awaiting-approval' ? { type: 'requires-action' as const, reason: 'interrupt' as const }
        : { type: 'incomplete' as const, reason: status === 'cancelled' ? 'cancelled' as const : 'other' as const } } : {}),
    };
  });
}
const LiteralMessage = () => {
  const message = useAuiState(state => state.message);
  // Running placeholder belongs only to library presentation, never durable AE IDs.
  if (message.metadata.isOptimistic) return null;
  return <MessagePrimitive.Root data-message-id={message.id} data-role={message.role}>
    <MessagePrimitive.Parts components={{ Text: () => <MessagePartPrimitive.Text smooth={false}/> }}/>
  </MessagePrimitive.Root>;
};
const components = { Message: LiteralMessage };
export interface Props {
  scope: Scope; snapshot?: Snapshot; denied?: boolean;
  onNew: (text: string) => Promise<void>;
  observe?: (runtime: AssistantRuntime) => void;
}
export function ConversationPresentation(props: Props) {
  const { scope, snapshot, denied } = props;
  if (denied) return <p role="alert">Conversation access denied</p>;
  if (!snapshot || snapshot.principalKey !== scope.principalKey ||
      snapshot.conversationId !== scope.conversationId || snapshot.generation !== scope.generation ||
      snapshot.view.conversationId !== scope.conversationId) return <p role="status">Loading authorized conversation</p>;
  return <Store key={JSON.stringify(scope)} {...props} snapshot={snapshot}/>;
}
function Store({snapshot, onNew, observe}: Props & { snapshot: Snapshot }) {
  const view = snapshot.view;
  const messages = useMemo(() => projectConversation(view), [view]);
  const latest = view.runs.at(-1);
  const runtime = useExternalStoreRuntime<ThreadMessageLike>({
    messages, convertMessage: message => message,
    isRunning: !!latest && active.has(latest.status),
    isDisabled: !!latest && unresolved.has(latest.status),
    ...(latest ? { activeRunId: latest.runId } : {}),
    unstable_enableToolInvocations: false,
    unstable_persistsHistory: true,
    unstable_capabilities: { copy: false },
    onNew: async message => {
      if ((latest && unresolved.has(latest.status)) || message.role !== 'user' ||
          (message.attachments?.length ?? 0) > 0 || message.content.some(part => part.type !== 'text')) return;
      const text = message.content.map(part => part.type === 'text' ? part.text : '').join('').trim();
      if (text) await onNew(text);
    },
  });
  observe?.(runtime);
  return <AssistantRuntimeProvider runtime={runtime}>
    <ThreadPrimitive.Root>
      <ThreadPrimitive.Messages components={components}/>
      {latest && <output data-latest-run-id={latest.runId}>{latest.status}</output>}
      <ComposerPrimitive.Root>
        <ComposerPrimitive.Input aria-label="Message" submitMode="ctrlEnter" cancelOnEscape={false}
          addAttachmentOnPaste={false} autoFocus={false} unstable_focusOnRunStart={false}
          unstable_focusOnScrollToBottom={false} unstable_focusOnThreadSwitched={false}/>
        <ComposerPrimitive.Send>Send</ComposerPrimitive.Send>
      </ComposerPrimitive.Root>
    </ThreadPrimitive.Root>
  </AssistantRuntimeProvider>;
}
