/**
 * Shared Type Definitions for AI Agent
 */

import OpenAI from 'openai';
import { ChatCompletionMessageParam } from 'openai/resources/index.mjs';
import { WorkspaceSettings } from '@/lib/workspace/settings-cache';
import { type AgentToolName } from '../tools/definitions';
import { ConversationContext, PendingImage } from '@/types/conversation';

export interface AgentInput {
  workspaceId: string;
  fbPageId: string;
  conversationId: string;
  messageText: string;
  customerPsid: string;
  replyContext?: string;
  imageRecognitionResult?: PendingImage | null;
  conversationHistory: ChatCompletionMessageParam[]; // Last 10 messages
  memorySummary: string | null;                      // Summary of older messages
  context: ConversationContext;                      // Current DB state (cart, etc)
  settings: WorkspaceSettings;                       // Workspace configs
  currentTime?: string;                              // Current server time (ISO)
  lastOrderDate?: string | null;                     // When the last order was placed
  isTest?: boolean;                                  // Test mode flag
}

export interface AgentOutput {
  response: string;
  shouldFlag: boolean;
  flagReason?: string;
  toolsCalled: string[];
  toolCallsMade: number;
  shouldTriggerQuickForm?: boolean;
}
