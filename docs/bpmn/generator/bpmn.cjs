// Tiny draw.io BPMN 2.0 generator: pages → pools → lanes → nodes/edges.
// Style strings are the ones draw.io's own BPMN 2.0 sidebar uses
// (Sidebar-BPMN.js), so the file opens with proper BPMN symbols.

const PTS =
  "points=[[0.25,0,0],[0.5,0,0],[0.75,0,0],[1,0.25,0],[1,0.5,0],[1,0.75,0],[0.75,1,0],[0.5,1,0],[0.25,1,0],[0,0.75,0],[0,0.5,0],[0,0.25,0]];";
const EVT =
  "points=[[0.145,0.145,0],[0.5,0,0],[0.855,0.145,0],[1,0.5,0],[0.855,0.855,0],[0.5,1,0],[0.145,0.855,0],[0,0.5,0]];shape=mxgraph.bpmn.event;html=1;verticalLabelPosition=bottom;labelBackgroundColor=#ffffff;verticalAlign=top;align=center;perimeter=ellipsePerimeter;outlineConnect=0;aspect=fixed;";
const GW =
  "points=[[0.25,0.25,0],[0.5,0,0],[0.75,0.25,0],[1,0.5,0],[0.75,0.75,0],[0.5,1,0],[0.25,0.75,0],[0,0.5,0]];shape=mxgraph.bpmn.gateway2;html=1;verticalLabelPosition=bottom;labelBackgroundColor=#ffffff;verticalAlign=top;align=center;perimeter=rhombusPerimeter;outlineConnect=0;";
const TASK = PTS + "shape=mxgraph.bpmn.task2;whiteSpace=wrap;rectStyle=rounded;size=10;html=1;container=1;expand=0;collapsible=0;fontSize=11;";

const NODE_STYLES = {
  start: EVT + "outline=standard;symbol=general;",
  startTimer: EVT + "outline=standard;symbol=timer;",
  startMsg: EVT + "outline=standard;symbol=message;",
  startCond: EVT + "outline=standard;symbol=conditional;",
  end: EVT + "outline=end;symbol=general;",
  endTerminate: EVT + "outline=end;symbol=terminate;",
  endMsg: EVT + "outline=end;symbol=message;",
  endError: EVT + "outline=end;symbol=error;",
  timer: EVT + "outline=catching;symbol=timer;",
  catchMsg: EVT + "outline=catching;symbol=message;",
  throwMsg: EVT + "outline=throwing;symbol=message;",
  link: EVT + "outline=throwing;symbol=link;",
  linkCatch: EVT + "outline=catching;symbol=link;",
  boundaryError: EVT + "outline=boundInt;symbol=error;",
  task: TASK + "taskMarker=abstract;",
  user: TASK + "taskMarker=user;",
  manual: TASK + "taskMarker=manual;",
  service: TASK + "taskMarker=service;",
  script: TASK + "taskMarker=script;",
  send: TASK + "taskMarker=send;",
  receive: TASK + "taskMarker=receive;",
  rule: TASK + "taskMarker=businessRule;",
  sub: TASK + "taskMarker=abstract;isLoopSub=1;",
  call: PTS + "shape=mxgraph.bpmn.task2;whiteSpace=wrap;rectStyle=rounded;size=10;html=1;container=1;expand=0;collapsible=0;bpmnShapeType=call;taskMarker=abstract;fontSize=11;",
  loopSeq: TASK + "taskMarker=abstract;isLoopMultiSeq=1;",
  serviceLoop: TASK + "taskMarker=service;isLoopMultiSeq=1;",
  xor: GW + "outline=none;symbol=none;gwType=exclusive;",
  and: GW + "outline=none;symbol=none;gwType=parallel;",
  or: GW + "outline=end;symbol=general;",
  event: GW + "outline=standard;symbol=general;",
  data: "shape=mxgraph.bpmn.data2;labelPosition=center;verticalLabelPosition=bottom;align=center;verticalAlign=top;size=15;html=1;fontSize=10;",
  dataIn: "shape=mxgraph.bpmn.data2;labelPosition=center;verticalLabelPosition=bottom;align=center;verticalAlign=top;size=15;html=1;bpmnTransferType=input;fontSize=10;",
  dataOut: "shape=mxgraph.bpmn.data2;labelPosition=center;verticalLabelPosition=bottom;align=center;verticalAlign=top;size=15;html=1;bpmnTransferType=output;fontSize=10;",
  store: "shape=datastore;html=1;labelPosition=center;verticalLabelPosition=bottom;align=center;verticalAlign=top;fontSize=10;",
  note: "shape=partialRectangle;html=1;whiteSpace=wrap;align=left;verticalAlign=middle;left=1;right=0;top=0;bottom=0;strokeColor=#888888;fillColor=none;fontSize=10;fontColor=#555555;spacingLeft=6;",
  text: "text;html=1;strokeColor=none;fillColor=none;align=left;verticalAlign=top;whiteSpace=wrap;rounded=0;fontSize=11;",
  group: "rounded=1;arcSize=10;dashed=1;fillColor=none;gradientColor=none;dashPattern=8 3 1 3;strokeWidth=2;whiteSpace=wrap;html=1;verticalAlign=top;align=left;spacingLeft=6;fontSize=11;fontColor=#666666;",
};

const DEFAULT_SIZE = {
  start: [36, 36], startTimer: [36, 36], startMsg: [36, 36], startCond: [36, 36],
  end: [36, 36], endTerminate: [36, 36], endMsg: [36, 36], endError: [36, 36],
  timer: [36, 36], catchMsg: [36, 36], throwMsg: [36, 36], link: [36, 36], linkCatch: [36, 36], boundaryError: [30, 30],
  task: [130, 64], user: [130, 64], manual: [130, 64], service: [130, 64], script: [130, 64], send: [130, 64],
  receive: [130, 64], rule: [130, 64], sub: [130, 64], call: [130, 64], loopSeq: [130, 64], serviceLoop: [130, 64],
  xor: [44, 44], and: [44, 44], or: [44, 44], event: [44, 44],
  data: [34, 44], dataIn: [34, 44], dataOut: [34, 44], store: [48, 44], note: [170, 46], text: [200, 40], group: [200, 100],
};

const EDGE_STYLES = {
  seq: "edgeStyle=orthogonalEdgeStyle;html=1;endArrow=blockThin;endFill=1;rounded=0;fontSize=10;labelBackgroundColor=#ffffff;jettySize=auto;orthogonalLoop=1;",
  default: "edgeStyle=orthogonalEdgeStyle;html=1;endArrow=blockThin;endFill=1;rounded=0;fontSize=10;labelBackgroundColor=#ffffff;startArrow=dash;startFill=0;endSize=6;startSize=6;jettySize=auto;orthogonalLoop=1;",
  cond: "edgeStyle=orthogonalEdgeStyle;html=1;endArrow=blockThin;endFill=1;rounded=0;fontSize=10;labelBackgroundColor=#ffffff;startArrow=diamondThin;startFill=0;endSize=6;startSize=10;jettySize=auto;orthogonalLoop=1;",
  msg: "edgeStyle=orthogonalEdgeStyle;html=1;dashed=1;dashPattern=8 4;endArrow=blockThin;endFill=0;startArrow=oval;startFill=0;endSize=6;startSize=4;fontSize=10;labelBackgroundColor=#ffffff;jettySize=auto;orthogonalLoop=1;",
  assoc: "edgeStyle=orthogonalEdgeStyle;html=1;endFill=0;startFill=0;endSize=6;startSize=6;dashed=1;dashPattern=1 4;endArrow=none;startArrow=none;fontSize=10;",
  dataAssoc: "edgeStyle=orthogonalEdgeStyle;html=1;endFill=0;startFill=0;endSize=6;startSize=6;dashed=1;dashPattern=1 4;endArrow=openThin;startArrow=none;fontSize=10;",
};

const LANE_COLORS = {
  human: "#FFF8E1", // people
  app: "#E3F2FD", // web app / frontend
  backend: "#E8F5E9", // supabase db + edge functions
  sched: "#F3E5F5", // github actions
  external: "#F5F5F5", // outside orgs
};

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/\n/g, "&lt;br&gt;");
}

class Page {
  constructor(name, opts = {}) {
    this.name = name;
    this.colW = opts.colW ?? 190;
    this.left = opts.left ?? 115; // x of column 0 centre, relative to pool left
    this.poolX = opts.poolX ?? 40;
    this.poolY = opts.poolY ?? 80;
    this.poolGap = opts.poolGap ?? 30;
    this.cols = opts.cols ?? 10;
    this.pools = [];
    this.nodes = [];
    this.edges = [];
    this.free = []; // free-floating cells (title, legend)
    this.laneIndex = {};
    this.nextId = 10;
    this.title = opts.title ?? name;
    this.subtitle = opts.subtitle ?? "";
  }
  id() {
    return `c${this.nextId++}`;
  }
  pool(label, lanes, opts = {}) {
    const p = { id: this.id(), label, lanes: [], blackBox: lanes.length === 0, height: opts.height ?? 60, color: opts.color };
    let offset = 0;
    for (const l of lanes) {
      const lane = { id: this.id(), key: l.key, label: l.label, height: l.height ?? 130, offset, color: l.color ?? LANE_COLORS[l.kind ?? "human"] };
      p.lanes.push(lane);
      this.laneIndex[l.key] = { pool: p, lane };
      offset += lane.height;
    }
    if (!p.blackBox) p.height = offset;
    if (opts.key) this.laneIndex[opts.key] = { pool: p, lane: null };
    this.pools.push(p);
    return p;
  }
  node(id, lane, col, type, label = "", extra = {}) {
    const [w, h] = extra.size ?? DEFAULT_SIZE[type] ?? [120, 60];
    this.nodes.push({ id, lane, col, type, label, w, h, dy: extra.dy ?? 0, dx: extra.dx ?? 0, style: extra.style ?? "" });
    return id;
  }
  edge(from, to, label = "", kind = "seq", opts = {}) {
    this.edges.push({ id: this.id(), from, to, label, kind, ...opts });
  }
  // ---- geometry ----
  layout() {
    let y = this.poolY;
    this.width = this.left * 2 + (this.cols - 1) * this.colW;
    for (const p of this.pools) {
      p.x = this.poolX;
      p.y = y;
      p.w = this.width;
      y += p.height + this.poolGap;
    }
    this.height = y;
  }
  laneTop(key) {
    const { pool, lane } = this.laneIndex[key];
    return lane ? pool.y + lane.offset : pool.y;
  }
  laneH(key) {
    const { pool, lane } = this.laneIndex[key];
    return lane ? lane.height : pool.height;
  }
  pt(col, laneKey, dy = 0) {
    return [this.poolX + this.left + col * this.colW, this.laneTop(laneKey) + this.laneH(laneKey) / 2 + dy];
  }
  center(n) {
    const [x, y] = this.pt(n.col, n.lane, n.dy);
    return [x + n.dx, y];
  }
  xml() {
    this.layout();
    const cells = [];
    const byId = Object.fromEntries(this.nodes.map(n => [n.id, n]));
    // pools + lanes
    for (const p of this.pools) {
      const style = p.blackBox
        ? `swimlane;html=1;horizontal=1;startSize=24;whiteSpace=wrap;fontStyle=1;fontSize=12;swimlaneFillColor=${p.color ?? LANE_COLORS.external};fillColor=#E0E0E0;collapsible=0;`
        : `swimlane;html=1;childLayout=stackLayout;resizeParent=1;resizeParentMax=0;horizontal=0;startSize=30;horizontalStack=0;whiteSpace=wrap;fontStyle=1;fontSize=12;`;
      cells.push(
        `<mxCell id="${p.id}" value="${esc(p.label)}" style="${style}" vertex="1" parent="1"><mxGeometry x="${p.x}" y="${p.y}" width="${p.w}" height="${p.height}" as="geometry"/></mxCell>`
      );
      for (const l of p.lanes) {
        cells.push(
          `<mxCell id="${l.id}" value="${esc(l.label)}" style="swimlane;html=1;startSize=30;horizontal=0;whiteSpace=wrap;fontSize=11;swimlaneFillColor=${l.color};" vertex="1" parent="${p.id}"><mxGeometry x="30" y="${l.offset}" width="${p.w - 30}" height="${l.height}" as="geometry"/></mxCell>`
        );
      }
    }
    // nodes
    for (const n of this.nodes) {
      const [cx, cy] = this.center(n);
      const { pool, lane } = this.laneIndex[n.lane];
      const parentId = lane ? lane.id : pool.id;
      const px = lane ? pool.x + 30 : pool.x;
      const py = lane ? pool.y + lane.offset : pool.y;
      const style = (NODE_STYLES[n.type] ?? NODE_STYLES.task) + n.style;
      cells.push(
        `<mxCell id="${n.id}" value="${esc(n.label)}" style="${style}" vertex="1" parent="${parentId}"><mxGeometry x="${Math.round(cx - n.w / 2 - px)}" y="${Math.round(cy - n.h / 2 - py)}" width="${n.w}" height="${n.h}" as="geometry"/></mxCell>`
      );
    }
    // edges
    for (const e of this.edges) {
      let style = EDGE_STYLES[e.kind] ?? EDGE_STYLES.seq;
      if (e.exit) style += `exitX=${e.exit[0]};exitY=${e.exit[1]};exitDx=0;exitDy=0;`;
      if (e.entry) style += `entryX=${e.entry[0]};entryY=${e.entry[1]};entryDx=0;entryDy=0;`;
      if (e.style) style += e.style;
      let pts = "";
      if (e.via?.length) {
        const arr = e.via.map(v => {
          if (Array.isArray(v)) return this.pt(v[0], v[1], v[2] ?? 0);
          return [v.x, v.y];
        });
        pts = `<Array as="points">${arr.map(([x, y]) => `<mxPoint x="${Math.round(x)}" y="${Math.round(y)}"/>`).join("")}</Array>`;
      }
      const src = byId[e.from] ? e.from : this.laneIndex[e.from]?.pool.id ?? e.from;
      const tgt = byId[e.to] ? e.to : this.laneIndex[e.to]?.pool.id ?? e.to;
      // Message flows to/from a black-box pool: aim at the x of the node on
      // the other end so the line drops straight instead of snaking.
      if (!byId[e.to] && byId[e.from] && !e.entry) {
        const pool = this.laneIndex[e.to].pool;
        const [cx, cy] = this.center(byId[e.from]);
        const fx = Math.min(0.98, Math.max(0.02, (cx + (e.shift ?? 0) - pool.x) / pool.w));
        style += `entryX=${fx.toFixed(3)};entryY=${cy < pool.y ? 0 : 1};entryDx=0;entryDy=0;`;
        if (!e.exit) style += `exitX=${(0.5 + (e.shift ?? 0) / byId[e.from].w).toFixed(3)};exitY=${cy < pool.y ? 1 : 0};exitDx=0;exitDy=0;`;
      }
      if (!byId[e.from] && byId[e.to] && !e.exit) {
        const pool = this.laneIndex[e.from].pool;
        const [cx, cy] = this.center(byId[e.to]);
        const fx = Math.min(0.98, Math.max(0.02, (cx + (e.shift ?? 0) - pool.x) / pool.w));
        style += `exitX=${fx.toFixed(3)};exitY=${cy < pool.y ? 0 : 1};exitDx=0;exitDy=0;`;
        if (!e.entry) style += `entryX=${(0.5 + (e.shift ?? 0) / byId[e.to].w).toFixed(3)};entryY=${cy < pool.y ? 1 : 0};entryDx=0;entryDy=0;`;
      }
      cells.push(
        `<mxCell id="${e.id}" value="${esc(e.label)}" style="${style}" edge="1" parent="1" source="${src}" target="${tgt}"><mxGeometry x="${e.lx ?? 0}" y="${e.ly ?? 0}" relative="1" as="geometry">${pts}</mxGeometry></mxCell>`
      );
    }
    // title
    cells.push(
      `<mxCell id="title" value="${esc(this.title)}" style="text;html=1;strokeColor=none;fillColor=none;align=left;verticalAlign=middle;whiteSpace=wrap;fontSize=18;fontStyle=1;" vertex="1" parent="1"><mxGeometry x="${this.poolX}" y="${this.poolY - 62}" width="${this.width}" height="30" as="geometry"/></mxCell>`
    );
    if (this.subtitle)
      cells.push(
        `<mxCell id="subtitle" value="${esc(this.subtitle)}" style="text;html=1;strokeColor=none;fillColor=none;align=left;verticalAlign=top;whiteSpace=wrap;fontSize=11;fontColor=#555555;" vertex="1" parent="1"><mxGeometry x="${this.poolX}" y="${this.poolY - 32}" width="${this.width}" height="28" as="geometry"/></mxCell>`
      );
    for (const f of this.free) cells.push(f);
    return `<diagram name="${esc(this.name)}" id="${esc(this.name).replace(/[^A-Za-z0-9]/g, "_")}"><mxGraphModel dx="1400" dy="800" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="1654" pageHeight="1169" math="0" shadow="0"><root><mxCell id="0"/><mxCell id="1" parent="0"/>${cells.join("\n")}</root></mxGraphModel></diagram>`;
  }
}

function file(pages) {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<mxfile host="app.diagrams.net" type="device" version="24.0.0">\n${pages.map(p => p.xml()).join("\n")}\n</mxfile>\n`;
}

const TOP = "verticalLabelPosition=top;verticalAlign=bottom;";
module.exports = { Page, file, NODE_STYLES, EDGE_STYLES, LANE_COLORS, esc, TOP };
