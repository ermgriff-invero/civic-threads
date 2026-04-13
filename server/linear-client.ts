import { LinearClient } from '@linear/sdk';

async function getAccessToken(): Promise<string> {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  
  const replIdentity = process.env.REPL_IDENTITY;
  const replRenewal = process.env.WEB_REPL_RENEWAL;
  
  let xReplitToken: string | null = null;
  if (replIdentity) {
    xReplitToken = 'repl ' + replIdentity;
  } else if (replRenewal) {
    xReplitToken = 'depl ' + replRenewal;
  }

  if (!xReplitToken || !hostname) {
    throw new Error('Replit connector environment not available');
  }

  const response = await fetch(
    `https://${hostname}/api/v2/connection?include_secrets=true&connector_names=linear`,
    {
      headers: {
        'Accept': 'application/json',
        'X-Replit-Token': xReplitToken
      }
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch Linear connection: ${response.status}`);
  }

  const data = await response.json();
  const connection = data.items?.[0];

  if (!connection) {
    throw new Error('No Linear connection found. Please connect Linear in Replit integrations.');
  }

  const accessToken = connection.settings?.access_token 
    || connection.settings?.oauth?.credentials?.access_token;

  if (!accessToken) {
    throw new Error('Linear access token not found in connection settings');
  }

  return accessToken;
}

export async function getLinearClient(): Promise<LinearClient> {
  const accessToken = await getAccessToken();
  return new LinearClient({ accessToken });
}
