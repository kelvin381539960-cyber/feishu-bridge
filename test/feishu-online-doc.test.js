"use strict";

const { test, describe } = require("node:test");
const assert = require("node:assert");
const {
  classifyFeishuUrl,
  extractUrls,
  normalizeFeishuPasteUrl,
  formatFeishuDocReply,
  formatBitableCellValue,
  renderBitableTable,
  shouldUseBrowserFallback,
  extractEmbeddedResourcesFromContent,
  extractEmbeddedResourcesFromDocBlocks,
  extractEmbeddedResources,
  summarizeContent,
  summarizeWhiteboardResult,
  formatFeishuResourceGraphReply,
} = require("../lib/feishu-online-doc.js");

const fixtureEmbed = require("./fixtures/doc-blocks-with-whiteboard-embed.json");
const fixtureLink = require("./fixtures/doc-blocks-with-link-in-text.json");
const fixtureNoEmbed = require("./fixtures/doc-blocks-no-embed.json");

describe("feishu-online-doc", () => {
  test("extractUrls: 识别飞书链接", () => {
    const urls = extractUrls("看这个 https://xxx.feishu.cn/docx/AbC123 和这个");
    assert.strictEqual(urls.length, 1);
  });

  test("normalizeFeishuPasteUrl: 去掉飞书重复的 url(url) 粘贴", () => {
    const u = "https://advancegroup.sg.larksuite.com/sheets/AMyTsXvWShxuwLt1Qz5lOiNngOd(https://advancegroup.sg.larksuite.com/sheets/AMyTsXvWShxuwLt1Qz5lOiNngOd)";
    assert.strictEqual(
      normalizeFeishuPasteUrl(u),
      "https://advancegroup.sg.larksuite.com/sheets/AMyTsXvWShxuwLt1Qz5lOiNngOd"
    );
  });

  test("extractUrls: 重复括号粘贴后得到干净 URL", () => {
    const messy =
      "表 https://advancegroup.sg.larksuite.com/sheets/AMyTsXvWShxuwLt1Qz5lOiNngOd(https://advancegroup.sg.larksuite.com/sheets/AMyTsXvWShxuwLt1Qz5lOiNngOd)";
    const urls = extractUrls(messy);
    assert.strictEqual(urls[0], "https://advancegroup.sg.larksuite.com/sheets/AMyTsXvWShxuwLt1Qz5lOiNngOd");
  });

  test("classifyFeishuUrl: docx", () => {
    const r = classifyFeishuUrl("https://xxx.feishu.cn/docx/AbC123");
    assert.deepStrictEqual(r, { type: "docx", token: "AbC123" });
  });

  test("classifyFeishuUrl: wiki", () => {
    const r = classifyFeishuUrl("https://xxx.feishu.cn/wiki/AbC123");
    assert.deepStrictEqual(r, { type: "wiki", token: "AbC123" });
  });

  test("classifyFeishuUrl: sheet", () => {
    const r = classifyFeishuUrl("https://xxx.feishu.cn/sheets/AbC123");
    assert.deepStrictEqual(r, { type: "sheet", token: "AbC123" });
  });

  test("classifyFeishuUrl: 重复括号粘贴仍正确识别 sheet token", () => {
    const messy =
      "https://advancegroup.sg.larksuite.com/sheets/AMyTsXvWShxuwLt1Qz5lOiNngOd(https://advancegroup.sg.larksuite.com/sheets/AMyTsXvWShxuwLt1Qz5lOiNngOd)";
    const r = classifyFeishuUrl(messy);
    assert.deepStrictEqual(r, { type: "sheet", token: "AMyTsXvWShxuwLt1Qz5lOiNngOd" });
  });

  test("classifyFeishuUrl: bitable", () => {
    const r = classifyFeishuUrl("https://xxx.feishu.cn/base/AbC123");
    assert.deepStrictEqual(r, { type: "bitable", token: "AbC123" });
  });

  test("classifyFeishuUrl: whiteboard", () => {
    const r = classifyFeishuUrl("https://xxx.larksuite.com/whiteboard/WbToken123");
    assert.deepStrictEqual(r, { type: "whiteboard", token: "WbToken123" });
  });

  test("classifyFeishuUrl: board 短格式", () => {
    const r = classifyFeishuUrl("https://xxx.larksuite.com/board/BoardToken456");
    assert.deepStrictEqual(r, { type: "whiteboard", token: "BoardToken456" });
  });

  test("formatFeishuDocReply: 空内容提示", () => {
    const r = formatFeishuDocReply({ ok: true, type: "docx", content: "" }, "u");
    assert.match(r, /内容为空/);
  });

  test("shouldUseBrowserFallback: bitable scope 拒绝时启用网页登录兜底", () => {
    const meta = { type: "bitable", token: "AbC123" };
    const result = {
      ok: false,
      error: "api_scope_denied",
      code: 99991672,
      msg: "Access denied. One of the following scopes is required: [bitable:app:readonly]",
    };
    assert.strictEqual(shouldUseBrowserFallback(result, meta), true);
  });

  test("shouldUseBrowserFallback: API 成功时不兜底", () => {
    const meta = { type: "wiki", token: "AbC123" };
    const result = { ok: true, type: "docx", content: "ok" };
    assert.strictEqual(shouldUseBrowserFallback(result, meta), false);
  });

  test("formatFeishuDocReply: 浏览器兜底结果包含来源", () => {
    const r = formatFeishuDocReply(
      { ok: true, type: "webpage", source: "browser_fallback", title: "T", content: "Body" },
      "u"
    );
    assert.match(r, /来源：browser_fallback/);
    assert.match(r, /标题：T/);
  });

  test("formatBitableCellValue: 展开对象和数组文本", () => {
    const value = [
      { text: "需求A" },
      { name: "张三" },
      { value: ["标签1", "标签2"] },
    ];
    assert.strictEqual(formatBitableCellValue(value), "需求A, 张三, 标签1, 标签2");
  });

  test("renderBitableTable: 避免输出 object object", () => {
    const table = renderBitableTable([
      {
        fields: {
          标题: { text: "AIX Card交易" },
          提出人: [{ name: "Kelvin" }],
          标签: [{ text: "P0" }, { text: "卡模块" }],
        },
      },
    ]);
    assert.match(table, /AIX Card交易/);
    assert.match(table, /Kelvin/);
    assert.doesNotMatch(table, /\[object Object\]/);
  });
});

// ── resource graph 相关测试 ──

describe("extractEmbeddedResourcesFromContent", () => {
  test("提取正文中的白板 URL", () => {
    const content = "参见白板 https://advancegroup.sg.larksuite.com/board/AbC123 了解详情";
    const r = extractEmbeddedResourcesFromContent(content);
    assert.strictEqual(r.length, 1);
    assert.strictEqual(r[0].type, "whiteboard");
    assert.strictEqual(r[0].token, "AbC123");
    assert.strictEqual(r[0].origin, "content_url");
  });

  test("重复白板链接去重", () => {
    const content = "https://xxx.larksuite.com/board/Same001 和 https://xxx.larksuite.com/board/Same001";
    const r = extractEmbeddedResourcesFromContent(content);
    assert.strictEqual(r.length, 1);
  });

  test("忽略非白板飞书链接", () => {
    const content = "表格 https://xxx.larksuite.com/sheets/SheetAbc 和文档 https://xxx.feishu.cn/docx/DocXyz";
    const r = extractEmbeddedResourcesFromContent(content);
    assert.strictEqual(r.length, 0);
  });

  test("空输入返回空数组", () => {
    assert.deepStrictEqual(extractEmbeddedResourcesFromContent(""), []);
    assert.deepStrictEqual(extractEmbeddedResourcesFromContent(null), []);
  });
});

describe("extractEmbeddedResourcesFromDocBlocks", () => {
  test("embed block 含白板 URL", () => {
    const r = extractEmbeddedResourcesFromDocBlocks(fixtureEmbed.items);
    const tokens = r.map((x) => x.token);
    assert.ok(tokens.includes("AbCdEfGh123"), "should find board embed token");
    assert.ok(tokens.includes("XyZ789Test"), "should find whiteboard link token");
  });

  test("text_run 内链接", () => {
    const r = extractEmbeddedResourcesFromDocBlocks(fixtureLink.items);
    assert.strictEqual(r.length, 1, "should deduplicate same token");
    assert.strictEqual(r[0].token, "SwimLane001");
  });

  test("无嵌入的 blocks 返回空", () => {
    const r = extractEmbeddedResourcesFromDocBlocks(fixtureNoEmbed.items);
    assert.strictEqual(r.length, 0);
  });

  test("空/异常输入不抛异常", () => {
    assert.deepStrictEqual(extractEmbeddedResourcesFromDocBlocks([]), []);
    assert.deepStrictEqual(extractEmbeddedResourcesFromDocBlocks(null), []);
    assert.deepStrictEqual(extractEmbeddedResourcesFromDocBlocks("bad"), []);
  });
});

describe("extractEmbeddedResources", () => {
  test("有 blocks 时 discoveryCapability 为 full", () => {
    const resource = { ok: true, type: "docx", content: "text", blocks: fixtureEmbed.items };
    const { discoveryCapability } = extractEmbeddedResources(resource);
    assert.strictEqual(discoveryCapability, "full");
  });

  test("无 blocks 但有 content 时为 content_only", () => {
    const resource = { ok: true, type: "docx", content: "https://xxx.larksuite.com/board/Tok1 stuff" };
    const { discovered, discoveryCapability } = extractEmbeddedResources(resource);
    assert.strictEqual(discoveryCapability, "content_only");
    assert.strictEqual(discovered.length, 1);
  });

  test("非 docx 类型返回空", () => {
    const resource = { ok: true, type: "sheet", content: "data" };
    const { discovered } = extractEmbeddedResources(resource);
    assert.strictEqual(discovered.length, 0);
  });
});

describe("summarizeContent", () => {
  test("短文本不截断", () => {
    assert.strictEqual(summarizeContent("hello", 100), "hello");
  });

  test("长文本截断并提示", () => {
    const long = "a".repeat(200);
    const r = summarizeContent(long, 50);
    assert.ok(r.length < 200);
    assert.match(r, /内容已截断/);
    assert.match(r, /共 200 字/);
  });
});

describe("formatFeishuResourceGraphReply", () => {
  test("无白板时不输出白板章节", () => {
    const graph = {
      ok: true, type: "docx", title: "Test", source: "api",
      content: "doc content", summary: "doc content",
      discoveryCapability: "full",
      discovered: [], children: [], failures: [],
      stats: { discoveredResources: 0, discoveredWhiteboards: 0, loadedChildren: 0, failedChildren: 0 },
      warnings: [],
    };
    const r = formatFeishuResourceGraphReply(graph, "u");
    assert.match(r, /已读取飞书资源：Test/);
    assert.match(r, /发现内嵌白板：0/);
    assert.doesNotMatch(r, /已读取白板/);
    assert.doesNotMatch(r, /未成功读取白板/);
  });

  test("有成功白板时输出白板摘要", () => {
    const graph = {
      ok: true, type: "docx", title: "Doc", source: "api",
      content: "main", summary: "main",
      discoveryCapability: "full",
      discovered: [{ type: "whiteboard", token: "T1" }],
      children: [{ result: { ok: true, title: "画板A", summary: "节点内容" } }],
      failures: [],
      stats: { discoveredResources: 1, discoveredWhiteboards: 1, loadedChildren: 1, failedChildren: 0 },
      warnings: [],
    };
    const r = formatFeishuResourceGraphReply(graph, "u");
    assert.match(r, /已读取白板/);
    assert.match(r, /画板A/);
    assert.match(r, /成功读取：1/);
  });

  test("有失败白板时输出失败清单", () => {
    const graph = {
      ok: true, type: "docx", title: "Doc", source: "api",
      content: "main", summary: "main",
      discoveryCapability: "full",
      discovered: [{ type: "whiteboard", token: "T1" }],
      children: [],
      failures: [{ token: "T1", url: "https://x/board/T1", error: "permission_denied" }],
      stats: { discoveredResources: 1, discoveredWhiteboards: 1, loadedChildren: 0, failedChildren: 1 },
      warnings: [],
    };
    const r = formatFeishuResourceGraphReply(graph, "u");
    assert.match(r, /未成功读取白板/);
    assert.match(r, /permission_denied/);
    assert.match(r, /失败：1/);
  });
});
