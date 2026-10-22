import type { GroupPort, JsonSchema } from "./useGraphConnect";

export interface PortRef {
  name: string;
  type?: string;
}

export interface NodeKindUI {
  label: string;
  icon?: string;
  hasTriggerIn: boolean;
  hasMainTriggerOut: boolean;
  staticTriggerOuts: string[];
  staticDataIns: PortRef[];
  staticDataOuts: PortRef[];
  dynamicTriggerOutsFromConfig?: string;
  typeRegistry?: "triggers" | "actions" | "dataNodes";
  dataInsFromTypeSchema?: "inputSchema" | "outputSchema" | "configSchema";
  dataOutsFromTypeSchema?: "inputSchema" | "outputSchema" | "configSchema";
  labelFromType?: boolean;
  iconFromType?: boolean;
  categoryFromType?: boolean;
  category?: string;
  defaultConfig?: Record<string, unknown>;
  configSchema?: JsonSchema;
}

export interface NodeKindEntry {
  kind: string;
  meta: {
    continuationPorts: string[];
    sidePorts: string[];
    ui?: NodeKindUI;
  };
}

/** Data type of a block dragged from the builder palette onto the canvas. */
export const PALETTE_DRAG_TYPE = "application/x-dms-automation-block";

/**
 * A workspace template as the palette offers it: the fields placing it
 * needs (the list endpoint serves more).
 */
export interface TemplateSummary {
  _id: string;
  name: string;
  icon?: string;
  ports: GroupPort[];
}

/** The block being dragged: a node kind (and type), or a workspace template. */
export interface PaletteBlock {
  kind?: string;
  typeId?: string;
  template?: TemplateSummary;
}

/**
 * The node kinds and their UI metadata, read with the page: the builder's
 * canvas, palette and inspector draw every block from them.
 */
export function useAutomationNodeKinds(apiUrl = "/api/automation") {
  return useApiData<NodeKindEntry[]>(`${apiUrl}/node-kinds`);
}
