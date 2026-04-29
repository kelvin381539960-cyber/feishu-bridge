"use strict";

const { test, describe, afterEach } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const ENV_KEYS = [
  "FEISHU_API_BASE",
  "FEISHU_LARK_DOMAIN",
  "FEISHU_APP_SECRET",
  "FEISHU_APP_SECRET_FILE",
  "FEISHU_APP_ID",
];

function snapshotEnv() {
  const s = {};
  for (const k of ENV_KEYS) s[k] = process.env[k];
  return s;
}

function restoreEnv(saved) {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
}

describe("feishu-tenant", () => {
  afterEach(() => {
    delete require.cache[require.resolve("../lib/feishu-tenant.js")];
  });

  test("getFeishuApiBase: 默认国内飞书", () => {
    const saved = snapshotEnv();
    try {
      for (const k of ENV_KEYS) delete process.env[k];
      const { getFeishuApiBase } = require("../lib/feishu-tenant.js");
      assert.strictEqual(
        getFeishuApiBase(),
        "https://open.feishu.cn/open-apis"
      );
    } finally {
      restoreEnv(saved);
    }
  });

  test("getFeishuApiBase: FEISHU_LARK_DOMAIN=lark → Lark", () => {
    const saved = snapshotEnv();
    try {
      for (const k of ENV_KEYS) delete process.env[k];
      process.env.FEISHU_LARK_DOMAIN = "lark";
      const { getFeishuApiBase } = require("../lib/feishu-tenant.js");
      assert.strictEqual(
        getFeishuApiBase(),
        "https://open.larksuite.com/open-apis"
      );
    } finally {
      restoreEnv(saved);
    }
  });

  test("getFeishuApiBase: FEISHU_LARK_DOMAIN 大小写不敏感", () => {
    const saved = snapshotEnv();
    try {
      for (const k of ENV_KEYS) delete process.env[k];
      process.env.FEISHU_LARK_DOMAIN = "Lark";
      const { getFeishuApiBase } = require("../lib/feishu-tenant.js");
      assert.strictEqual(
        getFeishuApiBase(),
        "https://open.larksuite.com/open-apis"
      );
    } finally {
      restoreEnv(saved);
    }
  });

  test("getFeishuApiBase: FEISHU_API_BASE 去首尾空格", () => {
    const saved = snapshotEnv();
    try {
      for (const k of ENV_KEYS) delete process.env[k];
      process.env.FEISHU_API_BASE = "  https://x.test/apis  ";
      const { getFeishuApiBase } = require("../lib/feishu-tenant.js");
      assert.strictEqual(getFeishuApiBase(), "https://x.test/apis");
    } finally {
      restoreEnv(saved);
    }
  });

  test("getFeishuApiBase: FEISHU_API_BASE 显式优先", () => {
    const saved = snapshotEnv();
    try {
      for (const k of ENV_KEYS) delete process.env[k];
      process.env.FEISHU_LARK_DOMAIN = "lark";
      process.env.FEISHU_API_BASE = "https://example.test/open-apis";
      const { getFeishuApiBase } = require("../lib/feishu-tenant.js");
      assert.strictEqual(getFeishuApiBase(), "https://example.test/open-apis");
    } finally {
      restoreEnv(saved);
    }
  });

  test("resolveAppSecret: 环境变量优先于文件（不读默认 /etc 路径）", () => {
    const saved = snapshotEnv();
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "fb-sec-"));
    const secFile = path.join(tmp, "secret");
    const missingFile = path.join(tmp, "no-such-secret");
    fs.writeFileSync(secFile, "from-file\n", "utf8");
    try {
      delete process.env.FEISHU_APP_SECRET;
      process.env.FEISHU_APP_SECRET_FILE = missingFile;
      delete require.cache[require.resolve("../lib/feishu-tenant.js")];
      const { resolveAppSecret: r0 } = require("../lib/feishu-tenant.js");
      assert.strictEqual(r0(), "");

      process.env.FEISHU_APP_SECRET_FILE = secFile;
      delete require.cache[require.resolve("../lib/feishu-tenant.js")];
      const m1 = require("../lib/feishu-tenant.js");
      assert.strictEqual(m1.resolveAppSecret(), "from-file");

      process.env.FEISHU_APP_SECRET = "from-env";
      delete require.cache[require.resolve("../lib/feishu-tenant.js")];
      const m2 = require("../lib/feishu-tenant.js");
      assert.strictEqual(m2.resolveAppSecret(), "from-env");
    } finally {
      restoreEnv(saved);
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
