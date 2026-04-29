"use strict";

const axios = require("axios");
const { getFeishuApiBase } = require("./feishu-tenant");
const { getValidUserAccessToken, exchangeOauthCode } = require("./feishu-user-token");

const DEFAULT_WHITEBOARD_ID =
  (process.env.FEISHU_WHITEBOARD_DEFAULT_ID || "").trim() ||
  "S5yWwgo0dhkrCIb1qNZlBvs3gwg";

function asInt(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.round(n));
}

function min1(value) {
  return Math.max(Number(value) || 0, 1);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function chunk(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

function absPoint(node, side) {
  const { x, y, width: w, height: h } = node;
  switch (side) {
    case "top":
      return { x: x + w / 2, y };
    case "right":
      return { x: x + w, y: y + h / 2 };
    case "bottom":
      return { x: x + w / 2, y: y + h };
    case "left":
      return { x, y: y + h / 2 };
    default:
      return { x: x + w / 2, y: y + h / 2 };
  }
}

function snapPos(side) {
  switch (side) {
    case "top":
      return { x: 0.5, y: 0 };
    case "right":
      return { x: 1, y: 0.5 };
    case "bottom":
      return { x: 0.5, y: 1 };
    case "left":
      return { x: 0, y: 0.5 };
    default:
      return { x: 0.5, y: 0.5 };
  }
}

function rectNode(id, x, y, width, height, text, style, shape = "round_rect") {
  return {
    id,
    type: "composite_shape",
    x,
    y,
    angle: 0,
    width,
    height,
    z_index: style.zIndex ?? 0,
    text: text
      ? {
          text,
          font_weight: style.fontWeight || "regular",
          font_size: asInt(style.fontSize, 12),
          horizontal_align: "center",
          vertical_align: "mid",
          text_color: style.textColor || "#1f2937",
          text_background_color: "#ffffff",
          line_through: false,
          underline: false,
          italic: false,
          angle: 0,
          theme_text_color_code: -1,
          theme_text_background_color_code: -1,
          text_color_type: 0,
          text_background_color_type: 0,
        }
      : undefined,
    style: {
      fill_color: style.fillColor,
      fill_opacity: 100,
      border_width: style.borderWidth || "narrow",
      border_color: style.borderColor,
      border_opacity: 100,
      border_style: style.borderStyle || "solid",
      theme_fill_color_code: -1,
      theme_border_color_code: -1,
      fill_color_type: 0,
      border_color_type: 0,
    },
    composite_shape: { type: shape },
  };
}

function textNode(id, x, y, width, height, text, style = {}) {
  return {
    id,
    type: "text_shape",
    x,
    y,
    angle: 0,
    width,
    height,
    z_index: style.zIndex ?? 0,
    text: {
      text,
      font_weight: style.fontWeight || "regular",
      font_size: asInt(style.fontSize, 11),
      horizontal_align: style.horizontalAlign || "left",
      vertical_align: style.verticalAlign || "top",
      text_color: style.textColor || "#334155",
      text_background_color: "#ffffff",
      line_through: false,
      underline: false,
      italic: false,
      angle: 0,
      theme_text_color_code: -1,
      theme_text_background_color_code: -1,
      text_color_type: 0,
      text_background_color_type: 0,
    },
  };
}

function connectorBase(id, start, end, styleColor = "#334155") {
  return {
    id,
    type: "connector",
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    width: min1(Math.abs(end.x - start.x)),
    height: min1(Math.abs(end.y - start.y)),
    angle: 0,
    style: {
      border_width: "narrow",
      border_color: styleColor,
      border_opacity: 100,
      border_style: "solid",
      theme_border_color_code: -1,
      border_color_type: 0,
    },
    z_index: 1,
  };
}

function buildProbeVariants(leftId, rightId) {
  const start = { x: 11460, y: 152 };
  const end = { x: 11740, y: 152 };
  return [
    {
      name: "doc_example_like",
      node: {
        ...connectorBase(`probe_doc_${Date.now()}`, start, end),
        connector: {
          start_object: { id: leftId, snap_to: "right", position: { x: 1, y: 0.5 } },
          end_object: { id: rightId, snap_to: "left", position: { x: 0, y: 0.5 } },
          shape: "straight",
          turning_points: [],
          start: {
            attached_object: { id: leftId, snap_to: "right", position: { x: 1, y: 0.5 } },
            arrow_style: "none",
          },
          end: {
            attached_object: { id: rightId, snap_to: "left", position: { x: 0, y: 0.5 } },
            arrow_style: "line_arrow",
          },
          caption_auto_direction: false,
          caption_position: 0.5,
          specified_coordinate: true,
          caption_position_type: 0,
        },
      },
    },
    {
      name: "attached_only",
      node: {
        ...connectorBase(`probe_att_${Date.now()}`, start, end),
        connector: {
          shape: "straight",
          turning_points: [],
          start: { attached_object: { id: leftId, snap_to: "right" }, arrow_style: "none" },
          end: { attached_object: { id: rightId, snap_to: "left" }, arrow_style: "line_arrow" },
        },
      },
    },
    {
      name: "absolute_points_only",
      node: {
        ...connectorBase(`probe_abs_${Date.now()}`, start, end),
        connector: {
          shape: "straight",
          turning_points: [],
          start: { position: start, arrow_style: "none" },
          end: { position: end, arrow_style: "line_arrow" },
        },
      },
    },
  ];
}

function makeConnectorForVariant(
  variant,
  id,
  fromNode,
  toNode,
  fromActualId,
  toActualId,
  fromSide,
  toSide,
  color
) {
  const start = absPoint(fromNode, fromSide);
  const end = absPoint(toNode, toSide);
  const base = connectorBase(id, start, end, color);
  if (variant === "absolute_points_only") {
    return {
      ...base,
      connector: {
        shape: "straight",
        turning_points: [],
        start: { position: start, arrow_style: "none" },
        end: { position: end, arrow_style: "line_arrow" },
      },
    };
  }
  if (variant === "attached_only") {
    return {
      ...base,
      connector: {
        shape: "straight",
        turning_points: [],
        start: { attached_object: { id: fromActualId, snap_to: fromSide }, arrow_style: "none" },
        end: { attached_object: { id: toActualId, snap_to: toSide }, arrow_style: "line_arrow" },
      },
    };
  }
  return {
    ...base,
    connector: {
      start_object: { id: fromActualId, snap_to: fromSide, position: snapPos(fromSide) },
      end_object: { id: toActualId, snap_to: toSide, position: snapPos(toSide) },
      shape: "straight",
      turning_points: [],
      start: {
        attached_object: { id: fromActualId, snap_to: fromSide, position: snapPos(fromSide) },
        arrow_style: "none",
      },
      end: {
        attached_object: { id: toActualId, snap_to: toSide, position: snapPos(toSide) },
        arrow_style: "line_arrow",
      },
      caption_auto_direction: false,
      caption_position: 0.5,
      specified_coordinate: true,
      caption_position_type: 0,
    },
  };
}

const VALID_NODE_TYPES = new Set(["composite_shape", "text_shape", "connector"]);
const VALID_BORDER_WIDTHS = new Set(["extra_narrow", "narrow", "medium", "bold"]);
const VALID_BORDER_STYLES = new Set(["solid", "none", "dash", "dot"]);
const VALID_SHAPES = new Set(["rect", "round_rect", "round_rect2", "diamond"]);
const VALID_SNAP_TO = new Set(["left", "right", "top", "bottom", "auto"]);
const VALID_ARROW_STYLES = new Set([
  "none",
  "line_arrow",
  "triangle_arrow",
  "empty_triangle_arrow",
  "circle_arrow",
  "empty_circle_arrow",
  "diamond_arrow",
  "empty_diamond_arrow",
  "single_arrow",
  "multi_arrow",
  "exact_single_arrow",
  "zero_or_multi_arrow",
  "zero_or_single_arrow",
  "single_or_multi_arrow",
  "x_arrow",
]);

function pushError(errors, nodeId, message) {
  errors.push(`${nodeId}: ${message}`);
}

function validateTextBlock(text, nodeId, errors) {
  if (!text) return;
  if (typeof text.text !== "string") pushError(errors, nodeId, "text.text must be a string");
  if (!Number.isInteger(text.font_size)) pushError(errors, nodeId, "text.font_size must be an integer");
  if (![0, 90, 180, 270].includes(text.angle)) pushError(errors, nodeId, "text.angle must be 0/90/180/270");
}

function validateStyle(style, nodeId, errors) {
  if (!style) return;
  if (style.border_width && !VALID_BORDER_WIDTHS.has(style.border_width)) {
    pushError(errors, nodeId, `unsupported border_width: ${style.border_width}`);
  }
  if (style.border_style && !VALID_BORDER_STYLES.has(style.border_style)) {
    pushError(errors, nodeId, `unsupported border_style: ${style.border_style}`);
  }
  if (style.fill_opacity !== undefined && !Number.isInteger(style.fill_opacity)) {
    pushError(errors, nodeId, "style.fill_opacity must be an integer");
  }
  if (style.border_opacity !== undefined && !Number.isInteger(style.border_opacity)) {
    pushError(errors, nodeId, "style.border_opacity must be an integer");
  }
}

function validateConnectorObject(obj, nodeId, key, errors) {
  if (!obj) return;
  if (typeof obj.id !== "string") pushError(errors, nodeId, `${key}.id must be a string`);
  if (obj.snap_to && !VALID_SNAP_TO.has(obj.snap_to)) {
    pushError(errors, nodeId, `${key}.snap_to invalid`);
  }
  if (obj.position) {
    if (typeof obj.position.x !== "number" || typeof obj.position.y !== "number") {
      pushError(errors, nodeId, `${key}.position must contain numeric x/y`);
    }
  }
}

function validateConnectorEndpoint(endpoint, nodeId, key, errors) {
  if (!endpoint) return;
  if (endpoint.attached_object) {
    validateConnectorObject(endpoint.attached_object, nodeId, `${key}.attached_object`, errors);
  }
  if (endpoint.position) {
    if (typeof endpoint.position.x !== "number" || typeof endpoint.position.y !== "number") {
      pushError(errors, nodeId, `${key}.position must contain numeric x/y`);
    }
  }
  if (endpoint.arrow_style && !VALID_ARROW_STYLES.has(endpoint.arrow_style)) {
    pushError(errors, nodeId, `${key}.arrow_style invalid`);
  }
}

function validateNodes(nodes) {
  const errors = [];
  const ids = new Set();
  for (const node of nodes) {
    const nodeId = node?.id || "(missing id)";
    if (!node || typeof node !== "object") {
      errors.push("node must be an object");
      continue;
    }
    if (typeof node.id !== "string" || !node.id.trim()) pushError(errors, nodeId, "id must be a non-empty string");
    if (typeof node.id === "string" && node.id.length > 100) pushError(errors, nodeId, "id too long");
    if (ids.has(node.id)) pushError(errors, nodeId, "duplicate id");
    ids.add(node.id);
    if (!VALID_NODE_TYPES.has(node.type)) pushError(errors, nodeId, `unsupported type: ${node.type}`);
    if (typeof node.x !== "number" || typeof node.y !== "number") pushError(errors, nodeId, "x/y must be numeric");
    if (!Number.isInteger(node.angle)) pushError(errors, nodeId, "angle must be an integer");
    if (node.z_index !== undefined && !Number.isInteger(node.z_index)) {
      pushError(errors, nodeId, "z_index must be an integer");
    }
    validateTextBlock(node.text, nodeId, errors);
    validateStyle(node.style, nodeId, errors);

    if (node.type === "composite_shape") {
      const shapeType = node.composite_shape && node.composite_shape.type;
      if (!VALID_SHAPES.has(shapeType)) {
        pushError(errors, nodeId, `unsupported composite_shape.type: ${shapeType}`);
      }
    }
    if (node.type === "connector") {
      if (node.text) pushError(errors, nodeId, "connector must not contain text");
      if (!node.connector) pushError(errors, nodeId, "connector field is required");
      if (node.connector) {
        validateConnectorObject(node.connector.start_object, nodeId, "start_object", errors);
        validateConnectorObject(node.connector.end_object, nodeId, "end_object", errors);
        validateConnectorEndpoint(node.connector.start, nodeId, "start", errors);
        validateConnectorEndpoint(node.connector.end, nodeId, "end", errors);
      }
    }
  }
  return errors;
}

function buildSwimlanePayload(options = {}) {
  const ox = Number(options.offsetX || 12400);
  const oy = Number(options.offsetY || 0);
  const nodes = [];
  const geom = {};
  const add = (node, meta) => {
    nodes.push(node);
    geom[node.id] = meta || {
      x: node.x,
      y: node.y,
      width: node.width || 0,
      height: node.height || 0,
    };
  };

  add(rectNode("title_bar", ox + 120, oy + 0, 1120, 48, "", { fillColor: "#0b5cab", borderColor: "#0b5cab" }, "rect"));
  add(textNode("title_text", ox + 420, oy + 14, 520, 24, "实体卡激活 - 主流程泳道", { fontWeight: "bold", fontSize: 17, horizontalAlign: "center", verticalAlign: "mid", textColor: "#ffffff" }), { x: ox + 420, y: oy + 14, width: 520, height: 24 });
  add(rectNode("lane_label_strip", ox + 0, oy + 56, 120, 720, "", { fillColor: "#0f172a", borderColor: "#0f172a" }, "rect"));
  add(rectNode("lane_user", ox + 120, oy + 56, 1120, 180, "", { fillColor: "#f1f5f9", borderColor: "#94a3b8", borderWidth: "extra_narrow" }, "rect"));
  add(rectNode("lane_app", ox + 120, oy + 236, 1120, 220, "", { fillColor: "#f8fafc", borderColor: "#94a3b8", borderWidth: "extra_narrow" }, "rect"));
  add(rectNode("lane_aai", ox + 120, oy + 456, 1120, 140, "", { fillColor: "#f1f5f9", borderColor: "#94a3b8", borderWidth: "extra_narrow" }, "rect"));
  add(rectNode("lane_backend", ox + 120, oy + 596, 1120, 200, "", { fillColor: "#f8fafc", borderColor: "#94a3b8", borderWidth: "extra_narrow" }, "rect"));
  add(textNode("lane_user_label", ox + 20, oy + 130, 80, 20, "用户", { fontWeight: "bold", fontSize: 13, horizontalAlign: "center", verticalAlign: "mid", textColor: "#ffffff" }), { x: ox + 20, y: oy + 130, width: 80, height: 20 });
  add(textNode("lane_app_label", ox + 20, oy + 330, 80, 20, "App 前端", { fontWeight: "bold", fontSize: 13, horizontalAlign: "center", verticalAlign: "mid", textColor: "#ffffff" }), { x: ox + 20, y: oy + 330, width: 80, height: 20 });
  add(textNode("lane_aai_label", ox + 8, oy + 510, 104, 20, "AAI 身份认证", { fontWeight: "bold", fontSize: 12, horizontalAlign: "center", verticalAlign: "mid", textColor: "#ffffff" }), { x: ox + 8, y: oy + 510, width: 104, height: 20 });
  add(textNode("lane_backend_label", ox + 4, oy + 680, 112, 20, "卡服务 / 后端", { fontWeight: "bold", fontSize: 11, horizontalAlign: "center", verticalAlign: "mid", textColor: "#ffffff" }), { x: ox + 4, y: oy + 680, width: 112, height: 20 });

  const white = { fillColor: "#ffffff", borderColor: "#334155", textColor: "#1e293b", fontSize: 12 };
  add(rectNode("u1", ox + 150, oy + 100, 200, 44, "进入 Card Manage / 激活入口", white));
  add(rectNode("u2", ox + 380, oy + 100, 200, 44, "输入实体卡后 4 位", white));
  add(rectNode("u3", ox + 610, oy + 100, 160, 44, "Set PIN", white));
  add(rectNode("u4", ox + 800, oy + 100, 160, 44, "Confirm PIN", white));
  add(rectNode("u5", ox + 990, oy + 100, 200, 44, "完成 AAI 认证操作", white));
  add(rectNode("fe1", ox + 150, oy + 268, 200, 40, "展示激活入口 / Card Manage", { fillColor: "#e0f2fe", borderColor: "#0369a1", textColor: "#0c4a6e", fontSize: 12 }));
  add(rectNode("fe2", ox + 380, oy + 260, 200, 56, "自动提交\n（输入后 4 位触发）", { fillColor: "#dbeafe", borderColor: "#1d4ed8", textColor: "#1e3a8a", fontSize: 12 }));
  add(rectNode("d1", ox + 600, oy + 268, 80, 40, "后 4 位\n匹配？", { fillColor: "#fef3c7", borderColor: "#b45309", textColor: "#78350f", fontSize: 11 }, "diamond"));
  add(rectNode("fe3", ox + 700, oy + 268, 180, 40, "错误提示 -> 返回输入", { fillColor: "#fee2e2", borderColor: "#b91c1c", textColor: "#7f1d1d", fontSize: 11 }));
  add(rectNode("fe4", ox + 900, oy + 268, 140, 40, "进入 Set PIN", { fillColor: "#dcfce7", borderColor: "#166534", textColor: "#14532d", fontSize: 11 }));
  add(rectNode("fe5", ox + 150, oy + 340, 200, 50, "两次 PIN\n是否一致？", { fillColor: "#fef9c3", borderColor: "#ca8a04", textColor: "#713f12", fontSize: 11 }));
  add(rectNode("fe6", ox + 380, oy + 345, 200, 40, "Toast -> 返回 Set PIN", { fillColor: "#fee2e2", borderColor: "#b91c1c", textColor: "#7f1d1d", fontSize: 11 }));
  add(rectNode("fe7", ox + 610, oy + 345, 180, 40, "拉起 AAI", { fillColor: "#e0e7ff", borderColor: "#4338ca", textColor: "#312e81", fontSize: 11 }));
  add(rectNode("fe8", ox + 820, oy + 345, 200, 40, "认证通过 -> 调用 Card Activation", { fillColor: "#dcfce7", borderColor: "#166534", textColor: "#14532d", fontSize: 11 }));
  add(rectNode("fe9", ox + 1040, oy + 330, 170, 70, "结果分流\n成功 / 各类失败页\n见下方说明", { fillColor: "#f1f5f9", borderColor: "#475569", textColor: "#334155", fontSize: 10 }));
  add(rectNode("a1", ox + 610, oy + 498, 220, 56, "AAI 身份认证流程\n（用户侧完成挑战/生物特征等）", { fillColor: "#ede9fe", borderColor: "#5b21b6", textColor: "#4c1d95", fontSize: 12 }));
  add(rectNode("a2", ox + 880, oy + 506, 200, 40, "向 App 返回认证结果", { fillColor: "#ddd6fe", borderColor: "#6d28d9", textColor: "#3b0764", fontSize: 11 }));
  add(rectNode("b1", ox + 380, oy + 638, 220, 44, "Inquiry Card Basic Info", { fillColor: "#ecfdf5", borderColor: "#047857", textColor: "#064e3b", fontSize: 11 }));
  add(rectNode("b2", ox + 640, oy + 638, 200, 44, "校验后 4 位是否匹配", { fillColor: "#ecfdf5", borderColor: "#047857", textColor: "#064e3b", fontSize: 11 }));
  add(rectNode("b3", ox + 880, oy + 638, 200, 44, "Card Activation", { fillColor: "#d1fae5", borderColor: "#059669", textColor: "#065f46", fontSize: 11 }));
  add(textNode("lbl_match", ox + 740, oy + 274, 60, 16, "匹配", { fontSize: 9, textColor: "#14532d", horizontalAlign: "center" }), { x: ox + 740, y: oy + 274, width: 60, height: 16 });
  add(textNode("lbl_nomatch", ox + 790, oy + 194, 50, 16, "不匹配", { fontSize: 9, textColor: "#92400e", horizontalAlign: "center" }), { x: ox + 790, y: oy + 194, width: 50, height: 16 });
  add(textNode("lbl_not_same", ox + 470, oy + 324, 50, 16, "不一致", { fontSize: 9, textColor: "#991b1b", horizontalAlign: "center" }), { x: ox + 470, y: oy + 324, width: 50, height: 16 });
  add(textNode("lbl_req", ox + 490, oy + 432, 30, 16, "请求", { fontSize: 9, textColor: "#065f46", horizontalAlign: "center" }), { x: ox + 490, y: oy + 432, width: 30, height: 16 });
  add(textNode("lbl_verify", ox + 700, oy + 454, 60, 16, "校验结果", { fontSize: 9, textColor: "#065f46", horizontalAlign: "center" }), { x: ox + 700, y: oy + 454, width: 60, height: 16 });
  add(rectNode("legend", ox + 120, oy + 808, 1000, 100, "结果分流（Card Activation 响应后）\n激活成功 -> Card Home（或等价成功落地页）\nActive Fail / Set Fail / Network Error / Server Error Page\n说明：实线为主路径与同步调用方向。", { fillColor: "#ffffff", borderColor: "#94a3b8", textColor: "#334155", fontSize: 11 }, "rect"));

  const edges = [
    ["e1", "u1", "u2", "right", "left", "#334155"],
    ["e2", "u1", "fe1", "bottom", "top", "#334155"],
    ["e3", "fe1", "fe2", "right", "left", "#334155"],
    ["e4", "fe2", "b1", "bottom", "top", "#047857"],
    ["e5", "b1", "b2", "right", "left", "#047857"],
    ["e6", "b2", "d1", "top", "bottom", "#047857"],
    ["e7", "d1", "fe3", "right", "left", "#b45309"],
    ["e8", "d1", "fe4", "right", "left", "#166534"],
    ["e9", "fe4", "u3", "top", "bottom", "#166534"],
    ["e10", "u3", "u4", "right", "left", "#334155"],
    ["e11", "u4", "fe5", "bottom", "top", "#334155"],
    ["e12", "fe5", "fe6", "right", "left", "#b91c1c"],
    ["e13", "fe6", "u3", "top", "bottom", "#b91c1c"],
    ["e14", "fe5", "fe7", "right", "left", "#334155"],
    ["e15", "fe7", "a1", "bottom", "top", "#5b21b6"],
    ["e16", "u4", "u5", "right", "left", "#334155"],
    ["e17", "u5", "a1", "bottom", "top", "#5b21b6"],
    ["e18", "a1", "a2", "right", "left", "#6d28d9"],
    ["e19", "a2", "fe8", "top", "bottom", "#6d28d9"],
    ["e20", "fe8", "b3", "bottom", "top", "#059669"],
    ["e21", "b3", "fe9", "top", "bottom", "#059669"],
  ];

  return { nodes, edges, geom };
}

async function createWhiteboardNodes(whiteboardId, accessToken, nodes) {
  return axios.post(
    `${getFeishuApiBase()}/board/v1/whiteboards/${encodeURIComponent(
      whiteboardId
    )}/nodes`,
    { nodes },
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json; charset=utf-8",
      },
      timeout: 30000,
      validateStatus: () => true,
    }
  );
}

async function createWhiteboardNodesWithRetry(whiteboardId, accessToken, nodes) {
  let last;
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    const res = await createWhiteboardNodes(whiteboardId, accessToken, nodes);
    last = res;
    const body = res.data || {};
    if (res.status < 400 && body.code === 0) return { ok: true, res, attempts: attempt };
    if (body.code !== 4003101) return { ok: false, res, attempts: attempt };
    await sleep(attempt * 1800);
  }
  return { ok: false, res: last, attempts: 6 };
}

function buildConnectorNodes(variant, edges, geom, idMap) {
  return edges.map(([id, from, to, fromSide, toSide, color]) =>
    makeConnectorForVariant(
      variant,
      id,
      geom[from],
      geom[to],
      idMap.get(from),
      idMap.get(to),
      fromSide,
      toSide,
      color
    )
  );
}

function buildDryRunResult(options = {}) {
  const payload = buildSwimlanePayload(options);
  const shapeValidationErrors = validateNodes(payload.nodes);
  const probeVariants = buildProbeVariants("probe_left_actual", "probe_right_actual");
  const probeConnectorValidationErrors = probeVariants.flatMap((variant) =>
    validateNodes([variant.node]).map((msg) => `${variant.name}: ${msg}`)
  );
  const connectorValidationErrors = validateNodes([
    makeConnectorForVariant(
      "absolute_points_only",
      "dry_e1",
      payload.geom.u1,
      payload.geom.u2,
      "u1_actual",
      "u2_actual",
      "right",
      "left",
      "#334155"
    ),
  ]);
  return {
    ok:
      shapeValidationErrors.length === 0 &&
      probeConnectorValidationErrors.length === 0 &&
      connectorValidationErrors.length === 0,
    dryRun: true,
    shapeCount: payload.nodes.length,
    connectorProbeVariants: probeVariants.map((item) => item.name),
    shapeValidationErrors,
    probeConnectorValidationErrors,
    connectorValidationErrors,
  };
}

async function writeSwimlaneToWhiteboard(options = {}) {
  const whiteboardId = (options.whiteboardId || DEFAULT_WHITEBOARD_ID).trim();
  if (!whiteboardId) {
    return { ok: false, error: "no_whiteboard_id" };
  }
  if (options.dryRun) {
    return buildDryRunResult(options);
  }

  if (options.oauthCode) {
    const exchanged = await exchangeOauthCode(options.oauthCode, {
      redirectUri: options.redirectUri,
    });
    if (!exchanged.ok) return exchanged;
  }

  const tokenRes = await getValidUserAccessToken();
  if (!tokenRes.ok) return tokenRes;
  const accessToken = tokenRes.token;

  const payload = buildSwimlanePayload(options);
  const shapeValidationErrors = validateNodes(payload.nodes);
  if (shapeValidationErrors.length) {
    return { ok: false, error: "preflight_shapes_failed", errors: shapeValidationErrors };
  }

  const probeShapes = [
    rectNode("probe_left", 11300, 120, 160, 64, "Probe Left", {
      fillColor: "#e1eaff",
      borderColor: "#4e83fd",
      textColor: "#1f2329",
      fontSize: 14,
    }),
    rectNode("probe_right", 11740, 120, 160, 64, "Probe Right", {
      fillColor: "#eafaf4",
      borderColor: "#4bb38a",
      textColor: "#1f2329",
      fontSize: 14,
    }),
  ];
  const probeCreate = await createWhiteboardNodesWithRetry(
    whiteboardId,
    accessToken,
    probeShapes
  );
  if (!probeCreate.ok) {
    return {
      ok: false,
      error: "probe_shapes_failed",
      status: probeCreate.res.status,
      body: probeCreate.res.data,
    };
  }
  const [leftId, rightId] = (((probeCreate.res.data || {}).data || {}).ids) || [];

  let successfulVariant = null;
  const probeFailures = [];
  for (const variant of buildProbeVariants(leftId, rightId)) {
    const validationErrors = validateNodes([variant.node]);
    if (validationErrors.length) {
      probeFailures.push({ variant: variant.name, validationErrors });
      continue;
    }
    const out = await createWhiteboardNodesWithRetry(whiteboardId, accessToken, [variant.node]);
    if (out.ok) {
      successfulVariant = variant.name;
      break;
    }
    probeFailures.push({ variant: variant.name, status: out.res.status, body: out.res.data });
  }
  if (!successfulVariant) {
    return { ok: false, error: "probe_connectors_failed", probeFailures };
  }

  const idMap = new Map();
  let createdShapeCount = 0;
  for (const batch of chunk(payload.nodes, 40)) {
    const out = await createWhiteboardNodesWithRetry(whiteboardId, accessToken, batch);
    if (!out.ok) {
      return {
        ok: false,
        error: "create_shapes_failed",
        status: out.res.status,
        body: out.res.data,
        successfulVariant,
      };
    }
    const ids = (((out.res.data || {}).data || {}).ids) || [];
    createdShapeCount += ids.length;
    batch.forEach((node, idx) => {
      if (node?.id && ids[idx]) idMap.set(node.id, ids[idx]);
    });
  }

  const connectorNodes = buildConnectorNodes(
    successfulVariant,
    payload.edges,
    payload.geom,
    idMap
  );
  const connectorValidationErrors = validateNodes(connectorNodes);
  if (connectorValidationErrors.length) {
    return {
      ok: false,
      error: "preflight_connectors_failed",
      successfulVariant,
      errors: connectorValidationErrors,
    };
  }

  let createdConnectorCount = 0;
  for (const batch of chunk(connectorNodes, 30)) {
    const out = await createWhiteboardNodesWithRetry(whiteboardId, accessToken, batch);
    if (!out.ok) {
      return {
        ok: false,
        error: "create_connectors_failed",
        status: out.res.status,
        body: out.res.data,
        successfulVariant,
        sampleConnector: batch[0],
      };
    }
    createdConnectorCount += ((((out.res.data || {}).data || {}).ids) || []).length;
  }

  return {
    ok: true,
    whiteboardId,
    successfulVariant,
    createdShapeCount,
    createdConnectorCount,
    tokenSource: tokenRes.source,
    note: "full swimlane written",
  };
}

module.exports = {
  DEFAULT_WHITEBOARD_ID,
  buildDryRunResult,
  buildSwimlanePayload,
  buildProbeVariants,
  createWhiteboardNodes,
  createWhiteboardNodesWithRetry,
  validateNodes,
  writeSwimlaneToWhiteboard,
};
