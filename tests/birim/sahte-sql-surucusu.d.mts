// tests/birim/sahte-sql-surucusu.mjs için tip bildirimi.
export declare const SAHTE_TC: string;
export declare const SAHTE_IBAN: string;
export declare class Client {
  constructor(ayar: Record<string, any>);
  on(): this;
  connect(): Promise<void>;
  query(q: string | { text: string; values?: unknown[] }): Promise<{ fields: Array<{ name: string }>; rows: unknown[][] }>;
  end(): Promise<void>;
}
export declare function yukleyici(paket: string): Promise<any>;
