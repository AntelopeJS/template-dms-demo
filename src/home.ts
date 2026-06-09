import {
  PageController,
  pagesCategory,
  RegisterPage,
} from "@antelopejs-private/cms/interfaces/cms/page";
import { DefaultDataTypes } from "@antelopejs-private/cms/interfaces/cms-base/data-types/default-types";
import { Form } from "@antelopejs-private/cms/interfaces/cms-base/form";

@RegisterPage()
export class PageHome extends PageController("home", {
  displayName: "Home",
  icon: "i-ph-house",
  category: pagesCategory,
  order: 0,
  description: "Home page with a simple form",
}) {
  static form = Form({
    title: "Contact",
    description: "A simple form to get you started",
    fields: [
      {
        id: "name",
        label: "Name",
        description: "Your full name",
        type: new DefaultDataTypes.StringType({
          placeholder: "Jane Doe",
          maxLength: 100,
        }),
      },
      {
        id: "email",
        label: "Email",
        description: "Your email address",
        type: new DefaultDataTypes.EmailType({
          placeholder: "jane@example.com",
        }),
      },
      {
        id: "message",
        label: "Message",
        description: "Your message",
        type: new DefaultDataTypes.StringType({
          placeholder: "Write your message here...",
          maxLength: 1000,
          textarea: true,
          rows: 5,
        }),
      },
    ],
  });
}
