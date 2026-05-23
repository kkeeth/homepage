export async function getGravatarUrl(
  email: string,
  size = 80,
): Promise<string> {
  const trimmed = email.trim().toLowerCase();
  const encoder = new TextEncoder();
  const data = encoder.encode(trimmed);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `https://www.gravatar.com/avatar/${hashHex}?s=${size}&d=mp`;
}
