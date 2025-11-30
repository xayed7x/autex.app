import crypto from 'crypto';

/**
 * Facebook Webhook Payload Interfaces
 */
export interface FacebookWebhookPayload {
  object: string;
  entry: FacebookWebhookEntry[];
}

export interface FacebookWebhookEntry {
  id: string;
  time: number;
  messaging?: MessagingEvent[];
  changes?: ChangeEvent[];
}

export interface ChangeEvent {
  field: string;
  value: CommentValue;
}

export interface CommentValue {
  item: string;
  verb: string;
  comment_id: string;
  post_id: string;
  from: {
    id: string;
    name: string;
  };
  message: string;
  created_time: number;
}

export interface MessagingEvent {
  sender: {
    id: string;
  };
  recipient: {
    id: string;
  };
  timestamp: number;
  message?: Message;
  postback?: {
    payload: string;
    title?: string;
  };
}

export interface Message {
  mid: string;
  text?: string;
  attachments?: Attachment[];
}

export interface Attachment {
  type: string;
  payload: {
    url?: string;
    [key: string]: any;
  };
}

/**
 * Verifies the x-hub-signature-256 header from Facebook
 * @param payload - Raw request body as string
 * @param signature - The x-hub-signature-256 header value
 * @param secret - Facebook App Secret
 * @returns true if signature is valid, false otherwise
 */
export function verifySignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  if (!signature || !signature.startsWith('sha256=')) {
    return false;
  }

  const signatureHash = signature.replace('sha256=', '');
  const expectedHash = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(signatureHash),
    Buffer.from(expectedHash)
  );
}

/**
 * Generates a deterministic event ID for idempotency
 * @param entryId - The entry.id from Facebook webhook
 * @param timestamp - The event timestamp
 * @param messageId - The message.mid from Facebook
 * @returns SHA-256 hash as event ID
 */
export function generateEventId(
  entryId: string,
  timestamp: number,
  messageId: string
): string {
  const data = `${entryId}:${timestamp}:${messageId}`;
  return crypto.createHash('sha256').update(data).digest('hex');
}
