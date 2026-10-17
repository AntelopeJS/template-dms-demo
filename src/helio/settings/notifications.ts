import { DefaultDataTypes } from "@antelopejs/interface-dms/base/data-types/default-types";
import type { FormField } from "@antelopejs/interface-dms/base/form";
import { ALERT_CHANNELS, DIGEST_FREQUENCIES } from "./options";

const MAX_RECIPIENTS = 20;

/**
 * The fields of the notifications form. It saves instantly, so each change is
 * a partial body of one field sent to the same route as the main form.
 */
export const notificationFields: FormField[] = [
  {
    id: "alertChannels",
    label: "$helio.settings.fields.alertChannels",
    description: "$helio.settings.descriptions.alertChannels",
    type: new DefaultDataTypes.SelectType({
      items: ALERT_CHANNELS,
      display: "cards",
      multiple: true,
    }),
  },
  {
    id: "digestFrequency",
    label: "$helio.settings.fields.digestFrequency",
    type: new DefaultDataTypes.SelectType({
      items: DIGEST_FREQUENCIES,
      display: "segmented",
    }),
  },
  {
    id: "notifyUrgentTickets",
    label: "$helio.settings.fields.notifyUrgentTickets",
    type: new DefaultDataTypes.BooleanType({
      display: "card",
      icon: "i-ph-fire",
      label: "$helio.settings.fields.notifyUrgentTickets_label",
      description: "$helio.settings.descriptions.notifyUrgentTickets",
    }),
  },
  {
    id: "notifyOfflineSites",
    label: "$helio.settings.fields.notifyOfflineSites",
    type: new DefaultDataTypes.BooleanType({
      label: "$helio.settings.fields.notifyOfflineSites_label",
      description: "$helio.settings.descriptions.notifyOfflineSites",
    }),
  },
  {
    id: "notifyOverdueInvoices",
    label: "$helio.settings.fields.notifyOverdueInvoices",
    type: new DefaultDataTypes.BooleanType({
      label: "$helio.settings.fields.notifyOverdueInvoices_label",
      description: "$helio.settings.descriptions.notifyOverdueInvoices",
    }),
  },
  {
    id: "alertRecipients",
    label: "$helio.settings.fields.alertRecipients",
    type: new DefaultDataTypes.TagsType({
      itemType: "email",
      max: MAX_RECIPIENTS,
      placeholder: "$helio.settings.placeholders.recipient",
    }),
    hint: "$helio.settings.hints.alertRecipients",
  },
];
