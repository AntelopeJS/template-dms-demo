// The installer companies that subscribe to Helio. All fictional: Belgian and
// French solar / EV-charger installers of every size, spread over the plans
// and the billing states an operator meets in real life (paying, trialing,
// a failed payment, a recent churn, a free independent).

import type {
  TenantBillingAddress,
  TenantCustomerType,
  TenantSubscriptionStatus,
} from "@antelopejs/interface-dms-saas/db";
import { PLAN_IDS } from "./plans";

export interface SeedPerson {
  /** Unique per workspace; the user id is derived from the workspace's. */
  key: string;
  name: string;
  email: string;
  language: "en" | "fr";
}

export interface SeedBillingProfile {
  customerType: TenantCustomerType;
  companyName: string | null;
  vatNumber: string | null;
  billingEmail: string;
  address: TenantBillingAddress;
}

export interface SeedWorkspace {
  id: string;
  name: string;
  /** Short code the fake Stripe ids and invoice numbers are built from. */
  code: string;
  /** How long ago the workspace was created, in months then days. */
  ageMonths: number;
  ageDays: number;
  planId: string;
  status: TenantSubscriptionStatus;
  /** VAT rate of its invoices: 21 % in Belgium, reverse charge (0) in France. */
  taxRate: number;
  /** Days left in a trial, kept ahead of now on every boot. */
  trialDaysLeft?: number;
  /** A churned workspace was billed this many periods before it left. */
  billedPeriods?: number;
  owner: SeedPerson;
  members: SeedPerson[];
  billing: SeedBillingProfile;
}

const BE_VAT = 21;
const REVERSE_CHARGE = 0;

function address(
  line1: string,
  postalCode: string,
  city: string,
  country: "BE" | "FR",
): TenantBillingAddress {
  return { line1, line2: null, postalCode, city, state: null, country };
}

function person(
  key: string,
  name: string,
  email: string,
  language: "en" | "fr" = "fr",
): SeedPerson {
  return { key, name, email, language };
}

export const WORKSPACES: SeedWorkspace[] = [
  {
    id: "helio-ws-soleil-mosan",
    name: "Soleil Mosan",
    code: "SOLMOS",
    ageMonths: 17,
    ageDays: 9,
    planId: PLAN_IDS.business,
    status: "active",
    taxRate: BE_VAT,
    owner: person("owner", "Julie Renard", "julie.renard@soleil-mosan.be"),
    members: [
      person("sales", "Thomas Gilson", "thomas.gilson@soleil-mosan.be"),
      person("office", "Nadia Cherif", "nadia.cherif@soleil-mosan.be"),
      person("tech1", "Kevin Lambotte", "kevin.lambotte@soleil-mosan.be"),
      person("tech2", "Arnaud Delhez", "arnaud.delhez@soleil-mosan.be"),
    ],
    billing: {
      customerType: "business",
      companyName: "Soleil Mosan SRL",
      vatNumber: "BE0781442617",
      billingEmail: "compta@soleil-mosan.be",
      address: address("Quai de la Dérivation 41", "4020", "Liège", "BE"),
    },
  },
  {
    id: "helio-ws-enerlux",
    name: "Enerlux Services",
    code: "ENRLUX",
    ageMonths: 15,
    ageDays: 21,
    planId: PLAN_IDS.enterprise,
    status: "active",
    taxRate: BE_VAT,
    owner: person(
      "owner",
      "Marc Schroeder",
      "marc.schroeder@enerlux-services.be",
    ),
    members: [
      person("ops", "Sophie Thill", "sophie.thill@enerlux-services.be"),
      person("sales", "Laurent Kieffer", "laurent.kieffer@enerlux-services.be"),
      person("office", "Anne Reuter", "anne.reuter@enerlux-services.be"),
      person("tech1", "Yannick Mathieu", "yannick.mathieu@enerlux-services.be"),
      person("tech2", "Pierre Hansen", "pierre.hansen@enerlux-services.be"),
    ],
    billing: {
      customerType: "business",
      companyName: "Enerlux Services SA",
      vatNumber: "BE0712958304",
      billingEmail: "factures@enerlux-services.be",
      address: address("Route de Longwy 182", "6700", "Arlon", "BE"),
    },
  },
  {
    id: "helio-ws-toits-verts",
    name: "Toits Verts Bruxelles",
    code: "TVBXL",
    ageMonths: 9,
    ageDays: 4,
    planId: PLAN_IDS.business,
    status: "active",
    taxRate: BE_VAT,
    owner: person("owner", "Samir El Amrani", "samir@toitsverts.brussels"),
    members: [
      person(
        "sales",
        "Charlotte Van den Berghe",
        "charlotte@toitsverts.brussels",
      ),
      person("tech1", "Bram Peeters", "bram@toitsverts.brussels", "en"),
    ],
    billing: {
      customerType: "business",
      companyName: "Toits Verts Bruxelles SRL",
      vatNumber: "BE0745203981",
      billingEmail: "admin@toitsverts.brussels",
      address: address("Rue de la Loi 155", "1040", "Etterbeek", "BE"),
    },
  },
  {
    id: "helio-ws-ardenne-energies",
    name: "Ardenne Énergies",
    code: "ARDEN",
    ageMonths: 13,
    ageDays: 17,
    planId: PLAN_IDS.pro,
    status: "active",
    taxRate: BE_VAT,
    owner: person("owner", "François Collard", "f.collard@ardenne-energies.be"),
    members: [
      person("office", "Céline Jacquemin", "c.jacquemin@ardenne-energies.be"),
      person("tech1", "Damien Pirard", "d.pirard@ardenne-energies.be"),
    ],
    billing: {
      customerType: "business",
      companyName: "Ardenne Énergies SRL",
      vatNumber: "BE0698315472",
      billingEmail: "comptabilite@ardenne-energies.be",
      address: address("Rue du Commerce 12", "6900", "Marche-en-Famenne", "BE"),
    },
  },
  {
    id: "helio-ws-zonnewerk",
    name: "Zonnewerk Gent",
    code: "ZONGNT",
    ageMonths: 7,
    ageDays: 12,
    planId: PLAN_IDS.pro,
    status: "active",
    taxRate: BE_VAT,
    owner: person("owner", "Pieter De Smet", "pieter@zonnewerk.gent", "en"),
    members: [
      person("tech1", "Lotte Claes", "lotte@zonnewerk.gent", "en"),
      person("tech2", "Jens Verhaeghe", "jens@zonnewerk.gent", "en"),
    ],
    billing: {
      customerType: "business",
      companyName: "Zonnewerk Gent BV",
      vatNumber: "BE0763120459",
      billingEmail: "boekhouding@zonnewerk.gent",
      address: address("Dok-Noord 7", "9000", "Gent", "BE"),
    },
  },
  {
    id: "helio-ws-solaris-hainaut",
    name: "Solaris Hainaut",
    code: "SOLHNT",
    ageMonths: 11,
    ageDays: 2,
    planId: PLAN_IDS.pro,
    status: "past_due",
    taxRate: BE_VAT,
    owner: person(
      "owner",
      "Grégory Dupont",
      "gregory.dupont@solaris-hainaut.be",
    ),
    members: [
      person("tech1", "Logan Mertens", "logan.mertens@solaris-hainaut.be"),
    ],
    billing: {
      customerType: "business",
      companyName: "Solaris Hainaut SRL",
      vatNumber: "BE0727684510",
      billingEmail: "gregory.dupont@solaris-hainaut.be",
      address: address("Avenue des Nerviens 85", "7000", "Mons", "BE"),
    },
  },
  {
    id: "helio-ws-wattelec",
    name: "Watt'Elec Hauts-de-France",
    code: "WATELC",
    ageMonths: 0,
    ageDays: 5,
    planId: PLAN_IDS.business,
    status: "trialing",
    taxRate: REVERSE_CHARGE,
    trialDaysLeft: 9,
    owner: person(
      "owner",
      "Camille Lefebvre",
      "camille.lefebvre@wattelec-hdf.fr",
    ),
    members: [
      person("sales", "Hugo Delattre", "hugo.delattre@wattelec-hdf.fr"),
      person("tech1", "Maxence Caron", "maxence.caron@wattelec-hdf.fr"),
    ],
    billing: {
      customerType: "business",
      companyName: "Watt'Elec Hauts-de-France SAS",
      vatNumber: "FR41853217604",
      billingEmail: "compta@wattelec-hdf.fr",
      address: address("Rue Nationale 214", "59800", "Lille", "FR"),
    },
  },
  {
    id: "helio-ws-borne-et-vous",
    name: "Borne & Vous",
    code: "BRNVOU",
    ageMonths: 0,
    ageDays: 11,
    planId: PLAN_IDS.pro,
    status: "trialing",
    taxRate: REVERSE_CHARGE,
    trialDaysLeft: 3,
    owner: person("owner", "Élodie Muller", "elodie@borne-et-vous.fr"),
    members: [],
    billing: {
      customerType: "business",
      companyName: "Borne & Vous SAS",
      vatNumber: "FR07902148335",
      billingEmail: "elodie@borne-et-vous.fr",
      address: address("Rue Serpenoise 18", "57000", "Metz", "FR"),
    },
  },
  {
    id: "helio-ws-lambert",
    name: "Électricité Lambert",
    code: "ELLAMB",
    ageMonths: 4,
    ageDays: 8,
    planId: PLAN_IDS.starter,
    status: "active",
    taxRate: BE_VAT,
    owner: person("owner", "Olivier Lambert", "olivier@electricite-lambert.be"),
    members: [],
    billing: {
      customerType: "individual",
      companyName: null,
      vatNumber: null,
      billingEmail: "olivier@electricite-lambert.be",
      address: address("Chaussée de Louvain 302", "5000", "Namur", "BE"),
    },
  },
  {
    id: "helio-ws-brabant-solar",
    name: "Brabant Solar Services",
    code: "BRBSOL",
    ageMonths: 11,
    ageDays: 6,
    planId: PLAN_IDS.pro,
    status: "cancelled",
    taxRate: BE_VAT,
    billedPeriods: 10,
    owner: person(
      "owner",
      "Nathalie Wouters",
      "nathalie.wouters@brabant-solar.be",
    ),
    members: [
      person(
        "tech1",
        "Quentin Hendrickx",
        "quentin.hendrickx@brabant-solar.be",
      ),
    ],
    billing: {
      customerType: "business",
      companyName: "Brabant Solar Services SRL",
      vatNumber: "BE0739561288",
      billingEmail: "nathalie.wouters@brabant-solar.be",
      address: address("Avenue Einstein 6", "1300", "Wavre", "BE"),
    },
  },
];

/** The user id of a person of a workspace. */
export function userIdOf(workspace: SeedWorkspace, member: SeedPerson): string {
  return `${workspace.id}-${member.key}`;
}

/** The fake Stripe subscription id of a billed workspace. */
export function stripeSubscriptionIdOf(workspace: SeedWorkspace): string {
  return `sub_demo_${workspace.code.toLowerCase()}`;
}
