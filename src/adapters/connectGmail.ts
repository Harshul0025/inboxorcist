import type { ApiClient } from '../lib/api';
import { createGmailApi } from './gmailApi';
import { GmailAdapter } from './GmailAdapter';
import { createTokenManager } from './googleAuth';

/**
 * Signs in with Google (consent popup, so call it from a click handler) and
 * returns a Gmail adapter.
 * @param clientId OAuth web client id.
 * @param api API client, used for one-click unsubscribe.
 */
export async function connectGmail(clientId: string, api: ApiClient): Promise<GmailAdapter> {
  const tokens = createTokenManager(clientId);
  await tokens.getToken();
  return new GmailAdapter(createGmailApi(tokens), tokens, api);
}
