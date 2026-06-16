/** Convertit les paramètres nommés @foo en placeholders PostgreSQL $1, $2… */
export function namedParamsToPositional(
  sql: string,
  params: Record<string, unknown> = {},
): { text: string; values: unknown[] } {
  const order: string[] = [];
  const text = sql.replace(/@([a-zA-Z_][a-zA-Z0-9_]*)/g, (_, name: string) => {
    let idx = order.indexOf(name);
    if (idx === -1) {
      order.push(name);
      idx = order.length - 1;
    }
    return `$${idx + 1}`;
  });
  const values = order.map((key) => params[key]);
  return { text, values };
}

export function normalizeSqliteInsert(sql: string): { text: string; ignoreDuplicates: boolean } {
  const ignoreDuplicates = /INSERT\s+OR\s+IGNORE/i.test(sql);
  let text = sql.replace(/INSERT\s+OR\s+IGNORE\s+INTO/gi, 'INSERT INTO');
  text = text.replace(/INSERT\s+OR\s+REPLACE\s+INTO/gi, 'INSERT INTO');
  return { text, ignoreDuplicates };
}
