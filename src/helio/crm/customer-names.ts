import type { AfterWrite } from "@antelopejs/interface-dms/base/types/guards";
import { syncDerivedFields } from "./deal-derived";

// Deals and quotes store their customer's name next to its id, so the search
// box of their tables finds them by customer (a search reads stored fields,
// not the joined customer). A renamed customer brings them back in step: the
// deals here, the quotes through the listener the sales domain registers (it
// imports the CRM, not the other way round).

type NameSync = () => Promise<void>;

const listeners: NameSync[] = [];

/** Runs `sync` after every customer rename. */
export function onCustomerRenamed(sync: NameSync): void {
  listeners.push(sync);
}

/** The customers table's edit guard result once a customer was renamed. */
export const afterCustomerEdit: AfterWrite = async () => {
  await Promise.all([syncDerivedFields(), ...listeners.map((sync) => sync())]);
};
