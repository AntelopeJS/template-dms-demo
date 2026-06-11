import {
  PageController,
  RegisterPage,
} from "@antelopejs-private/cms/interfaces/cms/page";
import { DefaultDataTypes } from "@antelopejs-private/cms/interfaces/cms-base/data-types/default-types";
import { Form } from "@antelopejs-private/cms/interfaces/cms-base/form";
import { componentsCategory } from "./category";

@RegisterPage()
export class PageComponentForm extends PageController("form", {
  displayName: "$demo.nav.form",
  icon: "i-ph-textbox",
  category: componentsCategory,
  order: 0,
  description: "$demo.pages.form.description",
}) {
  static form = Form({
    title: "$demo.form.title",
    description: "$demo.form.description",
    successMessage: "$demo.form.success",
    fields: [
      {
        id: "identity",
        label: "$demo.form.identity.label",
        description: "$demo.form.identity.description",
        fields: [
          {
            id: "fullName",
            type: new DefaultDataTypes.StringType({
              placeholder: "Jane Doe",
              minLength: 2,
              maxLength: 80,
            }),
            required: true,
          },
          {
            id: "email",
            type: new DefaultDataTypes.EmailType({
              placeholder: "jane@example.com",
            }),
            required: true,
          },
          {
            id: "phone",
            type: new DefaultDataTypes.PhoneType({
              placeholder: "+32 470 12 34 56",
            }),
          },
        ],
      },
      {
        id: "ticket",
        label: "$demo.form.ticket.label",
        description: "$demo.form.ticket.description",
        fields: [
          {
            id: "ticketType",
            type: new DefaultDataTypes.SelectType({
              items: [
                { label: "$demo.form.ticket.types.standard", value: "standard" },
                { label: "$demo.form.ticket.types.vip", value: "vip" },
                { label: "$demo.form.ticket.types.student", value: "student" },
              ],
              placeholder: "...",
            }),
            required: true,
          },
          {
            id: "addons",
            type: new DefaultDataTypes.SelectType({
              items: [
                { label: "$demo.form.ticket.addons.workshop", value: "workshop" },
                { label: "$demo.form.ticket.addons.lunch", value: "lunch" },
                { label: "$demo.form.ticket.addons.goodies", value: "goodies" },
              ],
              placeholder: "...",
              multiple: true,
            }),
          },
          {
            id: "price",
            type: new DefaultDataTypes.PriceType({
              min: 0,
              max: 500,
              step: 5,
            }),
          },
          {
            id: "discount",
            type: new DefaultDataTypes.PercentageType({
              min: 0,
              max: 0.5,
              step: 0.05,
            }),
          },
        ],
      },
      {
        id: "attendees",
        label: "$demo.form.attendees.label",
        description: "$demo.form.attendees.description",
        type: new DefaultDataTypes.NumberType({
          min: 1,
          max: 20,
          step: 1,
          placeholder: "1",
        }),
        required: true,
      },
      {
        id: "arrival",
        label: "$demo.form.arrival.label",
        description: "$demo.form.arrival.description",
        type: new DefaultDataTypes.DateType(),
      },
      {
        id: "website",
        label: "$demo.form.website.label",
        description: "$demo.form.website.description",
        type: new DefaultDataTypes.UrlType({
          placeholder: "https://example.com",
        }),
      },
      {
        id: "notes",
        label: "$demo.form.notes.label",
        description: "$demo.form.notes.description",
        type: new DefaultDataTypes.RichTextType({
          placeholder: "...",
        }),
      },
      {
        id: "newsletter",
        label: "$demo.form.newsletter.label",
        description: "$demo.form.newsletter.description",
        type: new DefaultDataTypes.BooleanType(),
      },
    ],
  });
}
