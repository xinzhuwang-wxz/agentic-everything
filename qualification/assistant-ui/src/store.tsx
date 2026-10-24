// Qualification only. AE remains the sole owner of run/approval/receipt state.
import React, { useEffect, useId, useMemo } from 'react';
import {
  AssistantRuntimeProvider, ComposerPrimitive, MessagePrimitive,
  MessagePartPrimitive, ThreadPrimitive, useAuiState,
  useExternalStoreRuntime, type ThreadMessageLike,
} from '@assistant-ui/react';
import type { RunView } from '../../../packages/ui/src/types.js';

const active = new Set(['queued', 'running', 'reconciling']);
export function projectRun(run: RunView | undefined, lastInput: string): ThreadMessageLike[] {
  if (!run) return [];
  // Server-controlled strings only. No tool, image, file, HTML, Markdown or URL part.
  const status: ThreadMessageLike['status'] = active.has(run.status)
    ? { type: 'running' }
    : run.status === 'succeeded' ? { type: 'complete', reason: 'stop' }
    : run.status === 'awaiting-approval' ? { type: 'requires-action', reason: 'interrupt' }
    : { type: 'incomplete', reason: run.status === 'cancelled' ? 'cancelled' : 'other' };
  return [
    { id: `${run.runId}:request`, role: 'user', content: [{ type: 'text', text: lastInput || '已恢复的执行' }] },
    { id: `${run.runId}:result`, role: 'assistant', content: [{ type: 'text', text: run.message || '' }], status, metadata: { runId: run.runId } },
  ];
}
const PlainText = () => <MessagePrimitive.Parts components={{ Text: () => <MessagePartPrimitive.Text smooth={false}/> }}/>;
const messageComponents = { Message: PlainText };
export function StoreMessageText({index}: {index: number}) {
  // useExternalStoreRuntime resynchronizes in an effect, so an arriving RunView
  // can render before its presentation messages exist. Never invent a message.
  const present = useAuiState(state => state.thread.messages.length > index);
  return present ? <ThreadPrimitive.MessageByIndex index={index} components={messageComponents}/> : null;
}
interface Props {
  run: RunView | undefined;
  lastInput: string;
  input: string;
  onInputChange: (value: string) => void;
  onSend: (value: string) => void;
  disabled: boolean;
  busy: boolean;
  contextLabel: string;
  children: React.ReactNode;
}
export function StorePresentation(props: Props) {
  const {run, lastInput, input, onInputChange, onSend, disabled, busy, contextLabel, children} = props;
  const messages = useMemo(() => projectRun(run, lastInput), [run, lastInput]);
  const runtime = useExternalStoreRuntime<ThreadMessageLike>({
    messages, convertMessage: message => message,
    isRunning: !!run && active.has(run.status), isDisabled: disabled || busy,
    activeRunId: run?.runId, unstable_enableToolInvocations: false,
    // No model, cloud, history, queue, tools, attachment, import, edit, branch,
    // regenerate, or runtime cancellation adapters. AE buttons keep their callbacks.
    onNew: async message => {
      if (disabled || busy || message.role !== 'user' || (message.attachments?.length ?? 0) ||
          message.content.some(part => part.type !== 'text')) return;
      const text = message.content.map(part => part.type === 'text' ? part.text : '').join('').trim();
      if (text) onSend(text);
    },
  });
  // Suggestions and host resets are still controlled by the existing panel.
  // This synchronization is additional adapter ownership, measured by the spike.
  useEffect(() => { runtime.thread.composer.setText(input); }, [input, runtime]);
  const id = useId();
  return <AssistantRuntimeProvider runtime={runtime}>
    <ThreadPrimitive.Root className="ae-assistant-content">
      {children}
      <ComposerPrimitive.Root className="ae-input">
        <label htmlFor={id}>告诉助手你想完成什么</label>
        <div className="ae-input-frame"><div className="ae-input-caption"><span className="ae-context-mark" aria-hidden="true">◈</span><span>当前上下文</span><strong>{contextLabel}</strong><span className="ae-input-boundary">服务端权限边界</span></div>
          <div className="ae-input-card">
            <ComposerPrimitive.Input id={id} rows={2} minRows={2} maxRows={7}
              style={{height:72}} placeholder="描述你的目标，助手会先展示修改预览…"
              submitMode="ctrlEnter" cancelOnEscape={false} addAttachmentOnPaste={false}
              autoFocus={false} unstable_focusOnRunStart={false}
              unstable_focusOnScrollToBottom={false} unstable_focusOnThreadSwitched={false}
              onChange={event => onInputChange(event.target.value)}/>
            <div className="ae-input-toolbar"><span>修改前需确认</span>
              <ComposerPrimitive.Send className="ae-primary">{busy?'处理中…':'发送'}<span aria-hidden="true">↗</span></ComposerPrimitive.Send>
            </div>
          </div>
        </div>
        <div className="ae-input-help"><span>执行以服务端回执为准</span><span>Enter 换行 · Ctrl / ⌘ + Enter 发送</span></div>
      </ComposerPrimitive.Root>
    </ThreadPrimitive.Root>
  </AssistantRuntimeProvider>;
}
