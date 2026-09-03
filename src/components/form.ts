import {
  PageController,
  RegisterPage,
} from "@antelopejs-private/cms/interfaces/cms/page";
import { DefaultDataTypes } from "@antelopejs-private/cms/interfaces/cms-base/data-types/default-types";
import { Form } from "@antelopejs-private/cms/interfaces/cms-base/form";
import { AssetType } from "@antelopejs-private/cms-media";
import { componentsCategory } from "./category";
import { demoTopicController } from "./form-database";
import { demoTaskController } from "./table-view/page";

// Tree node labels are plain text: TreeType items are not run through the
// frontend i18n resolution (unlike field labels and select item labels).
const INTEREST_NODES = [
  {
    label: "Talks",
    value: "talks",
    icon: "i-ph-microphone",
    children: [
      { label: "Keynotes", value: "talks/keynotes" },
      { label: "Lightning talks", value: "talks/lightning" },
    ],
  },
  {
    label: "Workshops",
    value: "workshops",
    icon: "i-ph-wrench",
    children: [
      { label: "Hands-on labs", value: "workshops/labs" },
      { label: "Certification", value: "workshops/certification" },
    ],
  },
  { label: "Networking", value: "networking", icon: "i-ph-users-three" },
];

// One field per DefaultDataTypes input (plus the textarea/range/multiple
// variants) so the page demonstrates every form input the CMS ships.
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
            label: "$demo.form.fullName.label",
            type: new DefaultDataTypes.StringType({
              placeholder: "Jane Doe",
              minLength: 2,
              maxLength: 80,
            }),
            required: true,
          },
          {
            id: "email",
            label: "$demo.form.email.label",
            type: new DefaultDataTypes.EmailType({
              placeholder: "jane@example.com",
            }),
            required: true,
          },
          {
            id: "phone",
            label: "$demo.form.phone.label",
            type: new DefaultDataTypes.PhoneType({
              placeholder: "+32 470 12 34 56",
            }),
          },
          {
            id: "password",
            label: "$demo.form.password.label",
            description: "$demo.form.password.description",
            type: new DefaultDataTypes.PasswordType({
              placeholder: "********",
              minLength: 8,
              confirmPassword: true,
            }),
            required: true,
          },
          {
            id: "website",
            label: "$demo.form.website.label",
            type: new DefaultDataTypes.UrlType({
              placeholder: "https://example.com",
            }),
          },
          {
            id: "badgeColor",
            label: "$demo.form.badgeColor.label",
            description: "$demo.form.badgeColor.description",
            type: new DefaultDataTypes.ColorType({ placeholder: "#7c3aed" }),
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
            label: "$demo.form.ticketType.label",
            type: new DefaultDataTypes.SelectType({
              items: [
                {
                  label: "$demo.form.ticket.types.standard",
                  value: "standard",
                },
                { label: "$demo.form.ticket.types.vip", value: "vip" },
                { label: "$demo.form.ticket.types.student", value: "student" },
              ],
              placeholder: "...",
            }),
            required: true,
          },
          {
            id: "addons",
            label: "$demo.form.addons.label",
            type: new DefaultDataTypes.SelectType({
              items: [
                {
                  label: "$demo.form.ticket.addons.workshop",
                  value: "workshop",
                },
                { label: "$demo.form.ticket.addons.lunch", value: "lunch" },
                { label: "$demo.form.ticket.addons.goodies", value: "goodies" },
              ],
              placeholder: "...",
              multiple: true,
            }),
          },
          {
            id: "price",
            label: "$demo.form.price.label",
            type: new DefaultDataTypes.PriceType({
              min: 0,
              max: 500,
              step: 5,
            }),
          },
          {
            id: "discount",
            label: "$demo.form.discount.label",
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
        id: "stay",
        label: "$demo.form.stay.label",
        description: "$demo.form.stay.description",
        type: new DefaultDataTypes.DateType({ range: true }),
      },
      {
        id: "checkinTime",
        label: "$demo.form.checkinTime.label",
        description: "$demo.form.checkinTime.description",
        type: new DefaultDataTypes.StringTimeType({
          placeholder: "09:30",
        }),
      },
      {
        id: "address",
        label: "$demo.form.address.label",
        description: "$demo.form.address.description",
        type: new DefaultDataTypes.AddressType({
          autocomplete: { enabled: true },
        }),
      },
      {
        id: "interests",
        label: "$demo.form.interests.label",
        description: "$demo.form.interests.description",
        type: new DefaultDataTypes.TreeType({
          items: INTEREST_NODES,
          multiple: true,
          placeholder: "...",
        }),
      },
      {
        id: "track",
        label: "$demo.form.track.label",
        description: "$demo.form.track.description",
        type: new DefaultDataTypes.CascaderRelationType({
          placeholder: "...",
          dataApiController: demoTopicController,
          deselectable: true,
          keyMapping: { label: "name", value: "_id", parent: "parent" },
        }),
      },
      {
        id: "relatedTask",
        label: "$demo.form.relatedTask.label",
        description: "$demo.form.relatedTask.description",
        type: new DefaultDataTypes.RelationType({
          placeholder: "...",
          dataApiController: demoTaskController,
          deselectable: true,
          keyMapping: { label: "name", value: "_id" },
        }),
      },
      {
        id: "permissions",
        label: "$demo.form.permissions.label",
        description: "$demo.form.permissions.description",
        type: new DefaultDataTypes.PermissionsType({
          fetchUrl: "/settings/user/roles/permissions-tree",
        }),
      },
      {
        id: "bio",
        label: "$demo.form.bio.label",
        description: "$demo.form.bio.description",
        type: new DefaultDataTypes.StringType({
          placeholder: "...",
          textarea: true,
          rows: 4,
          maxLength: 500,
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
        id: "attachment",
        label: "$demo.form.attachment.label",
        description: "$demo.form.attachment.description",
        type: new DefaultDataTypes.FileType({
          constraints: {
            maxSize: 5 * 1024 * 1024,
            allowedMimetypes: ["image/*", "application/pdf"],
          },
        }),
      },
      {
        id: "newsletter",
        label: "$demo.form.newsletter.label",
        description: "$demo.form.newsletter.description",
        type: new DefaultDataTypes.BooleanType(),
      },
      {
        id: "badgePhoto",
        label: "$demo.form.badgePhoto.label",
        description: "$demo.form.badgePhoto.description",
        type: new DefaultDataTypes.ImageType({
          multiple: false,
          path: "badges",
          constraints: {
            maxSize: 5 * 1024 * 1024,
            allowedMimetypes: ["image/png", "image/jpeg", "image/webp"],
          },
        }),
      },
      {
        id: "gallery",
        label: "$demo.form.gallery.label",
        description: "$demo.form.gallery.description",
        type: new DefaultDataTypes.ImageType({
          multiple: true,
          max: 8,
          path: "gallery",
          constraints: {
            maxSize: 5 * 1024 * 1024,
            allowedMimetypes: ["image/png", "image/jpeg", "image/webp"],
          },
        }),
      },
      {
        id: "mediaGallery",
        label: "$demo.form.mediaGallery.label",
        description: "$demo.form.mediaGallery.description",
        type: new AssetType({
          multiple: true,
          max: 4,
          mimetypes: ["image/*"],
          binding: {
            id: "template-cms-demo.form.media-gallery",
            folderName: "Event media",
            permissionsFromPage: PageComponentForm,
          },
        }),
      },
    ],
  });
}
