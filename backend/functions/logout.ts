// Clears the encrypted refresh token cookie to log the user out.
// Optionally, this could call Google's revoke endpoint if we wanted to actively revoke the token,
// but clearing the cookie is sufficient for severing the client session.

import type { Handler } from '@netlify/functions';

/**
 * Netlify Function handler: clears `td2_rt` and helper `td2_oauth` cookies.
 */
export const handler: Handler = async () => {
  const clearRt = `td2_rt=; Path=/api/; Secure; HttpOnly; SameSite=Lax; Max-Age=0`;
  const clearHelper = `td2_oauth=; Path=/api/; Secure; HttpOnly; SameSite=Lax; Max-Age=0`;
  return {
    statusCode: 204,
    headers: {},
    multiValueHeaders: { 'Set-Cookie': [clearRt, clearHelper] },
    body: ''
  };
};
