"use strict";

const { describe, test } = require("node:test");
const assert = require("node:assert");
const os = require("os");
const path = require("path");
const axios = require("axios");

const {
  buildDryRunResult,
  buildSwimlanePayload,
  validateNodes,
} = require("../lib/feishu-whiteboard-write");
const {
  getOauthAuthorizeUrl,
  refreshUserAccessToken,
} = require("../lib/feishu-user-token");

describe("feishu-whiteboard-write", () => {
  test("dry-run preflight passes", () => {
    const result = buildDryRunResult();
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.dryRun, true);
    assert.ok(result.shapeCount >= 30);
    assert.deepStrictEqual(result.shapeValidationErrors, []);
    assert.deepStrictEqual(result.connectorValidationErrors, []);
  });

  test("payload shapes validate", () => {
    const payload = buildSwimlanePayload();
    const errors = validateNodes(payload.nodes);
    assert.deepStrictEqual(errors, []);
    assert.ok(payload.edges.length >= 20);
  });

  test("authorize url includes scope and redirect uri", () => {
    process.env.FEISHU_APP_ID = "cli_test_123";
    const url = getOauthAuthorizeUrl({
      redirectUri: "https://example.com/feishu-whiteboard/oauth/callback",
    });
    assert.match(url, /client_id=cli_test_123/);
    assert.match(url, /scope=board%3Awhiteboard%3Anode%3Acreate/);
    assert.match(url, /redirect_uri=https%3A%2F%2Fexample.com%2Ffeishu-whiteboard%2Foauth%2Fcallback/);
  });

  test("refresh request includes client credentials", async () => {
    process.env.FEISHU_APP_ID = "cli_test_123";
    process.env.FEISHU_APP_SECRET = "secret_test_456";
    process.env.FEISHU_WHITEBOARD_TOKEN_STORE = path.join(
      os.tmpdir(),
      "feishu-whiteboard-token-test.json"
    );

    const originalPost = axios.post;
    let requestBody = null;
    axios.post = async (_url, body) => {
      requestBody = body;
      return {
        status: 200,
        data: {
          access_token: "access_token_value",
          refresh_token: "refresh_token_value",
          expires_in: 7200,
          refresh_token_expires_in: 604800,
          scope: "board:whiteboard:node:create offline_access",
        },
      };
    };

    try {
      const result = await refreshUserAccessToken("refresh_token_value");
      assert.strictEqual(result.ok, true);
      assert.strictEqual(requestBody.client_id, "cli_test_123");
      assert.strictEqual(requestBody.client_secret, "secret_test_456");
      assert.strictEqual(requestBody.grant_type, "refresh_token");
      assert.strictEqual(requestBody.refresh_token, "refresh_token_value");
    } finally {
      axios.post = originalPost;
      delete process.env.FEISHU_APP_SECRET;
      delete process.env.FEISHU_WHITEBOARD_TOKEN_STORE;
    }
  });
});
