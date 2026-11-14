export class UserError extends Error {}

// Never return Google request objects, credentials, or raw provider errors.
export function safeError(error) {
  if (error instanceof UserError) return error.message;
  const status = Number(error?.response?.status ?? error?.status);
  const code = error?.response?.data?.error;
  if (code === 'invalid_grant' || error?.code === 'invalid_grant')
    return 'Google authorization expired/revoked. Run npm run auth again.';
  if (status === 400) return 'Google rejected the request. Check spreadsheet type, range, formula, and tab name.';
  if (status === 401) return 'Google authorization is invalid. Run npm run auth again.';
  if (status === 403) return 'Google denied access. Check API enablement, OAuth scope, file sharing, and protected cells.';
  if (status === 404) return 'Spreadsheet not found or inaccessible to the authorized Google account.';
  if (status === 429) return 'Google quota exceeded. Wait before retrying; verify writes before repeating them.';
  return 'Operation failed. Check configuration/network. If this was a write, inspect the sheet before retrying.';
}
