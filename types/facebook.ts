/**
 * Facebook Send API Types
 */

export interface SendMessageRequest {
  recipient: {
    id: string;
  };
  message: {
    text: string;
  };
  messaging_type?: 'RESPONSE' | 'UPDATE' | 'MESSAGE_TAG';
  tag?: string;
}

export interface SendMessageResponse {
  recipient_id: string;
  message_id: string;
}

export interface FacebookError {
  error: {
    message: string;
    type: string;
    code: number;
    error_subcode?: number;
    fbtrace_id: string;
  };
}

export interface RateLimitInfo {
  callCount: number;
  totalCpuTime: number;
  totalTime: number;
  type: string;
  estimatedTimeToRegainAccess?: number;
}

export interface SendMessageOptions {
  messagingType?: 'RESPONSE' | 'UPDATE' | 'MESSAGE_TAG';
  tag?: string;
}
