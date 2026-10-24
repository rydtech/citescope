export interface LogContext {
  audit_run_id?: string;
  workspace_id?: string;
  project_id?: string;
  job_id?: string;
  rule_id?: string;
  url?: string;
  [key: string]: unknown;
}

export function log(level: 'info' | 'warn' | 'error', message: string, ctx?: LogContext): void {
  const entry = {
    ts: new Date().toISOString(),
    level,
    message,
    ...ctx,
  };
  // Never log secrets, full HTML, or sensitive headers
  process.stdout.write(JSON.stringify(entry) + '\n');
}

export const logger = {
  info: (msg: string, ctx?: LogContext) => log('info', msg, ctx),
  warn: (msg: string, ctx?: LogContext) => log('warn', msg, ctx),
  error: (msg: string, ctx?: LogContext) => log('error', msg, ctx),
};
