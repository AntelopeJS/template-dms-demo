import { Controller, type ControllerClass } from "@antelopejs/interface-api";
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
  Sortable,
} from "@antelopejs/interface-data-api/metadata";
import { Model } from "@antelopejs/interface-database-decorators";
import { StatusType } from "@antelopejs/interface-dms/base/data-types";
import { DefaultDataTypes } from "@antelopejs/interface-dms/base/data-types/default-types";
import { Searchable } from "@antelopejs/interface-dms/base/searchable";
import {
  Column,
  ColumnGroup,
  DefaultDisplays,
  Exported,
  Select,
  TableViewRoutes,
} from "@antelopejs/interface-dms/base/table-view";
import { TeamMember, TeamMemberModel } from "./database";

// Option lists exported for the pages (tabs, views, quick filters) so the
// values, labels and colours stay the same everywhere.
export const TEAM_ROLES = [
  {
    value: "manager",
    label: "$helio.team.roles.manager",
    icon: "i-ph-crown",
    iconColor: "warning",
    textColor: "warning",
  },
  {
    value: "sales",
    label: "$helio.team.roles.sales",
    icon: "i-ph-handshake",
    iconColor: "info",
    textColor: "info",
  },
  {
    value: "technician",
    label: "$helio.team.roles.technician",
    icon: "i-ph-hard-hat",
    iconColor: "success",
    textColor: "success",
  },
  {
    value: "office",
    label: "$helio.team.roles.office",
    icon: "i-ph-desktop",
    iconColor: "neutral",
    textColor: "neutral",
  },
] as const;

export const TEAM_REGIONS = [
  { value: "liege", label: "$helio.team.regions.liege", icon: "i-ph-map-pin" },
  { value: "namur", label: "$helio.team.regions.namur", icon: "i-ph-map-pin" },
  {
    value: "brussels",
    label: "$helio.team.regions.brussels",
    icon: "i-ph-map-pin",
  },
  {
    value: "hainaut",
    label: "$helio.team.regions.hainaut",
    icon: "i-ph-map-pin",
  },
  {
    value: "luxembourg",
    label: "$helio.team.regions.luxembourg",
    icon: "i-ph-map-pin",
  },
] as const;

// Suggested while typing; skills stay free text (one word per tag, since a
// space ends a tag).
const SKILL_SUGGESTIONS = [
  "Pose-PV",
  "Toiture",
  "Onduleurs",
  "Batteries",
  "Bornes-VE",
  "RGIE",
  "Monitoring",
  "Entretien",
  "Résidentiel",
  "Entreprises",
  "Primes",
  "Planification",
  "Facturation",
];

// Not exported on purpose: emitting a .d.ts for this class would require
// naming types from the nested @antelopejs/interface-core copies (TS2742).
// The groups split the generated add/edit form into three titled parts.
@RegisterDataController()
@ColumnGroup("identity", {
  label: "$helio.team.groups.identity.label",
  description: "$helio.team.groups.identity.description",
  orientation: "vertical",
  order: 0,
})
@ColumnGroup("assignment", {
  label: "$helio.team.groups.assignment.label",
  description: "$helio.team.groups.assignment.description",
  orientation: "vertical",
  order: 1,
})
@ColumnGroup("availability", {
  label: "$helio.team.groups.availability.label",
  description: "$helio.team.groups.availability.description",
  orientation: "vertical",
  order: 2,
})
@ColumnGroup("profile", {
  label: "$helio.team.groups.profile.label",
  description: "$helio.team.groups.profile.description",
  orientation: "vertical",
  order: 3,
})
class teamDataAPI extends DataController(
  TeamMember,
  TableViewRoutes.All,
  Controller("/api/helio/team"),
) {
  @ModelReference()
  @Model(TeamMemberModel)
  declare model: TeamMemberModel;

  @Select()
  @Listable()
  @Exported()
  @Access(AccessMode.ReadOnly)
  declare _id: string;

  @Searchable()
  @Select()
  @Listable()
  @Sortable()
  @Exported()
  @Column({
    name: "$helio.team.columns.name",
    group: "identity",
    type: new DefaultDataTypes.StringType({
      placeholder: "$helio.team.placeholders.name",
      maxLength: 80,
    }),
    filterable: true,
    size: 240,
    display: new DefaultDisplays.IdentityDisplay({
      avatarField: "avatar",
      subtitleField: "email",
    }),
  })
  @Mandatory("new", "edit")
  @Access(AccessMode.ReadWrite)
  declare name: string;

  @Searchable()
  @Listable()
  @Exported()
  @Column({
    name: "$helio.team.columns.email",
    group: "identity",
    type: new DefaultDataTypes.EmailType({
      placeholder: "$helio.team.placeholders.email",
    }),
    filterable: true,
    isVisible: false,
  })
  @Mandatory("new", "edit")
  @Access(AccessMode.ReadWrite)
  declare email: string;

  @Listable()
  @Exported()
  @Column({
    name: "$helio.team.columns.phone",
    group: "identity",
    type: new DefaultDataTypes.PhoneType({
      placeholder: "+32 470 00 00 00",
    }),
  })
  @Optional()
  @Access(AccessMode.ReadWrite)
  declare phone: string;

  @Select()
  @Listable()
  @Sortable()
  @Exported()
  @Column({
    name: "$helio.team.columns.role",
    group: "assignment",
    type: new DefaultDataTypes.SelectType({ items: [...TEAM_ROLES] }),
    filterable: true,
    defaultValue: "technician",
    display: new DefaultDisplays.StatusPillDisplay({
      tones: {
        manager: "warning",
        sales: "info",
        technician: "success",
        office: "neutral",
      },
    }),
  })
  @Mandatory("new", "edit")
  @Access(AccessMode.ReadWrite)
  declare role: string;

  @Listable()
  @Sortable()
  @Exported()
  @Column({
    name: "$helio.team.columns.region",
    group: "assignment",
    type: new DefaultDataTypes.SelectType({ items: [...TEAM_REGIONS] }),
    filterable: true,
  })
  @Mandatory("new", "edit")
  @Access(AccessMode.ReadWrite)
  declare region: string;

  @Listable()
  @Column({
    name: "$helio.team.columns.online",
    group: "availability",
    type: new StatusType({
      onlineLabel: "$helio.team.status.online",
      offlineLabel: "$helio.team.status.offline",
      onlineColor: "success",
      offlineColor: "neutral",
    }),
    filterable: true,
  })
  @Access(AccessMode.ReadWrite)
  declare online: boolean;

  @Listable()
  @Exported()
  @Column({
    name: "$helio.team.columns.skills",
    group: "profile",
    type: new DefaultDataTypes.TagsType({
      max: 8,
      suggestions: SKILL_SUGGESTIONS,
      placeholder: "$helio.team.placeholders.skills",
    }),
    filterable: true,
  })
  @Optional()
  @Access(AccessMode.ReadWrite)
  declare skills: string[];

  // A plain URL rather than an ImageType: seeded avatars are remote images,
  // which IdentityDisplay and relation pickers draw directly.
  @Select()
  @Listable()
  @Column({
    name: "$helio.team.columns.avatar",
    group: "identity",
    type: new DefaultDataTypes.UrlType({
      placeholder: "https://…",
    }),
    isVisible: false,
  })
  @Optional()
  @Access(AccessMode.ReadWrite)
  declare avatar: string;

  @Listable()
  @Column({
    name: "$helio.team.columns.color",
    group: "availability",
    type: new DefaultDataTypes.ColorType(),
    isVisible: false,
  })
  @Optional()
  @Access(AccessMode.ReadWrite)
  declare color: string;

  // The plain date format, with its year: the "day" style of
  // RelativeDateDisplay drops the year, which reads wrong for a hire date
  // years back.
  @Listable()
  @Sortable()
  @Exported()
  @Column({
    name: "$helio.team.columns.hiredAt",
    group: "assignment",
    type: new DefaultDataTypes.DateType(),
    filterable: true,
  })
  @Optional()
  @Access(AccessMode.ReadWrite)
  declare hiredAt: Date;

  // Listable so the expandable rows of the team page can show it.
  @Listable()
  @Column({
    name: "$helio.team.columns.bio",
    group: "profile",
    type: new DefaultDataTypes.StringType({
      textarea: true,
      rows: 3,
      maxLength: 400,
      showCount: true,
    }),
  })
  @Optional()
  @Access(AccessMode.ReadWrite)
  declare bio: string;
}

// ControllerClass-typed alias for relation columns of other domains (see the
// TS2742 note above).
export const teamController: ControllerClass = teamDataAPI;
