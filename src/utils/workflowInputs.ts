export function getSalesOrderUsers(): string[] {
  const rawUsers = process.env.SALES_ORDER_USERS;

  if (!rawUsers) {
    throw new Error('SALES_ORDER_USERS is not set.');
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(rawUsers);
  } catch {
    throw new Error(
      'SALES_ORDER_USERS must be a valid JSON array of strings.',
    );
  }

  if (
    !Array.isArray(parsed) ||
    !parsed.every(user => typeof user === 'string')
  ) {
    throw new Error(
      'SALES_ORDER_USERS must be an array of strings.',
    );
  }

  return parsed;
}