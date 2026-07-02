import { Client } from '../types';

/**
 * Flatten a clients row fetched with
 * `brokers:client_brokers(is_lead, broker:brokers(*))`
 * into Client.brokers ordered lead-first (then broker display_order),
 * and expose lead_broker_id for the edit form.
 */
export function mapClientBrokers(c: any): Client {
  const rows = (c.brokers ?? []).filter((cb: any) => cb.broker);
  rows.sort(
    (a: any, b: any) =>
      Number(!!b.is_lead) - Number(!!a.is_lead) ||
      (a.broker.display_order ?? 0) - (b.broker.display_order ?? 0)
  );
  return {
    ...c,
    brokers: rows.map((cb: any) => cb.broker),
    lead_broker_id: rows.find((cb: any) => cb.is_lead)?.broker.id ?? null,
  };
}
