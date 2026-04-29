"use strict";

const { test, describe, afterEach } = require("node:test");
const assert = require("node:assert");

const { _test: imageTest } = require("../lib/feishu-docx-image");
const {
  _test,
  resolveFeishuDocExportKind,
  mergeLongReplyDocExportKind,
  buildDescendantsFromBody,
} = require("../lib/feishu-docx-export");

describe("normalizeDescendantBlocksForApi", () => {
  test("adds children array and children_id list", () => {
    const blocks = [
      { block_id: "t_a", block_type: 2, text: { elements: [{ text_run: { content: "x" } }] } },
    ];
    const p = _test.normalizeDescendantBlocksForApi(blocks);
    assert.strictEqual(p.ok, true);
    assert.deepStrictEqual(p.children_id, ["t_a"]);
    assert.strictEqual(p.normalized[0].children.length, 0);
  });
});
const {
  isReportLikeTask,
  isResearchLikeTask,
} = require("../lib/feishu-cursor-route.js");

describe("feishu-docx-export helpers", () => {
  const prev = { ...process.env };

  afterEach(() => {
    process.env.FEISHU_LARK_DOMAIN = prev.FEISHU_LARK_DOMAIN;
    process.env.FEISHU_DOC_PORTAL_ORIGIN = prev.FEISHU_DOC_PORTAL_ORIGIN;
    process.env.FEISHU_DOCS_EXPORT_TITLE_PREFIX = prev.FEISHU_DOCS_EXPORT_TITLE_PREFIX;
  });

  test("buildTitle clamps length and uses prefix", () => {
    process.env.FEISHU_DOCS_EXPORT_TITLE_PREFIX = "[T]";
    const long = "x".repeat(900);
    const t = _test.buildTitle(`${long}\nsecond`, "research");
    assert.ok(t.startsWith("[T]"));
    assert.ok(t.length <= 800);
  });

  test("buildTitle report kind default prefix", () => {
    delete process.env.FEISHU_DOCS_EXPORT_TITLE_PREFIX;
    const t = _test.buildTitle("数据报告 foo", "report");
    assert.ok(t.startsWith("[报告]"));
  });

  test("chunkTextForBlocks splits by size", () => {
    const s = "a".repeat(10);
    const parts = _test.chunkTextForBlocks(s, 4);
    assert.deepStrictEqual(parts, ["aaaa", "aaaa", "aa"]);
  });

  test("buildDocxUrl uses FEISHU_DOC_PORTAL_ORIGIN when set", () => {
    process.env.FEISHU_DOC_PORTAL_ORIGIN = "https://corp.feishu.cn";
    assert.strictEqual(_test.buildDocxUrl("doc123"), "https://corp.feishu.cn/docx/doc123");
  });

  test("portalBase defaults for feishu domain", () => {
    delete process.env.FEISHU_DOC_PORTAL_ORIGIN;
    process.env.FEISHU_LARK_DOMAIN = "feishu";
    assert.strictEqual(_test.portalBase(), "https://feishu.cn");
  });

  test("resolveFeishuDocExportKind picks research then report", () => {
    const prev = process.env.FEISHU_CLOUD_DOC_EXPORT;
    process.env.FEISHU_CLOUD_DOC_EXPORT = "1";
    assert.strictEqual(
      resolveFeishuDocExportKind("技术调研 x", {
        isResearchLikeTask: () => true,
        isReportLikeTask: () => true,
      }),
      "research"
    );
    assert.strictEqual(
      resolveFeishuDocExportKind("输出报告 y", {
        isResearchLikeTask: () => false,
        isReportLikeTask: () => true,
      }),
      "report"
    );
    if (prev === undefined) delete process.env.FEISHU_CLOUD_DOC_EXPORT;
    else process.env.FEISHU_CLOUD_DOC_EXPORT = prev;
  });

  test("resolveFeishuDocExportKind：classification.taskType 优先于关键词（已判 research 即导出）", () => {
    const prev = process.env.FEISHU_CLOUD_DOC_EXPORT;
    process.env.FEISHU_CLOUD_DOC_EXPORT = "1";
    assert.strictEqual(
      resolveFeishuDocExportKind(
        "简短任务",
        { isResearchLikeTask: () => false, isReportLikeTask: () => false },
        { taskType: "research" }
      ),
      "research"
    );
    assert.strictEqual(
      resolveFeishuDocExportKind(
        "简短任务",
        { isResearchLikeTask: () => true, isReportLikeTask: () => false },
        { taskType: "report" }
      ),
      "report"
    );
    if (prev === undefined) delete process.env.FEISHU_CLOUD_DOC_EXPORT;
    else process.env.FEISHU_CLOUD_DOC_EXPORT = prev;
  });

  test("resolveFeishuDocExportKind：真实 route 检测器下「创建飞书文档」命中 report", () => {
    const prev = process.env.FEISHU_CLOUD_DOC_EXPORT;
    process.env.FEISHU_CLOUD_DOC_EXPORT = "1";
    assert.strictEqual(
      resolveFeishuDocExportKind("帮我创建飞书文档写总结", {
        isResearchLikeTask,
        isReportLikeTask,
      }),
      "report"
    );
    if (prev === undefined) delete process.env.FEISHU_CLOUD_DOC_EXPORT;
    else process.env.FEISHU_CLOUD_DOC_EXPORT = prev;
  });

  test("buildDescendantsFromBody uses markdown by default", () => {
    delete process.env.FEISHU_DOC_EXPORT_PLAIN_ONLY;
    const blocks = buildDescendantsFromBody("# H\n\nHi");
    assert.strictEqual(blocks[0].block_type, 22);
    assert.strictEqual(blocks[1].block_type, 3);
  });

  test("mergeLongReplyDocExportKind does not force when cloud export disabled", () => {
    const prevCloud = process.env.FEISHU_CLOUD_DOC_EXPORT;
    const prevResearch = process.env.FEISHU_RESEARCH_DOC_EXPORT;
    const prevMin = process.env.FEISHU_DOC_EXPORT_LONG_REPLY_MIN_CHARS;
    delete process.env.FEISHU_CLOUD_DOC_EXPORT;
    delete process.env.FEISHU_RESEARCH_DOC_EXPORT;
    process.env.FEISHU_DOC_EXPORT_LONG_REPLY_MIN_CHARS = "10";
    assert.deepStrictEqual(
      mergeLongReplyDocExportKind({
        exportKind: null,
        replyBody: "x".repeat(20),
        code: 0,
        chatId: "oc_1",
      }),
      { exportKind: null, longReplyForced: false }
    );
    if (prevCloud === undefined) delete process.env.FEISHU_CLOUD_DOC_EXPORT;
    else process.env.FEISHU_CLOUD_DOC_EXPORT = prevCloud;
    if (prevResearch === undefined) delete process.env.FEISHU_RESEARCH_DOC_EXPORT;
    else process.env.FEISHU_RESEARCH_DOC_EXPORT = prevResearch;
    if (prevMin === undefined) delete process.env.FEISHU_DOC_EXPORT_LONG_REPLY_MIN_CHARS;
    else process.env.FEISHU_DOC_EXPORT_LONG_REPLY_MIN_CHARS = prevMin;
  });

  test("mergeLongReplyDocExportKind forces report for long body", () => {
    const prevCloud = process.env.FEISHU_CLOUD_DOC_EXPORT;
    const prevMin = process.env.FEISHU_DOC_EXPORT_LONG_REPLY_MIN_CHARS;
    const prevModes = process.env.FEISHU_DOC_EXPORT_MODES;
    process.env.FEISHU_CLOUD_DOC_EXPORT = "1";
    process.env.FEISHU_DOC_EXPORT_LONG_REPLY_MIN_CHARS = "10";
    delete process.env.FEISHU_DOC_EXPORT_MODES;
    assert.deepStrictEqual(
      mergeLongReplyDocExportKind({
        exportKind: null,
        replyBody: "y".repeat(20),
        code: 0,
        chatId: "oc_1",
      }),
      { exportKind: "report", longReplyForced: true }
    );
    if (prevCloud === undefined) delete process.env.FEISHU_CLOUD_DOC_EXPORT;
    else process.env.FEISHU_CLOUD_DOC_EXPORT = prevCloud;
    if (prevMin === undefined) delete process.env.FEISHU_DOC_EXPORT_LONG_REPLY_MIN_CHARS;
    else process.env.FEISHU_DOC_EXPORT_LONG_REPLY_MIN_CHARS = prevMin;
    if (prevModes === undefined) delete process.env.FEISHU_DOC_EXPORT_MODES;
    else process.env.FEISHU_DOC_EXPORT_MODES = prevModes;
  });

  test("mergeLongReplyDocExportKind respects chat allowlist", () => {
    const prevCloud = process.env.FEISHU_CLOUD_DOC_EXPORT;
    const prevMin = process.env.FEISHU_DOC_EXPORT_LONG_REPLY_MIN_CHARS;
    const prevAllow = process.env.FEISHU_DOC_EXPORT_LONG_REPLY_CHAT_IDS;
    process.env.FEISHU_CLOUD_DOC_EXPORT = "1";
    process.env.FEISHU_DOC_EXPORT_LONG_REPLY_MIN_CHARS = "5";
    process.env.FEISHU_DOC_EXPORT_LONG_REPLY_CHAT_IDS = "oc_other";
    assert.deepStrictEqual(
      mergeLongReplyDocExportKind({
        exportKind: null,
        replyBody: "z".repeat(20),
        code: 0,
        chatId: "oc_1",
      }),
      { exportKind: null, longReplyForced: false }
    );
    if (prevCloud === undefined) delete process.env.FEISHU_CLOUD_DOC_EXPORT;
    else process.env.FEISHU_CLOUD_DOC_EXPORT = prevCloud;
    if (prevMin === undefined) delete process.env.FEISHU_DOC_EXPORT_LONG_REPLY_MIN_CHARS;
    else process.env.FEISHU_DOC_EXPORT_LONG_REPLY_MIN_CHARS = prevMin;
    if (prevAllow === undefined) delete process.env.FEISHU_DOC_EXPORT_LONG_REPLY_CHAT_IDS;
    else process.env.FEISHU_DOC_EXPORT_LONG_REPLY_CHAT_IDS = prevAllow;
  });

  test("mergeLongReplyDocExportKind skips on nonzero code", () => {
    const prevCloud = process.env.FEISHU_CLOUD_DOC_EXPORT;
    const prevMin = process.env.FEISHU_DOC_EXPORT_LONG_REPLY_MIN_CHARS;
    process.env.FEISHU_CLOUD_DOC_EXPORT = "1";
    process.env.FEISHU_DOC_EXPORT_LONG_REPLY_MIN_CHARS = "5";
    assert.deepStrictEqual(
      mergeLongReplyDocExportKind({
        exportKind: null,
        replyBody: "a".repeat(20),
        code: 1,
        chatId: "oc_1",
      }),
      { exportKind: null, longReplyForced: false }
    );
    if (prevCloud === undefined) delete process.env.FEISHU_CLOUD_DOC_EXPORT;
    else process.env.FEISHU_CLOUD_DOC_EXPORT = prevCloud;
    if (prevMin === undefined) delete process.env.FEISHU_DOC_EXPORT_LONG_REPLY_MIN_CHARS;
    else process.env.FEISHU_DOC_EXPORT_LONG_REPLY_MIN_CHARS = prevMin;
  });

  test("mergeLongReplyDocExportKind keeps existing research", () => {
    const prevCloud = process.env.FEISHU_CLOUD_DOC_EXPORT;
    const prevMin = process.env.FEISHU_DOC_EXPORT_LONG_REPLY_MIN_CHARS;
    process.env.FEISHU_CLOUD_DOC_EXPORT = "1";
    process.env.FEISHU_DOC_EXPORT_LONG_REPLY_MIN_CHARS = "5";
    assert.deepStrictEqual(
      mergeLongReplyDocExportKind({
        exportKind: "research",
        replyBody: "b",
        code: 0,
        chatId: "oc_1",
      }),
      { exportKind: "research", longReplyForced: false }
    );
    if (prevCloud === undefined) delete process.env.FEISHU_CLOUD_DOC_EXPORT;
    else process.env.FEISHU_CLOUD_DOC_EXPORT = prevCloud;
    if (prevMin === undefined) delete process.env.FEISHU_DOC_EXPORT_LONG_REPLY_MIN_CHARS;
    else process.env.FEISHU_DOC_EXPORT_LONG_REPLY_MIN_CHARS = prevMin;
  });
});


describe("feishu-docx-image helpers", () => {
  test("extractScreenshotCandidates prefers public product pages", () => {
    const items = imageTest.extractScreenshotCandidates(`## Slack
- 官网：[Pricing](https://slack.com/pricing)
- 文档：https://docs.slack.dev`);
    assert.ok(items.length >= 1);
    assert.strictEqual(items[0].url, "https://slack.com/pricing");
  });

  test("buildCaptureSelectors adds pricing selectors for pricing pages", () => {
    const selectors = imageTest.buildCaptureSelectors({
      section: "Pricing",
      label: "Plans",
      url: "https://example.com/pricing",
    });
    assert.ok(selectors.includes("[data-testid*=pricing]"));
    assert.ok(selectors.includes("main"));
  });

  test("buildAppendixBlocks creates native image placeholders", () => {
    const appendix = imageTest.buildAppendixBlocks([
      {
        title: "Slack Pricing",
        sourceUrl: "https://slack.com/pricing",
        captureMode: "selector",
        selectorUsed: "main",
        caption: "Pricing cards overview",
        buffer: Buffer.from("89504e470d0a1a0a0000000d4948445200000001000000010802000000907724de0000000c49444154789c6360000000020001e221bc330000000049454e44ae426082", "hex"),
      },
    ]);
    assert.strictEqual(appendix.blocks[1].block_type, 4);
    assert.strictEqual(appendix.blocks[3].block_type, 27);
    assert.strictEqual(appendix.pendingImages.length, 1);
    assert.strictEqual(appendix.pendingImages[0].dimensions.width, 1);
  });
});
