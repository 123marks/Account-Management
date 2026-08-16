import type { Db } from './index'

interface Migration {
  version: number
  sql: string
}

const MIGRATIONS: Migration[] = [
  {
    version: 1,
    sql: `
      CREATE TABLE accounts (
        id TEXT PRIMARY KEY,
        platform TEXT NOT NULL,
        label TEXT NOT NULL DEFAULT '',
        username TEXT NOT NULL DEFAULT '',
        email TEXT NOT NULL DEFAULT '',
        password_enc TEXT,
        totp_secret_enc TEXT,
        recovery_email TEXT NOT NULL DEFAULT '',
        recovery_phone TEXT NOT NULL DEFAULT '',
        backup_codes_enc TEXT,
        refresh_token_enc TEXT,
        custom_fields TEXT NOT NULL DEFAULT '{}',
        group_name TEXT NOT NULL DEFAULT '',
        tags TEXT NOT NULL DEFAULT '[]',
        status TEXT NOT NULL DEFAULT 'active',
        profile_dir TEXT NOT NULL DEFAULT '',
        notes TEXT NOT NULL DEFAULT '',
        last_used_at INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX idx_accounts_platform ON accounts(platform);
      CREATE INDEX idx_accounts_group ON accounts(group_name);

      CREATE TABLE automation_tasks (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL,
        type TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'queued',
        params TEXT NOT NULL DEFAULT '{}',
        result TEXT,
        error TEXT,
        progress INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        started_at INTEGER,
        finished_at INTEGER
      );
      CREATE INDEX idx_tasks_account ON automation_tasks(account_id);
      CREATE INDEX idx_tasks_status ON automation_tasks(status);

      CREATE TABLE logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ts INTEGER NOT NULL,
        level TEXT NOT NULL,
        category TEXT NOT NULL,
        account_id TEXT,
        task_id TEXT,
        message TEXT NOT NULL,
        meta TEXT
      );
      CREATE INDEX idx_logs_ts ON logs(ts);
      CREATE INDEX idx_logs_level ON logs(level);

      CREATE TABLE settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `
  },
  {
    version: 2,
    // Track when each password was last set so the security audit can flag
    // long-unchanged credentials. Existing rows keep NULL (treated as unknown).
    sql: `ALTER TABLE accounts ADD COLUMN password_updated_at INTEGER;`
  },
  {
    version: 3,
    // External service providers used during automation/registration:
    // mailbox / captcha / sms / proxy. `config` holds an encrypted JSON blob
    // (may contain API keys), so it is never stored in plaintext.
    sql: `
      CREATE TABLE provider_settings (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        driver TEXT NOT NULL,
        name TEXT NOT NULL DEFAULT '',
        enabled INTEGER NOT NULL DEFAULT 1,
        is_default INTEGER NOT NULL DEFAULT 0,
        config_enc TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX idx_providers_type ON provider_settings(type);
    `
  },
  {
    version: 4,
    // Per-account outbound proxy so each account can run in its own network
    // environment (distinct exit IP). Empty = fall back to the default proxy provider.
    sql: `ALTER TABLE accounts ADD COLUMN proxy_url TEXT;`
  },
  {
    version: 5,
    // Per-profile browser identity (anti-detect): each account can present a
    // distinct User-Agent / language / timezone in its isolated Chrome profile.
    sql: `
      ALTER TABLE accounts ADD COLUMN user_agent TEXT;
      ALTER TABLE accounts ADD COLUMN locale TEXT;
      ALTER TABLE accounts ADD COLUMN timezone TEXT;
    `
  },
  {
    version: 6,
    // Previous passwords, appended whenever an account's password changes (manual
    // or via automation). Encrypted at rest so a change can be reviewed / rolled back.
    sql: `
      CREATE TABLE password_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        account_id TEXT NOT NULL,
        password_enc TEXT NOT NULL,
        changed_at INTEGER NOT NULL
      );
      CREATE INDEX idx_pwhist_account ON password_history(account_id);
    `
  },
  {
    version: 7,
    // App-lock: a UI gate (scrypt-hashed PIN) plus idle auto-lock. Kept out of the
    // generic settings table so the hash is never serialized to the renderer.
    sql: `
      CREATE TABLE app_lock (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        enabled INTEGER NOT NULL DEFAULT 0,
        salt TEXT,
        hash TEXT,
        auto_lock_minutes INTEGER NOT NULL DEFAULT 0
      );
      INSERT INTO app_lock (id, enabled, auto_lock_minutes) VALUES (1, 0, 0);
    `
  },
  {
    version: 8,
    // Favorite/pin flag so frequently-used accounts float to the top.
    sql: `ALTER TABLE accounts ADD COLUMN favorite INTEGER NOT NULL DEFAULT 0;`
  },
  {
    version: 9,
    // Soft-delete: deleting an account moves it to a recycle bin (deleted_at set)
    // instead of destroying credentials immediately, so it can be restored.
    sql: `ALTER TABLE accounts ADD COLUMN deleted_at INTEGER;`
  }
]

export function runMigrations(db: Db): void {
  db.exec(
    'CREATE TABLE IF NOT EXISTS _migrations (version INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL)'
  )
  const row = (db.prepare('SELECT MAX(version) AS v FROM _migrations').get() ?? { v: 0 }) as {
    v: number | null
  }
  const current = row.v ?? 0
  for (const m of MIGRATIONS) {
    if (m.version > current) {
      const apply = db.transaction(() => {
        db.exec(m.sql)
        db.prepare('INSERT INTO _migrations (version, applied_at) VALUES (?, ?)').run(
          m.version,
          Date.now()
        )
      })
      apply()
    }
  }
}
