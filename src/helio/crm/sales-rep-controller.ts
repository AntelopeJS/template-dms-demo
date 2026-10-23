import { Controller, type ControllerClass } from "@antelopejs/interface-api";
import {
  DataController,
  DefaultRoutes,
  RegisterDataController,
} from "@antelopejs/interface-data-api";
import {
  Access,
  AccessMode,
  type FilterValue,
  Listable,
  ModelReference,
} from "@antelopejs/interface-data-api/metadata";
import { Model } from "@antelopejs/interface-database-decorators";
import { DefaultDataTypes } from "@antelopejs/interface-dms/base/data-types/default-types";
import { Searchable } from "@antelopejs/interface-dms/base/searchable";
import {
  Column,
  Select,
  TableViewRoutes,
} from "@antelopejs/interface-dms/base/table-view";
import { TeamMember, TeamMemberModel } from "../team/database";

// The sales reps of the team, for the "Sales rep" pickers of deals and
// customers: the same helio_team rows, but its select route only ever lists
// the members whose role is "sales" (a mandatory route filter), so a
// technician or the office cannot be picked. The cells keep reading the
// member through the relation join, whatever their role.
const SALES_ONLY: Record<string, FilterValue> = {
  // The column type's "is" mode; the data API passes the mode through.
  role: ["sales", "is" as FilterValue[1]],
};

// Not exported on purpose (TS2742, see customer-controller.ts).
@RegisterDataController()
class salesRepDataAPI extends DataController(
  TeamMember,
  {
    get: TableViewRoutes.Get,
    select: DefaultRoutes.WithOptions(TableViewRoutes.Select, {
      filters: SALES_ONLY,
    }),
  },
  Controller("/api/helio/crm/sales-reps"),
) {
  @ModelReference()
  @Model(TeamMemberModel)
  declare model: TeamMemberModel;

  @Select()
  @Listable()
  @Access(AccessMode.ReadOnly)
  declare _id: string;

  @Searchable()
  @Select()
  @Listable()
  @Column({
    name: "$helio.team.columns.name",
    type: new DefaultDataTypes.StringType(),
  })
  @Access(AccessMode.ReadOnly)
  declare name: string;

  @Select()
  @Listable()
  @Column({
    name: "$helio.team.columns.avatar",
    type: new DefaultDataTypes.StringType(),
    isVisible: false,
  })
  @Access(AccessMode.ReadOnly)
  declare avatar: string;

  @Listable()
  @Column({
    name: "$helio.team.columns.role",
    type: new DefaultDataTypes.StringType(),
    filterable: true,
    isVisible: false,
  })
  @Access(AccessMode.ReadOnly)
  declare role: string;
}

// ControllerClass-typed alias for the relation columns (see the TS2742 note).
export const salesRepController: ControllerClass = salesRepDataAPI;
