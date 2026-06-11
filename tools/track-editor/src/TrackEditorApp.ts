import { buildTrackGeometry } from "@server/game/track_geometry_build";
import { polylineArcLengthM, recomputeLapLength } from "@server/game/track_exporter";
import { canonicalPolyline } from "@server/game/track_json";
import { generateDefaultPitLaneFields } from "@server/game/pit_lane_baseline";
import type {
  PitLanePointRole,
  PolylineNodeType,
  TrackJson,
  TrackReferenceOverlayJson,
} from "@server/game/track_json";
import { SvgTrack } from "@viewer/components/SvgTrack";
import type { TrackGeometryPayload } from "@viewer/ws/protocol";
import {
  fetchDraft,
  fetchDraftList,
  fetchTrack,
  fetchTrackList,
  saveDraft,
  type TrackListEntry,
} from "./apiClient";
import { compileAuthoringCenterline } from "./editor/authoringPreviewPath";
import {
  defaultReferenceOverlayPlacement,
  loadImageAspect,
  moveReferenceOverlay,
  readFileAsDataUrl,
  referenceOverlayWorldBounds,
  renderReferenceOverlay,
  scaleReferenceOverlay,
} from "./editor/referenceOverlay";
import {
  deleteAuthoringNodes,
  enableAuthoring,
  finalizeAuthoringTrack,
  getAuthoringNodes,
  hasAuthoring,
  insertAuthoringNodeOnSegment,
  isStraightAuthoringSegment,
  moveAuthoringNodes,
  moveAuthoringSegmentParallel,
  nudgeAuthoringNodes,
  setAuthoringNodeType,
  setAuthoringNodeWidth,
  setLayoutSegmentAttrs,
  setLayoutStartFinishNode,
  setPitSegmentSpeedLimit,
} from "./editor/authoringState";
import { EditorContextMenu, type ContextMenuItem } from "./editor/EditorContextMenu";
import {
  LAYOUT_NODE_TYPES,
  NODE_TYPE_COLORS,
  NODE_TYPE_LABELS,
  PIT_NODE_TYPES,
  PIT_ROLE_COLORS,
  PIT_ROLE_LABELS,
  START_FINISH_NODE_COLOR,
  START_FINISH_NODE_STROKE,
} from "./editor/pitEditorRoles";
import { TrackEditorHistory } from "./editor/trackEditorHistory";
import {
  deletePitVertex,
  deletePolylineVertex,
  findNearestSegment,
  getEditablePitPolyline,
  getEditablePolyline,
  handleIndices,
  insertPitVertexOnSegment,
  insertVertexOnSegment,
  movePitVertex,
  movePolylineVertex,
  pitHandleIndices,
  setPitVertexRole,
  type EditorSurface,
  type EditorTool,
} from "./editor/trackEditorGeometry";

export class TrackEditorApp {
  readonly root: HTMLElement;
  private toolbar: HTMLElement;
  private canvasWrap: HTMLElement;
  private canvasHost: HTMLElement;
  private handlesGroup: SVGGElement;
  private pitPathGroup: SVGGElement;
  private referenceMapGroup: SVGGElement;
  private referenceEditGroup: SVGGElement;
  private refFileInput: HTMLInputElement;
  private refOpacityInput: HTMLInputElement;
  private refFreezeBtn: HTMLButtonElement;
  private refRemoveBtn: HTMLButtonElement;
  private refPanelMeta: HTMLElement;
  private refDragMode: "move" | "scale" | null = null;
  private refDragSnapshot: TrackReferenceOverlayJson | null = null;
  private refTrackSnapshot: TrackJson | null = null;
  private sidebar: HTMLElement;
  private statusEl: HTMLElement;
  private trackSelect: HTMLSelectElement;
  private draftSelect: HTMLSelectElement;
  private draftNameInput: HTMLInputElement;
  private snapToggle: HTMLInputElement;
  private closedToggle: HTMLInputElement;
  private lapLengthInput: HTMLInputElement;
  private lapLengthExpectedEl: HTMLElement;
  private pitDerivedEl: HTMLElement;
  private sectorsList: HTMLElement;
  private pitFields: Record<string, HTMLInputElement> = {};
  private pitNodePanel: HTMLElement | null = null;
  private pitNodeMeta: HTMLElement | null = null;
  private pitNodeTypeSelect: HTMLSelectElement | null = null;
  private pitRoleSelect: HTMLSelectElement | null = null;
  private pitSegmentPanel: HTMLElement | null = null;
  private pitSegmentMeta: HTMLElement | null = null;
  private pitSegmentSpeedInput: HTMLInputElement | null = null;
  private layoutSegmentPanel: HTMLElement | null = null;
  private layoutSegmentMeta: HTMLElement | null = null;
  private layoutSegmentSpeedInput: HTMLInputElement | null = null;
  private layoutSegmentWidthInput: HTMLInputElement | null = null;
  private layoutSegmentStraightToggle: HTMLInputElement | null = null;
  private layoutNodeWidthInput: HTMLInputElement | null = null;
  private layoutNodeWidthField: HTMLElement | null = null;
  private showPitTarmacToggle: HTMLInputElement;
  private showPitTarmac = false;
  private contextMenu: EditorContextMenu;
  private layoutSimplifyBtn!: HTMLButtonElement;

  private svgTrack: SvgTrack;
  private track: TrackJson | null = null;
  private sourceLabel = "";
  private dirty = false;
  private surface: EditorSurface = "layout";
  private tool: EditorTool = "select";
  private selectedIndex: number | null = null;
  private selectedIndices = new Set<number>();
  private selectedSegmentIndex: number | null = null;
  private draggingIndex: number | null = null;
  private draggingSegmentIndex: number | null = null;
  private segmentDragAnchor: { x: number; z: number } | null = null;
  private trackList: TrackListEntry[] = [];
  private history = new TrackEditorHistory();
  private dragSnapshot: TrackJson | null = null;
  private undoBtn!: HTMLButtonElement;
  private redoBtn!: HTMLButtonElement;
  private saveBtn!: HTMLButtonElement;

  constructor(container: HTMLElement) {
    this.root = document.createElement("div");
    this.root.className = "te-app";

    this.toolbar = document.createElement("header");
    this.toolbar.className = "te-toolbar";
    this.root.appendChild(this.toolbar);

    const main = document.createElement("div");
    main.className = "te-main";
    this.root.appendChild(main);

    this.canvasWrap = document.createElement("div");
    this.canvasWrap.className = "te-canvas-wrap";
    main.appendChild(this.canvasWrap);

    this.canvasHost = document.createElement("div");
    this.canvasHost.className = "te-canvas-host te-canvas-host--zoomable";
    this.canvasWrap.appendChild(this.canvasHost);

    this.svgTrack = new SvgTrack(this.canvasHost, {
      zoomable: true,
      generousPan: true,
      maxZoom: 48,
    });

    this.referenceMapGroup = this.svgTrack.referenceMapLayer();

    const overlay = this.svgTrack.editorOverlay();
    this.referenceEditGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
    this.referenceEditGroup.setAttribute("class", "te-reference-edit");
    overlay.appendChild(this.referenceEditGroup);

    this.pitPathGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
    this.pitPathGroup.setAttribute("class", "te-pit-path");
    overlay.appendChild(this.pitPathGroup);

    this.handlesGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
    this.handlesGroup.setAttribute("class", "te-handles");
    overlay.appendChild(this.handlesGroup);

    this.sidebar = document.createElement("aside");
    this.sidebar.className = "te-sidebar";
    main.appendChild(this.sidebar);

    this.statusEl = document.createElement("footer");
    this.statusEl.className = "te-status";
    this.root.appendChild(this.statusEl);

    this.buildToolbar();
    this.buildSidebar();
    this.wireOverlay();
    this.wireReferenceOverlay();
    this.contextMenu = new EditorContextMenu(this.root);
    container.appendChild(this.root);

    void this.bootstrap();
  }

  private buildToolbar(): void {
    this.trackSelect = this.selectControl("Load track");
    this.draftSelect = this.selectControl("Load draft");
    this.draftNameInput = document.createElement("input");
    this.draftNameInput.type = "text";
    this.draftNameInput.className = "te-input";
    this.draftNameInput.placeholder = "draft_name.json";

    const loadTrackBtn = this.button("Load", () => void this.loadSelectedTrack());
    const loadDraftBtn = this.button("Open draft", () => void this.loadSelectedDraft());

    this.undoBtn = this.button("Undo", () => this.undo());
    this.redoBtn = this.button("Redo", () => this.redo());
    this.saveBtn = this.button("Save", () => void this.saveCurrentDraft());
    this.saveBtn.classList.add("te-btn--primary");
    this.saveBtn.title = "Save draft (Ctrl+S)";

    const layoutSurfaceBtn = this.surfaceButton("Layout", "layout");
    const pitSurfaceBtn = this.surfaceButton("Pit lane", "pit");
    const selectBtn = this.toolButton("Select", "select");
    const addBtn = this.toolButton("Add point", "add");
    const resetViewBtn = this.button("Reset view", () => this.svgTrack.resetView());

    const zoomHint = document.createElement("span");
    zoomHint.className = "te-zoom-hint";
    zoomHint.textContent =
      "Space+drag pan · arrows nudge node (Alt 0.25 m, Shift 10 m) · scroll zoom · Ctrl+S save";

    this.snapToggle = document.createElement("input");
    this.snapToggle.type = "checkbox";
    this.snapToggle.id = "te-snap";
    const snapLabel = document.createElement("label");
    snapLabel.htmlFor = "te-snap";
    snapLabel.textContent = "Snap 10 m";
    snapLabel.prepend(this.snapToggle);

    this.showPitTarmacToggle = document.createElement("input");
    this.showPitTarmacToggle.type = "checkbox";
    this.showPitTarmacToggle.id = "te-show-pit-tarmac";
    const pitTarmacLabel = document.createElement("label");
    pitTarmacLabel.htmlFor = "te-show-pit-tarmac";
    pitTarmacLabel.textContent = "Pit tarmac";
    pitTarmacLabel.title = "Show pit lane asphalt while editing layout";
    pitTarmacLabel.prepend(this.showPitTarmacToggle);
    this.showPitTarmacToggle.addEventListener("change", () => {
      this.showPitTarmac = this.showPitTarmacToggle.checked;
      this.refreshLayerVisibility();
    });

    this.layoutSimplifyBtn = this.button("Simplify to nodes", () => this.simplifyToAuthoring());
    this.layoutSimplifyBtn.title = "Collapse dense polyline into normal/turn nodes";

    this.toolbar.append(
      this.toolbarGroup("Catalog", this.trackSelect, loadTrackBtn),
      this.toolbarGroup("Drafts", this.draftSelect, loadDraftBtn),
      this.toolbarGroup("File", this.draftNameInput, this.saveBtn),
      this.toolbarGroup("Edit", this.undoBtn, this.redoBtn, this.layoutSimplifyBtn),
      this.toolbarGroup("Surface", layoutSurfaceBtn, pitSurfaceBtn),
      this.toolbarGroup("Tools", selectBtn, addBtn, resetViewBtn, snapLabel, pitTarmacLabel),
      zoomHint,
    );
    this.updateHistoryButtons();
  }

  private buildSidebar(): void {
    this.sidebar.innerHTML = `
      <h2 class="te-sidebar-title">Track</h2>
      <div class="te-field">
        <label>Name <input type="text" class="te-input" data-field="name" /></label>
      </div>
      <div class="te-field te-field-inline">
        <label><input type="checkbox" data-field="closed" /> Closed circuit</label>
      </div>
      <div class="te-lap-length-panel">
        <label class="te-field">Lap length (stored, m)
          <input type="number" step="0.1" min="0" class="te-input te-input-num" data-field="lap-length" />
        </label>
        <p class="te-meta" data-field="lap-length-expected">Polyline measures — m</p>
        <button type="button" class="te-btn te-btn--small" data-lap-use-measured hidden>Use measured length</button>
      </div>
      <h3 class="te-sidebar-sub">Pit lane</h3>
      <div class="te-pit-actions" data-pit-actions></div>
      <div class="te-pit-grid" data-pit-grid></div>
      <div class="te-pit-derived" data-pit-derived>
        <p class="te-meta te-pit-derived-title">From pit nodes (auto)</p>
        <dl class="te-derived-list" data-pit-derived-list></dl>
      </div>
      <div class="te-pit-role-panel" data-pit-node-panel hidden>
        <p class="te-meta" data-pit-node-meta></p>
        <label class="te-field" data-pit-node-type-field>Node type
          <select class="te-select" data-pit-node-type></select>
        </label>
        <label class="te-field" data-pit-role-field hidden>Node role
          <select class="te-select" data-pit-role></select>
        </label>
        <label class="te-field" data-layout-node-width-field hidden>Track width at node (m)
          <input type="number" step="0.5" min="1" class="te-input te-input-num" data-layout-node-width />
        </label>
        <p class="te-meta" data-layout-node-width-hint hidden>Applies on the segment approaching this node · empty = default</p>
      </div>
      <div class="te-pit-segment-panel" data-pit-segment-panel hidden>
        <p class="te-meta" data-pit-segment-meta></p>
        <label class="te-field">Segment speed limit (m/s)
          <input type="number" step="0.1" class="te-input te-input-num" data-pit-segment-speed />
        </label>
      </div>
      <div class="te-layout-segment-panel" data-layout-segment-panel hidden>
        <p class="te-meta" data-layout-segment-meta></p>
        <label class="te-field">Max speed (m/s)
          <input type="number" step="0.1" class="te-input te-input-num" data-layout-segment-speed />
        </label>
        <label class="te-field">Width (m)
          <input type="number" step="0.1" class="te-input te-input-num" data-layout-segment-width />
        </label>
        <label class="te-field te-field-inline">
          <input type="checkbox" data-layout-segment-straight /> Mark straight
        </label>
      </div>
      <h3 class="te-sidebar-sub">Reference image</h3>
      <div class="te-ref-panel" data-ref-panel>
        <p class="te-meta" data-ref-meta>No reference image.</p>
        <div class="te-ref-actions">
          <button type="button" class="te-btn" data-ref-import>Import PNG/SVG…</button>
          <button type="button" class="te-btn" data-ref-freeze hidden>Freeze to map</button>
          <button type="button" class="te-btn" data-ref-unfreeze hidden>Unfreeze</button>
          <button type="button" class="te-btn te-btn--danger" data-ref-remove hidden>Remove</button>
        </div>
        <label class="te-field" data-ref-opacity-field hidden>Opacity
          <input type="range" min="0.15" max="1" step="0.05" value="0.55" data-ref-opacity />
        </label>
      </div>
      <h3 class="te-sidebar-sub">Sectors</h3>
      <div class="te-sectors" data-sectors></div>
    `;

    this.closedToggle = this.sidebar.querySelector(
      '[data-field="closed"]',
    ) as HTMLInputElement;
    this.lapLengthInput = this.sidebar.querySelector(
      '[data-field="lap-length"]',
    ) as HTMLInputElement;
    this.lapLengthExpectedEl = this.sidebar.querySelector(
      "[data-field=lap-length-expected]",
    ) as HTMLElement;
    this.pitDerivedEl = this.sidebar.querySelector("[data-pit-derived-list]") as HTMLElement;
    this.lapLengthInput.addEventListener("change", () => this.updateLapLengthFromField());
    this.sidebar
      .querySelector("[data-lap-use-measured]")
      ?.addEventListener("click", () => this.applyMeasuredLapLength());
    this.sectorsList = this.sidebar.querySelector("[data-sectors]") as HTMLElement;

    const nameInput = this.sidebar.querySelector(
      '[data-field="name"]',
    ) as HTMLInputElement;
    nameInput.addEventListener("change", () => {
      if (!this.track) return;
      this.mutateTrack((t) => ({ ...t, name: nameInput.value }));
    });

    this.closedToggle.addEventListener("change", () => {
      if (!this.track) return;
      this.mutateTrack((t) => ({ ...t, closed: this.closedToggle.checked }));
    });

    this.refPanelMeta = this.sidebar.querySelector("[data-ref-meta]") as HTMLElement;
    this.refOpacityInput = this.sidebar.querySelector("[data-ref-opacity]") as HTMLInputElement;
    this.refFreezeBtn = this.sidebar.querySelector("[data-ref-freeze]") as HTMLButtonElement;
    const refUnfreezeBtn = this.sidebar.querySelector("[data-ref-unfreeze]") as HTMLButtonElement;
    this.refRemoveBtn = this.sidebar.querySelector("[data-ref-remove]") as HTMLButtonElement;
    const refImportBtn = this.sidebar.querySelector("[data-ref-import]") as HTMLButtonElement;
    const refOpacityField = this.sidebar.querySelector(
      "[data-ref-opacity-field]",
    ) as HTMLElement;

    this.refFileInput = document.createElement("input");
    this.refFileInput.type = "file";
    this.refFileInput.accept = "image/png,image/svg+xml,.png,.svg";
    this.refFileInput.hidden = true;
    this.root.appendChild(this.refFileInput);

    refImportBtn.addEventListener("click", () => this.refFileInput.click());
    this.refFileInput.addEventListener("change", () => void this.importReferenceImage());
    this.refFreezeBtn.addEventListener("click", () => this.setReferenceFrozen(true));
    refUnfreezeBtn.addEventListener("click", () => this.setReferenceFrozen(false));
    this.refRemoveBtn.addEventListener("click", () => this.removeReferenceOverlay());
    this.refOpacityInput.addEventListener("input", () => {
      if (!this.track?.reference_overlay) return;
      const opacity = Number(this.refOpacityInput.value);
      this.track = {
        ...this.track,
        reference_overlay: { ...this.track.reference_overlay, opacity },
      };
      this.markDirty();
      this.syncReferenceOverlayRender();
    });

    const pitActions = this.sidebar.querySelector("[data-pit-actions]") as HTMLElement;
    const regenBtn = this.button("Generate baseline pit", () => this.regeneratePitBaseline());
    regenBtn.title = "Rebuild pit_lane.polyline from legacy offset algorithm";
    const simplifyBtn = this.button("Simplify pit nodes", () => this.simplifyToAuthoring());
    simplifyBtn.title = "Collapse dense pit polyline into join/normal/turn nodes";
    pitActions.append(regenBtn, simplifyBtn);

    this.pitNodePanel = this.sidebar.querySelector("[data-pit-node-panel]") as HTMLElement;
    this.pitNodeMeta = this.sidebar.querySelector("[data-pit-node-meta]") as HTMLElement;
    this.pitNodeTypeSelect = this.sidebar.querySelector("[data-pit-node-type]") as HTMLSelectElement;
    this.pitRoleSelect = this.sidebar.querySelector("[data-pit-role]") as HTMLSelectElement;
    this.pitSegmentPanel = this.sidebar.querySelector("[data-pit-segment-panel]") as HTMLElement;
    this.pitSegmentMeta = this.sidebar.querySelector("[data-pit-segment-meta]") as HTMLElement;
    this.pitSegmentSpeedInput = this.sidebar.querySelector(
      "[data-pit-segment-speed]",
    ) as HTMLInputElement;

    for (const type of PIT_NODE_TYPES) {
      const opt = document.createElement("option");
      opt.value = type;
      opt.textContent = NODE_TYPE_LABELS[type];
      this.pitNodeTypeSelect.appendChild(opt);
    }
    this.pitNodeTypeSelect.addEventListener("change", () => this.updatePitNodeTypeFromSelect());
    this.layoutNodeWidthField = this.sidebar.querySelector(
      "[data-layout-node-width-field]",
    ) as HTMLElement;
    this.layoutNodeWidthInput = this.sidebar.querySelector(
      "[data-layout-node-width]",
    ) as HTMLInputElement;
    this.layoutNodeWidthInput.addEventListener("change", () => this.updateLayoutNodeWidthFromField());

    for (const role of ["entry", "box", "exit", "waypoint"] as const) {
      const opt = document.createElement("option");
      opt.value = role;
      opt.textContent = PIT_ROLE_LABELS[role];
      this.pitRoleSelect.appendChild(opt);
    }
    this.pitRoleSelect.addEventListener("change", () => this.updatePitRoleFromSelect());
    this.pitSegmentSpeedInput.addEventListener("change", () => this.updateSegmentSpeedFromField());

    this.layoutSegmentPanel = this.sidebar.querySelector(
      "[data-layout-segment-panel]",
    ) as HTMLElement;
    this.layoutSegmentMeta = this.sidebar.querySelector(
      "[data-layout-segment-meta]",
    ) as HTMLElement;
    this.layoutSegmentSpeedInput = this.sidebar.querySelector(
      "[data-layout-segment-speed]",
    ) as HTMLInputElement;
    this.layoutSegmentWidthInput = this.sidebar.querySelector(
      "[data-layout-segment-width]",
    ) as HTMLInputElement;
    this.layoutSegmentStraightToggle = this.sidebar.querySelector(
      "[data-layout-segment-straight]",
    ) as HTMLInputElement;
    this.layoutSegmentSpeedInput.addEventListener("change", () =>
      this.updateLayoutSegmentFromFields(),
    );
    this.layoutSegmentWidthInput.addEventListener("change", () =>
      this.updateLayoutSegmentFromFields(),
    );
    this.layoutSegmentStraightToggle.addEventListener("change", () =>
      this.updateLayoutSegmentFromFields(),
    );

    const pitGrid = this.sidebar.querySelector("[data-pit-grid]") as HTMLElement;
    for (const key of [
      "width_m",
      "offset_m",
      "merge_lateral_offset",
      "merge_blend_m",
      "speed_limit_ms",
    ] as const) {
      const label = document.createElement("label");
      label.className = "te-field";
      label.textContent = `${key}: `;
      const input = document.createElement("input");
      input.type = "number";
      input.step = "0.1";
      input.className = "te-input te-input-num";
      input.dataset.pit = key;
      input.addEventListener("change", () => this.updatePitFromFields());
      label.appendChild(input);
      pitGrid.appendChild(label);
      this.pitFields[key] = input;
    }
  }

  private async bootstrap(): Promise<void> {
    try {
      this.trackList = await fetchTrackList();
      this.trackSelect.replaceChildren();
      for (const t of this.trackList) {
        const opt = document.createElement("option");
        opt.value = t.id;
        opt.textContent = t.displayName;
        this.trackSelect.appendChild(opt);
      }
      await this.refreshDraftList();
      await this.loadTrack("sample_circuit");
      this.setStatus("Ready · left-drag handles · pan: Space+drag or middle mouse");
    } catch (err) {
      this.setStatus(`Failed to connect to API: ${String(err)}`, true);
    }
  }

  private async refreshDraftList(): Promise<void> {
    const drafts = await fetchDraftList();
    this.draftSelect.replaceChildren();
    const empty = document.createElement("option");
    empty.value = "";
    empty.textContent = drafts.length ? "— pick draft —" : "— no drafts —";
    this.draftSelect.appendChild(empty);
    for (const name of drafts) {
      const opt = document.createElement("option");
      opt.value = name;
      opt.textContent = name;
      this.draftSelect.appendChild(opt);
    }
  }

  private async loadSelectedTrack(): Promise<void> {
    const id = this.trackSelect.value;
    if (!id) return;
    await this.loadTrack(id);
  }

  private async loadTrack(trackId: string): Promise<void> {
    const track = await fetchTrack(trackId);
    const entry = this.trackList.find((t) => t.id === trackId);
    this.setTrack(track, entry?.displayName ?? trackId);
  }

  private async loadSelectedDraft(): Promise<void> {
    const name = this.draftSelect.value;
    if (!name) return;
    const track = await fetchDraft(name);
    this.draftNameInput.value = name;
    this.setTrack(track, `draft:${name}`);
    await this.refreshDraftList();
  }

  private async saveCurrentDraft(): Promise<void> {
    if (!this.track) return;
    let name = this.draftNameInput.value.trim();
    if (!name) name = `draft_${Date.now()}.json`;
    if (!name.endsWith(".json")) name += ".json";
    try {
      const path = await saveDraft(name, this.track);
      this.dirty = false;
      this.draftNameInput.value = name;
      await this.refreshDraftList();
      this.draftSelect.value = name;
      this.setStatus(`Saved ${path}`);
    } catch (err) {
      this.setStatus(`Save failed: ${String(err)}`, true);
    }
  }

  private setTrack(track: TrackJson, label: string): void {
    this.track = finalizeAuthoringTrack(structuredClone(track));
    this.sourceLabel = label;
    this.dirty = false;
    this.clearSelection();
    this.dragSnapshot = null;
    this.history.clear();
    this.updateHistoryButtons();
    this.syncSidebarFromTrack();
    this.refreshPreview();
    this.setStatus(`Loaded ${label}`);
  }

  private mutateTrack(mutator: (track: TrackJson) => TrackJson): void {
    if (!this.track) return;
    this.history.record(this.track);
    this.track = finalizeAuthoringTrack(mutator(structuredClone(this.track)));
    this.updateHistoryButtons();
    this.markDirty();
    this.syncSidebarFromTrack();
    this.refreshPreview();
  }

  private applyHistoryTrack(track: TrackJson): void {
    this.track = finalizeAuthoringTrack(structuredClone(track));
    this.clearSelection();
    this.markDirty();
    this.updateHistoryButtons();
    this.syncSidebarFromTrack();
    this.refreshPreview();
  }

  private undo(): void {
    if (!this.track) return;
    const prev = this.history.undo(this.track);
    if (!prev) return;
    this.applyHistoryTrack(prev);
    this.setStatus(`${this.sourceLabel} · undone`);
  }

  private redo(): void {
    if (!this.track) return;
    const next = this.history.redo(this.track);
    if (!next) return;
    this.applyHistoryTrack(next);
    this.setStatus(`${this.sourceLabel} · redone`);
  }

  private updateHistoryButtons(): void {
    this.undoBtn.disabled = !this.history.canUndo();
    this.redoBtn.disabled = !this.history.canRedo();
  }

  private syncSidebarFromTrack(): void {
    if (!this.track) return;
    const nameInput = this.sidebar.querySelector(
      '[data-field="name"]',
    ) as HTMLInputElement;
    nameInput.value = this.track.name;
    this.closedToggle.checked = this.track.closed ?? true;
    this.syncLapLengthFields();

    const pit = this.track.pit_lane ?? {};
    for (const [key, input] of Object.entries(this.pitFields)) {
      const val = pit[key as keyof typeof pit];
      input.value = val != null ? String(val) : "";
    }
    this.syncPitDerivedPanel();

    this.renderSectors();
    this.syncPitInspectorPanel();
    this.syncReferenceOverlayPanel();
  }

  private clearSelection(): void {
    this.selectedIndex = null;
    this.selectedIndices.clear();
    this.selectedSegmentIndex = null;
  }

  private selectNode(index: number, additive: boolean): void {
    if (additive) {
      if (this.selectedIndices.has(index)) this.selectedIndices.delete(index);
      else this.selectedIndices.add(index);
    } else {
      this.selectedIndices = new Set([index]);
    }
    this.selectedIndex = this.selectedIndices.size ? Math.min(...this.selectedIndices) : null;
    this.selectedSegmentIndex = null;
  }

  private syncPitInspectorPanel(): void {
    if (!this.pitNodePanel || !this.pitNodeMeta || !this.track) return;
    const authoring = hasAuthoring(this.track, this.surface);
    const nodeTypeField = this.sidebar.querySelector("[data-pit-node-type-field]") as HTMLElement;
    const roleField = this.sidebar.querySelector("[data-pit-role-field]") as HTMLElement;
    const showNode =
      this.selectedIndex != null &&
      this.selectedSegmentIndex == null &&
      (this.surface === "pit" ? authoring : this.surface === "layout" && authoring);
    this.pitNodePanel.hidden = !showNode;
    if (this.pitSegmentPanel) {
      this.pitSegmentPanel.hidden = !(this.surface === "pit" && this.selectedSegmentIndex != null && authoring);
    }
    if (this.layoutSegmentPanel) {
      this.layoutSegmentPanel.hidden = !(this.surface === "layout" && this.selectedSegmentIndex != null && authoring);
    }
    if (!showNode) return;

    if (authoring && this.pitNodeTypeSelect) {
      nodeTypeField.hidden = false;
      roleField.hidden = true;
      const nodes = getAuthoringNodes(this.track, this.surface);
      const node = nodes[this.selectedIndex!];
      if (!node) return;
      const allowed = this.surface === "pit" ? PIT_NODE_TYPES : LAYOUT_NODE_TYPES;
      this.pitNodeTypeSelect.replaceChildren();
      for (const type of allowed) {
        const opt = document.createElement("option");
        opt.value = type;
        opt.textContent = NODE_TYPE_LABELS[type];
        this.pitNodeTypeSelect.appendChild(opt);
      }
      const multi =
        this.selectedIndices.size > 1 ? ` (+${this.selectedIndices.size - 1} selected)` : "";
      const sfTag = node.start_finish ? " · Start/finish (t=0)" : "";
      this.pitNodeMeta.textContent = `Node #${this.selectedIndex} · ${NODE_TYPE_LABELS[node.type]}${sfTag}${multi}`;
      this.pitNodeTypeSelect.value = node.type;
      const showWidth = this.surface === "layout";
      const widthHint = this.sidebar.querySelector(
        "[data-layout-node-width-hint]",
      ) as HTMLElement;
      if (this.layoutNodeWidthField) this.layoutNodeWidthField.hidden = !showWidth;
      if (widthHint) widthHint.hidden = !showWidth;
      if (this.layoutNodeWidthInput && showWidth) {
        const defaultW = this.track.track_width_m ?? 12;
        this.layoutNodeWidthInput.placeholder = String(defaultW);
        this.layoutNodeWidthInput.value =
          node.width_m != null ? String(node.width_m) : "";
      }
      return;
    }

    if (this.surface !== "pit") return;
    nodeTypeField.hidden = true;
    roleField.hidden = false;
    if (!this.pitRoleSelect) return;
    const points = getEditablePitPolyline(this.track);
    const pt = points[this.selectedIndex!];
    if (!pt) return;
    this.pitNodeMeta.textContent = `Pit point #${this.selectedIndex} · ${PIT_ROLE_LABELS[pt.role]}`;
    this.pitRoleSelect.value = pt.role;
  }

  private syncPitSegmentPanel(): void {
    if (!this.pitSegmentPanel || !this.pitSegmentMeta || !this.pitSegmentSpeedInput || !this.track) {
      return;
    }
    const show =
      this.surface === "pit" &&
      this.selectedSegmentIndex != null &&
      hasAuthoring(this.track, "pit");
    this.pitSegmentPanel.hidden = !show;
    if (!show || this.selectedSegmentIndex == null) return;
    const seg = this.track.pit_lane?.authoring?.segments?.[this.selectedSegmentIndex];
    this.pitSegmentMeta.textContent = `Segment #${this.selectedSegmentIndex} · right-click for attributes`;
    this.pitSegmentSpeedInput.value =
      seg?.speed_limit_ms != null ? String(seg.speed_limit_ms) : "";
  }

  private syncLayoutSegmentPanel(): void {
    if (
      !this.layoutSegmentPanel ||
      !this.layoutSegmentMeta ||
      !this.layoutSegmentSpeedInput ||
      !this.layoutSegmentWidthInput ||
      !this.layoutSegmentStraightToggle ||
      !this.track
    ) {
      return;
    }
    const show =
      this.surface === "layout" &&
      this.selectedSegmentIndex != null &&
      hasAuthoring(this.track, "layout");
    this.layoutSegmentPanel.hidden = !show;
    if (!show || this.selectedSegmentIndex == null) return;
    const seg = this.track.authoring?.segments?.[this.selectedSegmentIndex];
    this.layoutSegmentMeta.textContent = `Segment #${this.selectedSegmentIndex} · right-click for attributes`;
    this.layoutSegmentSpeedInput.value = seg?.max_speed_ms != null ? String(seg.max_speed_ms) : "";
    this.layoutSegmentWidthInput.value = seg?.width_m != null ? String(seg.width_m) : "";
    this.layoutSegmentStraightToggle.checked = seg?.straight ?? false;
  }

  private updatePitNodeTypeFromSelect(): void {
    if (!this.track || this.selectedIndex == null || !this.pitNodeTypeSelect) return;
    const type = this.pitNodeTypeSelect.value as PolylineNodeType;
    this.mutateTrack((t) => setAuthoringNodeType(t, this.surface, this.selectedIndex!, type));
  }

  private updateLayoutNodeWidthFromField(): void {
    if (!this.track || this.selectedIndex == null || !this.layoutNodeWidthInput) return;
    const raw = this.layoutNodeWidthInput.value.trim();
    const width_m = raw === "" ? undefined : Number(raw);
    this.mutateTrack((t) =>
      setAuthoringNodeWidth(t, "layout", this.selectedIndex!, width_m),
    );
  }

  private updateSegmentSpeedFromField(): void {
    if (!this.track || this.selectedSegmentIndex == null || !this.pitSegmentSpeedInput) return;
    const raw = this.pitSegmentSpeedInput.value.trim();
    const speed = raw === "" ? undefined : Number(raw);
    this.mutateTrack((t) => setPitSegmentSpeedLimit(t, this.selectedSegmentIndex!, speed));
  }

  private updateLayoutSegmentFromFields(): void {
    if (
      !this.track ||
      this.selectedSegmentIndex == null ||
      !this.layoutSegmentSpeedInput ||
      !this.layoutSegmentWidthInput ||
      !this.layoutSegmentStraightToggle
    ) {
      return;
    }
    const speedRaw = this.layoutSegmentSpeedInput.value.trim();
    const widthRaw = this.layoutSegmentWidthInput.value.trim();
    this.mutateTrack((t) =>
      setLayoutSegmentAttrs(t, this.selectedSegmentIndex!, {
        max_speed_ms: speedRaw === "" ? undefined : Number(speedRaw),
        width_m: widthRaw === "" ? undefined : Number(widthRaw),
        straight: this.layoutSegmentStraightToggle.checked,
      }),
    );
  }

  private simplifyToAuthoring(): void {
    if (!this.track) return;
    this.mutateTrack((t) => enableAuthoring(t, this.surface));
    this.setStatus(
      `${this.sourceLabel} · ${this.surface} simplified to authoring nodes · right-click nodes/segments`,
    );
  }

  private updatePitRoleFromSelect(): void {
    if (!this.track || this.selectedIndex == null || !this.pitRoleSelect) return;
    const role = this.pitRoleSelect.value as PitLanePointRole;
    this.mutateTrack((t) => setPitVertexRole(t, this.selectedIndex!, role));
  }

  private regeneratePitBaseline(): void {
    if (!this.track) return;
    this.surface = "pit";
    this.toolbar
      .querySelectorAll("[data-surface]")
      .forEach((el) => el.classList.remove("te-tool--active"));
    this.toolbar.querySelector('[data-surface="pit"]')?.classList.add("te-tool--active");
    this.mutateTrack((t) =>
      enableAuthoring({ ...t, pit_lane: generateDefaultPitLaneFields(t) }, "pit"),
    );
    this.setStatus(`${this.sourceLabel} · pit baseline generated (entry_t → exit_t)`);
  }

  private renderSectors(): void {
    this.sectorsList.replaceChildren();
    if (!this.track?.sectors?.length) {
      this.sectorsList.textContent = "No sectors";
      return;
    }
    for (let i = 0; i < this.track.sectors.length; i++) {
      const sector = this.track.sectors[i];
      const row = document.createElement("div");
      row.className = "te-sector-row";
      row.innerHTML = `
        <input type="text" class="te-input" data-sector-name />
        <input type="number" step="0.0001" min="0" max="1" class="te-input te-input-num" data-sector-start />
        <input type="number" step="0.0001" min="0" max="1" class="te-input te-input-num" data-sector-end />
      `;
      const nameEl = row.querySelector("[data-sector-name]") as HTMLInputElement;
      const startEl = row.querySelector("[data-sector-start]") as HTMLInputElement;
      const endEl = row.querySelector("[data-sector-end]") as HTMLInputElement;
      nameEl.value = sector.name;
      startEl.value = String(sector.start_t);
      endEl.value = String(sector.end_t);
      const onChange = () => {
        if (!this.track?.sectors) return;
        this.mutateTrack((t) => {
          const sectors = [...(t.sectors ?? [])];
          sectors[i] = {
            ...sectors[i],
            name: nameEl.value,
            start_t: Number(startEl.value),
            end_t: Number(endEl.value),
          };
          return { ...t, sectors };
        });
      };
      nameEl.addEventListener("change", onChange);
      startEl.addEventListener("change", onChange);
      endEl.addEventListener("change", onChange);
      this.sectorsList.appendChild(row);
    }
  }

  private updatePitFromFields(): void {
    if (!this.track) return;
    this.mutateTrack((t) => {
      const pit: NonNullable<TrackJson["pit_lane"]> = { ...t.pit_lane };
      for (const [key, input] of Object.entries(this.pitFields)) {
        const raw = input.value.trim();
        if (!raw) {
          delete pit[key as keyof typeof pit];
        } else {
          pit[key as keyof typeof pit] = Number(raw);
        }
      }
      return {
        ...t,
        pit_lane: Object.keys(pit).length > 0 ? pit : undefined,
      };
    });
  }

  private snapM(): number {
    return this.snapToggle.checked ? 10 : 0;
  }

  private geometryPayload(): TrackGeometryPayload {
    if (!this.track) return emptyGeometry();
    return buildTrackGeometry(this.track, this.track.name);
  }

  private refreshPreview(): void {
    const geometry = this.geometryPayload();
    const ref = this.track?.reference_overlay;
    this.svgTrack.setEditorAuxWorldBounds(
      ref?.href ? referenceOverlayWorldBounds(ref) : null,
    );
    this.svgTrack.setGeometry(geometry);
    this.refreshLayerVisibility();
    this.syncReferenceOverlayRender();
    this.renderHandles();
    this.syncLapLengthFields();
    this.syncPitDerivedPanel();
  }

  private refreshLayerVisibility(): void {
    this.svgTrack.setLayerVisibility({
      sectors: this.surface === "layout",
      labels: this.surface === "layout",
      pit: this.showPitTarmac,
    });
  }

  private syncReferenceOverlayRender(): void {
    renderReferenceOverlay(
      this.referenceMapGroup,
      this.referenceEditGroup,
      this.track?.reference_overlay,
      this.svgTrack,
    );
  }

  private syncReferenceOverlayPanel(): void {
    const overlay = this.track?.reference_overlay;
    const has = Boolean(overlay?.href);
    const frozen = overlay?.frozen ?? false;
    this.refPanelMeta.textContent = has
      ? frozen
        ? "Frozen — pans and zooms with the map."
        : "Drag to move · corner handle to scale · then freeze."
      : "Import a PNG or SVG to trace over the circuit.";
    this.refFreezeBtn.hidden = !has || frozen;
    const unfreezeBtn = this.sidebar.querySelector("[data-ref-unfreeze]") as HTMLButtonElement;
    unfreezeBtn.hidden = !has || !frozen;
    this.refRemoveBtn.hidden = !has;
    const opacityField = this.sidebar.querySelector(
      "[data-ref-opacity-field]",
    ) as HTMLElement;
    opacityField.hidden = !has;
    if (has && overlay) {
      this.refOpacityInput.value = String(overlay.opacity ?? 0.55);
    }
  }

  private async importReferenceImage(): Promise<void> {
    const file = this.refFileInput.files?.[0];
    this.refFileInput.value = "";
    if (!file || !this.track) return;
    try {
      const href = await readFileAsDataUrl(file);
      const aspect = await loadImageAspect(href);
      const placement = defaultReferenceOverlayPlacement(this.track, aspect);
      this.mutateTrack((t) => ({
        ...t,
        reference_overlay: { href, ...placement },
      }));
      this.setStatus(`${this.sourceLabel} · reference image imported`);
    } catch (err) {
      this.setStatus(`Import failed: ${String(err)}`, true);
    }
  }

  private setReferenceFrozen(frozen: boolean): void {
    if (!this.track?.reference_overlay) return;
    this.mutateTrack((t) => ({
      ...t,
      reference_overlay: { ...t.reference_overlay!, frozen },
    }));
    this.setStatus(
      frozen
        ? `${this.sourceLabel} · reference frozen to map`
        : `${this.sourceLabel} · reference unfrozen`,
    );
  }

  private removeReferenceOverlay(): void {
    if (!this.track?.reference_overlay) return;
    this.mutateTrack((t) => {
      const next = { ...t };
      delete next.reference_overlay;
      return next;
    });
    this.refDragMode = null;
    this.refDragSnapshot = null;
    this.refTrackSnapshot = null;
  }

  private wireReferenceOverlay(): void {
    this.referenceEditGroup.addEventListener("pointerdown", (e) =>
      this.onReferencePointerDown(e),
    );
  }

  private onReferencePointerDown(e: PointerEvent): void {
    const target = e.target as SVGElement;
    if (!this.track?.reference_overlay || this.track.reference_overlay.frozen) return;
    if (
      !target.classList.contains("te-ref-interactive") &&
      !target.classList.contains("te-ref-image")
    ) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    this.svgTrack.setEditorPanSuspended(true);
    this.refTrackSnapshot = structuredClone(this.track);
    this.refDragSnapshot = structuredClone(this.track.reference_overlay);
    this.refDragMode = target.classList.contains("te-ref-scale-handle") ? "scale" : "move";
    this.referenceEditGroup.setPointerCapture(e.pointerId);
    this.referenceEditGroup.classList.add("te-ref-dragging");
  }

  private onReferencePointerMove(e: PointerEvent): void {
    if (this.refDragMode == null || !this.refDragSnapshot || !this.track?.reference_overlay) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    const svgPt = this.clientToSvg(e);
    const world = this.svgToWorld(svgPt.x, svgPt.y);
    if (!world) return;

    const snap = this.snapM();
    const snapV = snap > 0 ? (v: number) => Math.round(v / snap) * snap : (v: number) => v;
    let next = this.track.reference_overlay;

    if (this.refDragMode === "move") {
      next = moveReferenceOverlay(
        this.refDragSnapshot,
        snapV(world.x),
        snapV(world.z),
      );
    } else {
      const wx = Math.abs(world.x - this.refDragSnapshot.center_x);
      const wz = Math.abs(world.z - this.refDragSnapshot.center_z);
      const width_m = Math.max(20, 2 * Math.max(wx, wz * this.refDragSnapshot.aspect));
      next = scaleReferenceOverlay(this.refDragSnapshot, snap > 0 ? snapV(width_m) : width_m);
    }

    this.track = { ...this.track, reference_overlay: next };
    this.markDirty();
    this.syncReferenceOverlayRender();
  }

  private onReferencePointerUp(e: PointerEvent): void {
    if (this.refDragMode == null) return;
    if (this.refTrackSnapshot && this.track) {
      this.history.recordDragIfChanged(this.refTrackSnapshot, this.track);
      this.updateHistoryButtons();
      if (this.history.canUndo()) this.markDirty();
    }
    this.refDragMode = null;
    this.refDragSnapshot = null;
    this.refTrackSnapshot = null;
    this.referenceEditGroup.classList.remove("te-ref-dragging");
    this.svgTrack.setEditorPanSuspended(false);
    try {
      this.referenceEditGroup.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
  }

  /** Fast overlay refresh while dragging — skips full tarmac rebuild. */
  private refreshAuthoringDragPreview(): void {
    this.renderHandles();
  }

  private chordLapLengthM(): number {
    if (!this.track) return 0;
    const poly = canonicalPolyline(this.track).map((p) => ({ x: p.x, z: p.z }));
    return polylineArcLengthM(poly, this.track.closed ?? true);
  }

  private suggestedLapLengthM(): number {
    if (!this.track) return 0;
    return recomputeLapLength(this.track);
  }

  private syncLapLengthFields(): void {
    if (!this.track) return;
    const stored = this.track.lap_length;
    const suggested = this.suggestedLapLengthM();
    const chord = this.chordLapLengthM();
    this.lapLengthInput.value = stored != null ? String(stored) : "";
    if (suggested <= 0) {
      this.lapLengthExpectedEl.textContent = "Suggested lap length — m";
    } else if (chord > 0 && Math.abs(chord - suggested) > 1) {
      this.lapLengthExpectedEl.textContent =
        `Suggested ${suggested.toFixed(1)} m (polyline chord ${chord.toFixed(1)} m)`;
    } else {
      this.lapLengthExpectedEl.textContent = `Suggested ${suggested.toFixed(1)} m (from layout polyline)`;
    }
    const useMeasuredBtn = this.sidebar.querySelector(
      "[data-lap-use-measured]",
    ) as HTMLButtonElement;
    const drift =
      stored != null && suggested > 0 && Math.abs(stored - suggested) / suggested > 0.02;
    useMeasuredBtn.hidden = !drift;
    useMeasuredBtn.textContent = "Use suggested lap length";
  }

  private updateLapLengthFromField(): void {
    if (!this.track) return;
    const raw = this.lapLengthInput.value.trim();
    const lap_length = raw === "" ? undefined : Number(raw);
    this.mutateTrack((t) => ({
      ...t,
      lap_length: lap_length != null && lap_length > 0 ? lap_length : t.lap_length,
    }));
  }

  private applyMeasuredLapLength(): void {
    if (!this.track) return;
    const suggested = this.suggestedLapLengthM();
    if (suggested <= 0) return;
    this.mutateTrack((t) => ({ ...t, lap_length: suggested }));
  }

  private syncPitDerivedPanel(): void {
    if (!this.pitDerivedEl || !this.track) return;
    const pit = this.track.pit_lane;
    this.pitDerivedEl.replaceChildren();
    if (!pit) {
      const empty = document.createElement("p");
      empty.className = "te-meta";
      empty.textContent = "No pit lane.";
      this.pitDerivedEl.appendChild(empty);
      return;
    }

    const rows: Array<{ term: string; value: string; hint?: string }> = [
      {
        term: "entry_t",
        value: pit.entry_t != null ? pit.entry_t.toFixed(4) : "—",
        hint: "Racing-line t where cars peel in (from entry join node)",
      },
      {
        term: "exit_t",
        value: pit.exit_t != null ? pit.exit_t.toFixed(4) : "—",
        hint: "Racing-line t where cars merge back (from exit join node)",
      },
      {
        term: "box_distance_m",
        value: pit.box_distance_m != null ? `${pit.box_distance_m.toFixed(1)} m` : "—",
        hint: "Drive distance along pit lane from entry to the pit-box stop",
      },
    ];

    if (pit.polyline?.length) {
      const total = pit.polyline.reduce((sum, pt, i) => {
        if (i === 0) return 0;
        const prev = pit.polyline![i - 1];
        return sum + Math.hypot(pt.x - prev.x, pt.z - prev.z);
      }, 0);
      rows.push({
        term: "pit_lane_length_m",
        value: `${total.toFixed(1)} m`,
        hint: "Total pit lane path length",
      });
    }

    for (const row of rows) {
      const dt = document.createElement("dt");
      dt.textContent = row.term;
      if (row.hint) dt.title = row.hint;
      const dd = document.createElement("dd");
      dd.textContent = row.value;
      if (row.hint) dd.title = row.hint;
      this.pitDerivedEl.append(dt, dd);
    }
  }

  private renderHandles(): void {
    this.handlesGroup.replaceChildren();
    this.pitPathGroup.replaceChildren();
    if (!this.track || !this.svgTrack.hasGeometry()) return;

    if (this.surface === "pit") {
      if (hasAuthoring(this.track, "pit")) {
        this.renderAuthoringOverlay("pit");
        return;
      }
      const points = getEditablePitPolyline(this.track);
      if (points.length >= 2) {
        const d = points
          .map((pt, i) => {
            const svg = this.svgTrack.worldToSvgCoords(pt.x, pt.z);
            if (!svg) return "";
            return `${i === 0 ? "M" : "L"} ${svg.x} ${svg.y}`;
          })
          .join(" ");
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", d);
        path.setAttribute("class", "te-pit-path-line");
        this.pitPathGroup.appendChild(path);
      }
      const indices = pitHandleIndices(points.length);
      for (const index of indices) {
        const pt = points[index];
        const svg = this.svgTrack.worldToSvgCoords(pt.x, pt.z);
        if (!svg) continue;
        const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        circle.setAttribute("cx", String(svg.x));
        circle.setAttribute("cy", String(svg.y));
        circle.setAttribute("r", index === this.selectedIndex ? "4.5" : pt.role === "waypoint" ? "2.5" : "3.5");
        circle.style.fill = PIT_ROLE_COLORS[pt.role];
        circle.style.fillOpacity = index === this.selectedIndex ? "0.92" : "0.65";
        circle.style.stroke = "rgba(0, 0, 0, 0.45)";
        circle.style.strokeWidth = "1.2";
        circle.classList.add("te-handle", `te-handle--pit-${pt.role}`);
        if (index === this.selectedIndex) circle.classList.add("te-handle--selected");
        circle.dataset.index = String(index);
        this.handlesGroup.appendChild(circle);
      }
      this.syncPitInspectorPanel();
      return;
    }

    if (hasAuthoring(this.track, "layout")) {
      this.renderAuthoringOverlay("layout");
      return;
    }

    const points = getEditablePolyline(this.track);
    const indices = handleIndices(points.length);
    for (const index of indices) {
      const pt = points[index];
      const svg = this.svgTrack.worldToSvgCoords(pt.x, pt.z);
      if (!svg) continue;
      const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      circle.setAttribute("cx", String(svg.x));
      circle.setAttribute("cy", String(svg.y));
      circle.setAttribute("r", index === this.selectedIndex ? "4" : "3");
      circle.classList.add("te-handle");
      if (index === this.selectedIndex) circle.classList.add("te-handle--selected");
      circle.dataset.index = String(index);
      this.handlesGroup.appendChild(circle);
    }
    this.syncPitInspectorPanel();
  }

  private renderAuthoringOverlay(surface: EditorSurface): void {
    if (!this.track) return;
    const nodes = getAuthoringNodes(this.track, surface);
    const pathClass = surface === "pit" ? "te-pit-path-line" : "te-layout-path-line";
    if (nodes.length >= 2) {
      const centerline = compileAuthoringCenterline(this.track, surface);
      const pathPts = centerline.length >= 2 ? centerline : nodes;
      const d = pathPts
        .map((pt, i) => {
          const svg = this.svgTrack.worldToSvgCoords(pt.x, pt.z);
          if (!svg) return "";
          return `${i === 0 ? "M" : "L"} ${svg.x} ${svg.y}`;
        })
        .join(" ");
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", d);
      path.setAttribute("class", pathClass);
      this.pitPathGroup.appendChild(path);

      for (let seg = 0; seg < nodes.length - 1; seg++) {
        if (!isStraightAuthoringSegment(this.track, surface, seg)) continue;
        const a = nodes[seg];
        const b = nodes[seg + 1];
        const svgA = this.svgTrack.worldToSvgCoords(a.x, a.z);
        const svgB = this.svgTrack.worldToSvgCoords(b.x, b.z);
        if (!svgA || !svgB) continue;
        const segLine = document.createElementNS("http://www.w3.org/2000/svg", "line");
        segLine.setAttribute("x1", String(svgA.x));
        segLine.setAttribute("y1", String(svgA.y));
        segLine.setAttribute("x2", String(svgB.x));
        segLine.setAttribute("y2", String(svgB.y));
        segLine.setAttribute("class", "te-pit-segment-line");
        if (seg === this.selectedSegmentIndex) segLine.classList.add("te-pit-segment-line--selected");
        if (surface === "pit") {
          const zone = this.track.pit_lane?.authoring?.segments?.[seg]?.zone;
          if (zone === "speed_limit") segLine.classList.add("te-pit-segment-line--speed");
        } else {
          const layoutSeg = this.track.authoring?.segments?.[seg];
          if (layoutSeg?.straight) segLine.classList.add("te-layout-segment-line--straight");
          if (layoutSeg?.max_speed_ms != null) segLine.classList.add("te-pit-segment-line--speed");
        }
        this.pitPathGroup.appendChild(segLine);

        if (isStraightAuthoringSegment(this.track, surface, seg)) {
          const midSvg = this.svgTrack.worldToSvgCoords((a.x + b.x) / 2, (a.z + b.z) / 2);
          if (midSvg) {
            const mid = document.createElementNS("http://www.w3.org/2000/svg", "rect");
            mid.setAttribute("x", String(midSvg.x - 3));
            mid.setAttribute("y", String(midSvg.y - 3));
            mid.setAttribute("width", "6");
            mid.setAttribute("height", "6");
            mid.setAttribute("rx", "1");
            mid.classList.add("te-handle", "te-handle--segment");
            mid.dataset.segmentIndex = String(seg);
            this.handlesGroup.appendChild(mid);
          }
        }
      }
    }

    for (let index = 0; index < nodes.length; index++) {
      const pt = nodes[index];
      const svg = this.svgTrack.worldToSvgCoords(pt.x, pt.z);
      if (!svg) continue;
      const selected = this.selectedIndices.has(index);
      const isSf = surface === "layout" && pt.start_finish === true;
      const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      circle.setAttribute("cx", String(svg.x));
      circle.setAttribute("cy", String(svg.y));
      circle.setAttribute(
        "r",
        selected ? "5" : isSf ? "4.5" : pt.type === "normal" ? "3" : "3.5",
      );
      circle.style.fill = isSf ? START_FINISH_NODE_COLOR : NODE_TYPE_COLORS[pt.type];
      circle.style.fillOpacity = selected ? "0.92" : "0.58";
      circle.style.stroke = selected
        ? "#fff"
        : isSf
          ? START_FINISH_NODE_STROKE
          : "rgba(0, 0, 0, 0.45)";
      circle.style.strokeWidth = selected ? "1.5" : "1.2";
      if (isSf) circle.style.strokeDasharray = "2 1.5";
      circle.classList.add("te-handle", "te-handle--node", `te-handle--node-type-${pt.type}`);
      if (isSf) circle.classList.add("te-handle--start-finish");
      if (selected) circle.classList.add("te-handle--selected");
      circle.dataset.index = String(index);
      this.handlesGroup.appendChild(circle);
    }

    if (surface === "layout" && nodes.length >= 2 && nodes[0].start_finish) {
      const a = nodes[0];
      const b = nodes[1];
      const svgA = this.svgTrack.worldToSvgCoords(a.x, a.z);
      const svgB = this.svgTrack.worldToSvgCoords(b.x, b.z);
      if (svgA && svgB) {
        const dx = svgB.x - svgA.x;
        const dy = svgB.y - svgA.y;
        const len = Math.hypot(dx, dy) || 1;
        const nx = -dy / len;
        const ny = dx / len;
        const half = 9;
        const sfLine = document.createElementNS("http://www.w3.org/2000/svg", "line");
        sfLine.setAttribute("x1", String(svgA.x - nx * half));
        sfLine.setAttribute("y1", String(svgA.y - ny * half));
        sfLine.setAttribute("x2", String(svgA.x + nx * half));
        sfLine.setAttribute("y2", String(svgA.y + ny * half));
        sfLine.setAttribute("class", "te-start-finish-line");
        this.pitPathGroup.appendChild(sfLine);
      }
    }
    this.syncPitInspectorPanel();
    this.syncPitSegmentPanel();
    this.syncLayoutSegmentPanel();
  }

  private wireOverlay(): void {
    this.handlesGroup.addEventListener("pointerdown", (e) => this.onHandlePointerDown(e));
    window.addEventListener("pointermove", (e) => {
      this.onReferencePointerMove(e);
      this.onHandlePointerMove(e);
    });
    window.addEventListener("pointerup", (e) => {
      this.onReferencePointerUp(e);
      this.onHandlePointerUp(e);
    });
    this.canvasWrap.addEventListener("contextmenu", (e) => this.onContextMenu(e));
    this.handlesGroup.addEventListener("contextmenu", (e) => this.onContextMenu(e));
    this.canvasWrap.addEventListener("pointerdown", (e) => this.onCanvasPointerDown(e));
    window.addEventListener("keydown", (e) => this.onKeyDown(e));
  }

  private onKeyDown(e: KeyboardEvent): void {
    if (this.isTypingInField(e.target)) return;

    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === "z" && !e.shiftKey) {
      e.preventDefault();
      this.undo();
      return;
    }
    if (mod && (e.key.toLowerCase() === "y" || (e.key.toLowerCase() === "z" && e.shiftKey))) {
      e.preventDefault();
      this.redo();
      return;
    }
    if (mod && e.key.toLowerCase() === "s") {
      e.preventDefault();
      void this.saveCurrentDraft();
      return;
    }

    if (
      this.track &&
      hasAuthoring(this.track, this.surface) &&
      (e.key === "ArrowLeft" ||
        e.key === "ArrowRight" ||
        e.key === "ArrowUp" ||
        e.key === "ArrowDown")
    ) {
      const indices =
        this.selectedIndices.size > 0
          ? [...this.selectedIndices]
          : this.selectedIndex != null
            ? [this.selectedIndex]
            : [];
      if (indices.length > 0) {
        e.preventDefault();
        let step = 1;
        if (e.shiftKey) step = 10;
        else if (e.altKey) step = 0.25;
        const snap = this.snapM();
        if (snap > 0) step = snap;
        let dx = 0;
        let dz = 0;
        if (e.key === "ArrowLeft") dx = -step;
        else if (e.key === "ArrowRight") dx = step;
        else if (e.key === "ArrowUp") dz = -step;
        else if (e.key === "ArrowDown") dz = step;
        this.mutateTrack((t) =>
          nudgeAuthoringNodes(t, this.surface, indices, dx, dz, snap),
        );
      }
      return;
    }

    if (e.key === "Delete" || e.key === "Backspace") {
      if (!this.track) return;
      e.preventDefault();
      if (hasAuthoring(this.track, this.surface) && this.selectedIndices.size > 0) {
        this.mutateTrack((t) =>
          deleteAuthoringNodes(t, this.surface, [...this.selectedIndices]),
        );
        this.clearSelection();
        return;
      }
      if (this.selectedIndex == null) return;
      const index = this.selectedIndex;
      if (this.surface === "pit") {
        this.mutateTrack((t) => deletePitVertex(t, index));
      } else {
        this.mutateTrack((t) => deletePolylineVertex(t, index));
      }
      this.clearSelection();
    }
  }

  private isTypingInField(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    const tag = target.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
  }

  private clientToSvg(e: PointerEvent): { x: number; y: number } {
    return this.svgTrack.clientPointToSvg(e.clientX, e.clientY);
  }

  private svgToWorld(sx: number, sy: number): { x: number; z: number } | null {
    return this.svgTrack.svgCoordsToWorld(sx, sy);
  }

  private onHandlePointerDown(e: PointerEvent): void {
    const target = e.target as SVGElement;
    if (!this.track) return;

    if (target.classList.contains("te-handle--segment")) {
      e.preventDefault();
      e.stopPropagation();
      this.svgTrack.setEditorPanSuspended(true);
      this.draggingSegmentIndex = Number(target.dataset.segmentIndex);
      this.selectedSegmentIndex = this.draggingSegmentIndex;
      this.selectedIndices.clear();
      this.selectedIndex = null;
      const svgPt = this.clientToSvg(e);
      const world = this.svgToWorld(svgPt.x, svgPt.y);
      this.segmentDragAnchor = world;
      this.dragSnapshot = structuredClone(this.track);
      this.handlesGroup.setPointerCapture(e.pointerId);
      this.handlesGroup.classList.add("te-handles--dragging");
      this.renderHandles();
      return;
    }

    if (!target.classList.contains("te-handle--node") && !target.classList.contains("te-handle")) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    this.svgTrack.setEditorPanSuspended(true);
    const index = Number(target.dataset.index);
    this.selectNode(index, e.shiftKey);
    this.selectedSegmentIndex = null;
    this.draggingIndex = index;
    this.dragSnapshot = structuredClone(this.track);
    this.handlesGroup.setPointerCapture(e.pointerId);
    this.handlesGroup.classList.add("te-handles--dragging");
    this.renderHandles();
  }

  private onCanvasPointerDown(e: PointerEvent): void {
    if (!this.track || !this.svgTrack.hasGeometry() || this.draggingIndex != null) return;
    if (e.target instanceof Element && e.target.closest(".te-handle")) return;
    if (e.target instanceof Element && e.target.closest(".te-ref-interactive")) return;
    if (e.button === 1 || e.button === 2 || e.getModifierState("Space")) return;

    const svgPt = this.clientToSvg(e);
    const world = this.svgToWorld(svgPt.x, svgPt.y);
    if (!world) return;

    if (hasAuthoring(this.track, this.surface)) {
      this.handleAuthoringCanvasClick(e, world);
      return;
    }

    if (this.surface === "pit") {
      const points = getEditablePitPolyline(this.track).map((p) => ({ x: p.x, z: p.z }));
      const hit = findNearestSegment(points, world.x, world.z, false);
      if (this.tool === "add" && hit && hit.distanceM < 40) {
        e.preventDefault();
        e.stopPropagation();
        this.mutateTrack((t) =>
          insertPitVertexOnSegment(
            t,
            hit.segmentIndex,
            hit.closest.x,
            hit.closest.z,
            this.snapM(),
          ),
        );
        this.selectedIndex = hit.segmentIndex + 1;
        return;
      }
      if (this.tool === "select") {
        let bestIndex: number | null = null;
        let bestDist = Infinity;
        const indices = pitHandleIndices(points.length, points.length);
        for (const idx of indices) {
          const p = points[idx];
          const d = Math.hypot(p.x - world.x, p.z - world.z);
          if (d < bestDist) {
            bestDist = d;
            bestIndex = idx;
          }
        }
        if (bestIndex != null && bestDist < 50) {
          this.selectedIndex = bestIndex;
        } else {
          this.selectedIndex = null;
        }
        this.renderHandles();
      }
      return;
    }

    const points = getEditablePolyline(this.track).map((p) => ({ x: p.x, z: p.z }));
    const hit = findNearestSegment(
      points,
      world.x,
      world.z,
      this.track.closed ?? true,
    );

    if (this.tool === "add" && hit && hit.distanceM < 40) {
      e.preventDefault();
      e.stopPropagation();
      this.mutateTrack((t) =>
        insertVertexOnSegment(
          t,
          hit.segmentIndex,
          hit.closest.x,
          hit.closest.z,
          this.snapM(),
        ),
      );
      this.selectedIndex = hit.segmentIndex + 1;
      return;
    }

    if (this.tool === "select") {
      let bestIndex: number | null = null;
      let bestDist = Infinity;
      const indices = handleIndices(points.length, points.length);
      for (const idx of indices) {
        const p = points[idx];
        const d = Math.hypot(p.x - world.x, p.z - world.z);
        if (d < bestDist) {
          bestDist = d;
          bestIndex = idx;
        }
      }
      if (bestIndex != null && bestDist < 50) {
        this.selectedIndex = bestIndex;
      } else {
        this.selectedIndex = null;
      }
      this.renderHandles();
    }
  }

  private onHandlePointerMove(e: PointerEvent): void {
    if (!this.track || this.refDragMode != null) return;

    if (this.draggingSegmentIndex != null && this.segmentDragAnchor) {
      e.preventDefault();
      e.stopPropagation();
      const svgPt = this.clientToSvg(e);
      const world = this.svgToWorld(svgPt.x, svgPt.y);
      if (!world || !this.dragSnapshot) return;
      const dx = world.x - this.segmentDragAnchor.x;
      const dz = world.z - this.segmentDragAnchor.z;
      this.track = moveAuthoringSegmentParallel(
        this.dragSnapshot,
        this.surface,
        this.draggingSegmentIndex,
        dx,
        dz,
        this.snapM(),
      );
      this.markDirty();
      this.refreshAuthoringDragPreview();
      return;
    }

    if (this.draggingIndex == null) return;
    e.preventDefault();
    e.stopPropagation();
    const svgPt = this.clientToSvg(e);
    const world = this.svgToWorld(svgPt.x, svgPt.y);
    if (!world || !this.dragSnapshot) return;

    if (hasAuthoring(this.track, this.surface)) {
      const indices =
        this.selectedIndices.size > 0 ? [...this.selectedIndices] : [this.draggingIndex];
      this.track = moveAuthoringNodes(
        this.track,
        this.surface,
        indices,
        world.x,
        world.z,
        this.draggingIndex,
        this.snapM(),
        this.dragSnapshot,
      );
      this.markDirty();
      this.refreshAuthoringDragPreview();
      return;
    }

    this.track =
      this.surface === "pit"
        ? movePitVertex(
            this.dragSnapshot,
            this.draggingIndex,
            world.x,
            world.z,
            this.snapM(),
          )
        : movePolylineVertex(
            this.dragSnapshot,
            this.draggingIndex,
            world.x,
            world.z,
            this.snapM(),
          );
    this.markDirty();
    this.refreshAuthoringDragPreview();
  }

  private onHandlePointerUp(e: PointerEvent): void {
    if (this.refDragMode != null) return;

    if (this.draggingSegmentIndex != null) {
      if (this.dragSnapshot && this.track) {
        this.history.recordDragIfChanged(this.dragSnapshot, this.track);
        this.updateHistoryButtons();
        if (this.history.canUndo()) this.markDirty();
      }
      this.draggingSegmentIndex = null;
      this.segmentDragAnchor = null;
      this.handlesGroup.classList.remove("te-handles--dragging");
      this.svgTrack.setEditorPanSuspended(false);
      this.refreshPreview();
      try {
        this.handlesGroup.releasePointerCapture(e.pointerId);
      } catch {
        /* already released */
      }
      return;
    }

    if (this.draggingIndex == null) return;
    if (this.dragSnapshot && this.track) {
      this.history.recordDragIfChanged(this.dragSnapshot, this.track);
      this.updateHistoryButtons();
      if (this.history.canUndo()) this.markDirty();
    }
    this.draggingIndex = null;
    this.dragSnapshot = null;
    this.handlesGroup.classList.remove("te-handles--dragging");
    this.svgTrack.setEditorPanSuspended(false);
    this.refreshPreview();
    try {
      this.handlesGroup.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
  }

  private handleAuthoringCanvasClick(
    e: PointerEvent,
    world: { x: number; z: number },
  ): void {
    if (!this.track) return;
    const closed = this.surface === "layout" ? (this.track.closed ?? true) : false;
    const nodes = getAuthoringNodes(this.track, this.surface).map((p) => ({ x: p.x, z: p.z }));
    const hit = findNearestSegment(nodes, world.x, world.z, closed);
    if (this.tool === "add" && hit && hit.distanceM < 40) {
      e.preventDefault();
      e.stopPropagation();
      this.mutateTrack((t) =>
        insertAuthoringNodeOnSegment(
          t,
          this.surface,
          hit.segmentIndex,
          hit.closest.x,
          hit.closest.z,
          this.snapM(),
          "normal",
        ),
      );
      this.selectNode(hit.segmentIndex + 1, false);
      return;
    }
    if (this.tool === "select") {
      if (hit && hit.distanceM < 25) {
        this.selectedSegmentIndex = hit.segmentIndex;
        this.selectedIndices.clear();
        this.selectedIndex = null;
      } else {
        let bestIndex: number | null = null;
        let bestDist = Infinity;
        for (let idx = 0; idx < nodes.length; idx++) {
          const p = nodes[idx];
          const d = Math.hypot(p.x - world.x, p.z - world.z);
          if (d < bestDist) {
            bestDist = d;
            bestIndex = idx;
          }
        }
        if (bestIndex != null && bestDist < 50) {
          this.selectNode(bestIndex, e.shiftKey);
        } else {
          this.clearSelection();
        }
      }
      this.renderHandles();
    }
  }

  private onContextMenu(e: MouseEvent): void {
    e.preventDefault();
    if (!this.track || !hasAuthoring(this.track, this.surface)) return;

    const target = e.target as SVGElement;
    if (target.classList.contains("te-handle--node") || target.classList.contains("te-handle")) {
      const index = Number(target.dataset.index);
      if (!Number.isNaN(index)) {
        this.selectNode(index, false);
        this.showNodeContextMenu(e.clientX, e.clientY, index);
      }
      return;
    }
    if (target.classList.contains("te-handle--segment")) {
      const seg = Number(target.dataset.segmentIndex);
      if (!Number.isNaN(seg)) {
        this.selectedSegmentIndex = seg;
        this.selectedIndices.clear();
        this.selectedIndex = null;
        this.showSegmentContextMenu(e.clientX, e.clientY, seg);
      }
      return;
    }

    const svgPt = this.clientToSvg(e as PointerEvent);
    const world = this.svgToWorld(svgPt.x, svgPt.y);
    if (!world) return;
    const closed = this.surface === "layout" ? (this.track.closed ?? true) : false;
    const nodes = getAuthoringNodes(this.track, this.surface).map((p) => ({ x: p.x, z: p.z }));
    const hit = findNearestSegment(nodes, world.x, world.z, closed);
    if (hit && hit.distanceM < 25) {
      this.selectedSegmentIndex = hit.segmentIndex;
      this.showSegmentContextMenu(e.clientX, e.clientY, hit.segmentIndex);
      return;
    }
    let bestIndex: number | null = null;
    let bestDist = Infinity;
    for (let idx = 0; idx < nodes.length; idx++) {
      const d = Math.hypot(nodes[idx].x - world.x, nodes[idx].z - world.z);
      if (d < bestDist) {
        bestDist = d;
        bestIndex = idx;
      }
    }
    if (bestIndex != null && bestDist < 50) {
      this.selectNode(bestIndex, false);
      this.showNodeContextMenu(e.clientX, e.clientY, bestIndex);
      return;
    }
    if (hit && hit.distanceM < 40) {
      this.showInsertNodeContextMenu(e.clientX, e.clientY, hit);
    }
  }

  private showNodeContextMenu(clientX: number, clientY: number, index: number): void {
    if (!this.track) return;
    const node = getAuthoringNodes(this.track, this.surface)[index];
    const types = this.surface === "pit" ? PIT_NODE_TYPES : LAYOUT_NODE_TYPES;
    const items: ContextMenuItem[] = [];
    if (this.surface === "layout") {
      items.push({
        label: "Set as start/finish line (lap t=0)",
        checked: node?.start_finish === true,
        action: () => {
          this.mutateTrack((t) => setLayoutStartFinishNode(t, index));
          this.selectNode(0, false);
        },
      });
      items.push({ separator: true, label: "", action: () => {} });
      items.push(
        { label: "Track width", action: () => {}, disabled: true },
        {
          label: "13 m (default)",
          action: () =>
            this.mutateTrack((t) => setAuthoringNodeWidth(t, "layout", index, undefined)),
        },
        {
          label: "15 m (grid straight)",
          action: () => this.mutateTrack((t) => setAuthoringNodeWidth(t, "layout", index, 15)),
        },
        {
          label: "11 m (narrow)",
          action: () => this.mutateTrack((t) => setAuthoringNodeWidth(t, "layout", index, 11)),
        },
        { separator: true, label: "", action: () => {} },
      );
    }
    items.push(
      { label: "Node type", action: () => {}, disabled: true },
      ...types.map((type) => ({
        label: NODE_TYPE_LABELS[type],
        checked: node?.type === type,
        action: () => {
          this.mutateTrack((t) => setAuthoringNodeType(t, this.surface, index, type));
        },
      })),
      { separator: true, label: "", action: () => {} },
      {
        label: "Delete node",
        action: () => {
          this.mutateTrack((t) => deleteAuthoringNodes(t, this.surface, [index]));
          this.clearSelection();
        },
      },
    );
    this.contextMenu.show(clientX, clientY, items, () => this.renderHandles());
  }

  private showSegmentContextMenu(clientX: number, clientY: number, segmentIndex: number): void {
    if (!this.track) return;
    const items: ContextMenuItem[] = [];
    if (this.surface === "pit") {
      const seg = this.track.pit_lane?.authoring?.segments?.[segmentIndex];
      items.push(
        { label: "Segment attributes", action: () => {}, disabled: true },
        {
          label: "Speed limit 60 km/h (16.67 m/s)",
          action: () =>
            this.mutateTrack((t) => setPitSegmentSpeedLimit(t, segmentIndex, 16.666)),
        },
        {
          label: "Clear speed limit",
          checked: seg?.speed_limit_ms == null,
          action: () =>
            this.mutateTrack((t) => setPitSegmentSpeedLimit(t, segmentIndex, undefined)),
        },
      );
    } else {
      const seg = this.track.authoring?.segments?.[segmentIndex];
      items.push(
        { label: "Segment attributes", action: () => {}, disabled: true },
        {
          label: "Mark straight",
          checked: seg?.straight === true,
          action: () =>
            this.mutateTrack((t) =>
              setLayoutSegmentAttrs(t, segmentIndex, { straight: !seg?.straight }),
            ),
        },
        {
          label: "Set width 15 m",
          action: () =>
            this.mutateTrack((t) => setLayoutSegmentAttrs(t, segmentIndex, { width_m: 15 })),
        },
        {
          label: "Clear width override",
          checked: seg?.width_m == null,
          action: () =>
            this.mutateTrack((t) => setLayoutSegmentAttrs(t, segmentIndex, { width_m: undefined })),
        },
        {
          label: "Max speed 80 m/s",
          action: () =>
            this.mutateTrack((t) =>
              setLayoutSegmentAttrs(t, segmentIndex, { max_speed_ms: 80 }),
            ),
        },
        {
          label: "Clear max speed",
          checked: seg?.max_speed_ms == null,
          action: () =>
            this.mutateTrack((t) =>
              setLayoutSegmentAttrs(t, segmentIndex, { max_speed_ms: undefined }),
            ),
        },
      );
    }
    items.push(
      { separator: true, label: "", action: () => {} },
      {
        label: "Insert normal node here",
        action: () => {
          const nodes = getAuthoringNodes(this.track!, this.surface);
          const a = nodes[segmentIndex];
          const b = nodes[segmentIndex + 1];
          if (!a || !b) return;
          this.mutateTrack((t) =>
            insertAuthoringNodeOnSegment(
              t,
              this.surface,
              segmentIndex,
              (a.x + b.x) / 2,
              (a.z + b.z) / 2,
              this.snapM(),
              "normal",
            ),
          );
        },
      },
    );
    this.contextMenu.show(clientX, clientY, items, () => this.renderHandles());
  }

  private showInsertNodeContextMenu(
    clientX: number,
    clientY: number,
    hit: { segmentIndex: number; closest: { x: number; z: number } },
  ): void {
    this.contextMenu.show(clientX, clientY, [
      {
        label: "Insert normal node",
        action: () => {
          this.mutateTrack((t) =>
            insertAuthoringNodeOnSegment(
              t,
              this.surface,
              hit.segmentIndex,
              hit.closest.x,
              hit.closest.z,
              this.snapM(),
              "normal",
            ),
          );
          this.selectNode(hit.segmentIndex + 1, false);
        },
      },
    ]);
  }

  private markDirty(): void {
    this.dirty = true;
    this.setStatus(`${this.sourceLabel}${this.dirty ? " · unsaved changes" : ""}`);
  }

  private setStatus(text: string, isError = false): void {
    this.statusEl.textContent = text;
    this.statusEl.classList.toggle("te-status--error", isError);
  }

  private surfaceButton(label: string, surface: EditorSurface): HTMLButtonElement {
    const btn = this.button(label, () => {
      this.surface = surface;
      if (surface === "pit") {
        this.showPitTarmac = true;
        this.showPitTarmacToggle.checked = true;
      }
      this.clearSelection();
      this.toolbar
        .querySelectorAll("[data-surface]")
        .forEach((el) => el.classList.remove("te-tool--active"));
      btn.classList.add("te-tool--active");
      this.refreshPreview();
      const hint =
        surface === "pit"
          ? hasAuthoring(this.track ?? ({} as TrackJson), "pit")
            ? " · node editor · right-click nodes/segments · pan: Space+drag"
            : " · Simplify pit nodes · pan: Space+drag"
          : hasAuthoring(this.track ?? ({} as TrackJson), "layout")
            ? " · node editor · right-click nodes/segments · pan: Space+drag"
            : " · Simplify to nodes · pan: Space+drag";
      this.setStatus(`${this.sourceLabel} · editing ${surface}${hint}`);
    });
    btn.dataset.surface = surface;
    if (surface === this.surface) btn.classList.add("te-tool--active");
    return btn;
  }

  private toolButton(label: string, tool: EditorTool): HTMLButtonElement {
    const btn = this.button(label, () => {
      this.tool = tool;
      this.toolbar
        .querySelectorAll("[data-tool]")
        .forEach((el) => el.classList.remove("te-tool--active"));
      btn.classList.add("te-tool--active");
    });
    btn.dataset.tool = tool;
    if (tool === "select") btn.classList.add("te-tool--active");
    return btn;
  }

  private button(label: string, onClick: () => void): HTMLButtonElement {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "te-btn";
    btn.textContent = label;
    btn.addEventListener("click", onClick);
    return btn;
  }

  private selectControl(_label: string): HTMLSelectElement {
    const sel = document.createElement("select");
    sel.className = "te-select";
    return sel;
  }

  private toolbarGroup(title: string, ...nodes: HTMLElement[]): HTMLElement {
    const group = document.createElement("div");
    group.className = "te-toolbar-group";
    const heading = document.createElement("span");
    heading.className = "te-toolbar-label";
    heading.textContent = title;
    group.append(heading, ...nodes);
    return group;
  }
}

function emptyGeometry(): TrackGeometryPayload {
  return {
    name: "Empty",
    lapLength: 0,
    closed: true,
    polyline: [],
    sectors: [],
  };
}
