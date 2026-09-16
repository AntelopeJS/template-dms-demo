import { Controller, ControllerClass } from "@antelopejs/interface-api";
import {
  DataController,
  RegisterDataController,
} from "@antelopejs/interface-data-api";
import {
  Access,
  AccessMode,
  Listable,
  Mandatory,
  ModelReference,
  Optional,
} from "@antelopejs/interface-data-api/metadata";
import {
  BasicDataModel,
  Field,
  Fixture,
  Model,
  RegisterTable,
  Relation,
  Table,
} from "@antelopejs/interface-database-decorators";
import { DEMO_SCHEMA_NAME } from "../schema";
import { DefaultDataTypes } from "@antelopejs-private/dms/interfaces/dms-base/data-types/default-types";
import { Searchable } from "@antelopejs-private/dms/interfaces/dms-base/searchable";
import {
  Column,
  Exported,
  Select,
  TableViewRoutes,
} from "@antelopejs-private/dms/interfaces/dms-base/table-view";

const TABLE_NAME = "components_demo_topics";

interface TopicSeed {
  _id: string;
  name: string;
  parent?: string;
}

// Self-referencing tree of conference topics, consumed by the Form page's
// CascaderRelationType demo (each child references its parent's _id).
const DEFAULT_TOPICS: TopicSeed[] = [
  { _id: "engineering", name: "Engineering" },
  { _id: "frontend", name: "Frontend", parent: "engineering" },
  { _id: "vue", name: "Vue & Nuxt", parent: "frontend" },
  { _id: "css", name: "CSS & Design systems", parent: "frontend" },
  { _id: "backend", name: "Backend", parent: "engineering" },
  { _id: "node", name: "Node.js", parent: "backend" },
  { _id: "databases", name: "Databases", parent: "backend" },
  { _id: "product", name: "Product" },
  { _id: "discovery", name: "Discovery", parent: "product" },
  { _id: "analytics", name: "Analytics", parent: "product" },
  { _id: "design", name: "Design" },
  { _id: "ux", name: "UX research", parent: "design" },
  { _id: "ui", name: "UI craft", parent: "design" },
];

@RegisterTable(TABLE_NAME, DEMO_SCHEMA_NAME)
@Fixture(() => DEFAULT_TOPICS)
export class DemoTopic extends Table {
  @Field("string") declare _id: string;

  @Field("string") declare name: string;
  @Field("string") @Relation({ to: () => DemoTopic }) declare parent?: string;
}

export class DemoTopicModel extends BasicDataModel(DemoTopic, TABLE_NAME) {}

// Not exported on purpose: emitting a .d.ts for this class would require
// naming types from the nested @antelopejs/interface-core copies (TS2742).
// The @RegisterDataController decorator registers it as a side effect.
@RegisterDataController()
class demoTopicDataAPI extends DataController(
  DemoTopic,
  TableViewRoutes.All,
  Controller("/api/components-demo/topics"),
) {
  @ModelReference()
  @Model(DemoTopicModel)
  declare model: DemoTopicModel;

  @Select()
  @Listable()
  @Exported()
  @Access(AccessMode.ReadOnly)
  declare _id: string;

  @Searchable()
  @Select()
  @Listable()
  @Exported()
  @Column({
    name: "$demo.form.topics.columns.name",
    type: new DefaultDataTypes.StringType({
      placeholder: "Enter topic name",
    }),
    filterable: true,
  })
  @Mandatory("new", "edit")
  @Access(AccessMode.ReadWrite)
  declare name: string;

  // Self-reference: the _id of the parent topic. Must be @Select()ed so the
  // cascader can rebuild the tree client-side.
  @Select()
  @Listable()
  @Column({
    name: "$demo.form.topics.columns.parent",
    type: new DefaultDataTypes.StringType({
      placeholder: "Parent topic id (empty for a root topic)",
    }),
  })
  @Optional()
  @Access(AccessMode.ReadWrite)
  declare parent: string;
}

// ControllerClass-typed alias for the Form page's CascaderRelationType
// (see the TS2742 note above).
export const demoTopicController: ControllerClass = demoTopicDataAPI;
