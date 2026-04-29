"use strict";

/**
 * 云文档 / 电子表格等「写入」场景用哪种身份：
 * - tenant_access_token：应用（机器人「小智」）身份 → 文件归在应用下，不一定出现在你的个人会话列表。
 * - user_access_token：经 OAuth 授权的用户身份 → 文件归在你名下，与在飞书客户端自己新建更接近。
 *
 * 配置（任选其一，优先级从上到下）：
 * - FEISHU_DRIVE_USER_ACCESS_TOKEN：临时用户 access_token（不推荐长期写在 env）
 * - FEISHU_DRIVE_USER_TOKEN_STORE：用户 OAuth token JSON 路径（推荐，与白板 token 文件格式相同）
 * - FEISHU_DRIVE_USE_USER_TOKEN=1 且已设置 FEISHU_DRIVE_USER_TOKEN_STORE（显式开关）
 *
 * 未配置或用户 token 不可用时回退 tenant token。
 */

const { getTenantAccessToken } = require("./feishu-tenant");
const { getValidUserAccessTokenFromStore } = require("./feishu-user-token");

async function getBearerTokenForCloudWrite() {
  const literal = (process.env.FEISHU_DRIVE_USER_ACCESS_TOKEN || "").trim();
  const store = (process.env.FEISHU_DRIVE_USER_TOKEN_STORE || "").trim();
  const forceUser = (process.env.FEISHU_DRIVE_USE_USER_TOKEN || "").trim() === "1";

  if (store) {
    const r = await getValidUserAccessTokenFromStore(store);
    if (r.ok) {
      return { token: r.token, source: r.source || "user_store", kind: "user" };
    }
    console.error("[feishu-drive-write] 用户 token（store）不可用，回退 tenant:", r.error || r.msg || r);
  } else if (forceUser) {
    console.error(
      "[feishu-drive-write] FEISHU_DRIVE_USE_USER_TOKEN=1 但未配置 FEISHU_DRIVE_USER_TOKEN_STORE，回退 tenant"
    );
  }

  if (literal) {
    return { token: literal, source: "user_env", kind: "user" };
  }

  const t = await getTenantAccessToken();
  return { token: t, source: "tenant", kind: "tenant" };
}

module.exports = {
  getBearerTokenForCloudWrite,
};
