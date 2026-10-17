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
@RegisterDataController()
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
    type: new DefaultDataTypes.SelectType({ items: [...TEAM_REGIONS] }),
    filterable: true,
    defaultValue: "liege",
  })
  @Mandatory("new", "edit")
  @Access(AccessMode.ReadWrite)
  declare region: string;

  @Listable()
  @Column({
    name: "$helio.team.columns.online",
    type: new StatusType({
      onlineLabel: "$helio.team.status.online",
      offlineLabel: "$helio.team.status.offline",
      onlineColor: "success",
      offlineColor: "neutral",
    }),
    filterable: true,
    defaultValue: false,
  })
  @Access(AccessMode.ReadWrite)
  declare online: boolean;

  @Listable()
  @Exported()
  @Column({
    name: "$helio.team.columns.skills",
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
    type: new DefaultDataTypes.ColorType(),
    defaultValue: "#f59e0b",
    isVisible: false,
  })
  @Optional()
  @Access(AccessMode.ReadWrite)
  declare color: string;

  @Listable()
  @Sortable()
  @Exported()
  @Column({
    name: "$helio.team.columns.hiredAt",
    type: new DefaultDataTypes.DateType(),
    filterable: true,
    display: new DefaultDisplays.RelativeDateDisplay({ style: "day" }),
  })
  @Optional()
  @Access(AccessMode.ReadWrite)
  declare hiredAt: Date;

  @Column({
    name: "$helio.team.columns.bio",
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
